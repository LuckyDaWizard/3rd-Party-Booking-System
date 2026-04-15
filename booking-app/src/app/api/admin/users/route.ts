import { NextResponse } from "next/server"
import { getSupabaseAdmin, pinToEmail, isDuplicateAuthError } from "@/lib/supabase-admin"
import { requireAdminOrManager } from "@/lib/api-auth"
import { sendPinResetEmail } from "@/lib/email"
import { writeAuditLog, getCallerIp } from "@/lib/audit-log"
import { generateSecurePin } from "@/lib/pin"
import type { User } from "@supabase/supabase-js"

// =============================================================================
// POST /api/admin/users
//
// Create a new app user. Writes to BOTH auth.users (so they can sign in via
// Supabase Auth in Phase 4) AND public.users, then links them via
// auth_user_id.
//
// Body:
//   {
//     firstNames: string
//     surname: string
//     email: string
//     contactNumber: string
//     pin: string             (6 digits, must be unique)
//     role: "system_admin" | "unit_manager" | "user"
//     unitIds: string[]
//     clientId: string | null
//   }
//
// Returns:
//   { id: string }   the new public.users.id
//
// Auth: NONE for now. To be locked down in Phase 4 once cookie sessions exist.
// The admin UI is the only thing that calls this route, and the admin UI
// already restricts visibility to system_admin via the AuthProvider.
// =============================================================================

interface CreateUserBody {
  firstNames: string
  surname: string
  email: string
  contactNumber: string
  role: "system_admin" | "unit_manager" | "user"
  unitIds: string[]
  clientId: string | null
}

export async function POST(request: Request) {
  const { caller, denied } = await requireAdminOrManager()
  if (denied) return denied

  let body: CreateUserBody
  try {
    body = (await request.json()) as CreateUserBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  // Validate
  const errors: string[] = []
  if (!body.firstNames?.trim()) errors.push("firstNames is required")
  if (!body.surname?.trim()) errors.push("surname is required")
  if (!body.role || !["system_admin", "unit_manager", "user"].includes(body.role))
    errors.push("role must be system_admin, unit_manager, or user")

  // unit_manager can only create 'user' role accounts
  if (caller.role === "unit_manager" && body.role !== "user") {
    return NextResponse.json(
      { error: "Unit managers can only create users with the 'user' role" },
      { status: 403 }
    )
  }

  // unit_manager can only assign to their own units
  if (caller.role === "unit_manager" && body.unitIds.length > 0) {
    const callerUnitSet = new Set(caller.unitIds)
    const unauthorized = body.unitIds.filter((uid) => !callerUnitSet.has(uid))
    if (unauthorized.length > 0) {
      return NextResponse.json(
        { error: "You can only assign users to your own units" },
        { status: 403 }
      )
    }
  }
  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join("; ") }, { status: 400 })
  }

  let admin
  try {
    admin = getSupabaseAdmin()
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server misconfigured" },
      { status: 500 }
    )
  }

  // 1. Generate a cryptographically secure PIN and create the auth user in
  // one retry loop. Supabase Auth enforces email uniqueness on our synthetic
  // emails, so a duplicate error == PIN collision. With a 1M-PIN keyspace
  // and a small user base, collisions are near-zero; 10 retries is plenty.
  let newPin = ""
  let authUser: User | null = null
  let lastAuthError: { message?: string; status?: number } | null = null

  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = generateSecurePin()
    const { data: authData, error: authErr } = await admin.auth.admin.createUser({
      email: pinToEmail(candidate),
      password: candidate,
      email_confirm: true,
      user_metadata: {
        first_names: body.firstNames,
        surname: body.surname,
        role: body.role,
      },
    })

    if (!authErr && authData?.user) {
      newPin = candidate
      authUser = authData.user
      break
    }

    lastAuthError = authErr
    if (!isDuplicateAuthError(authErr)) {
      return NextResponse.json(
        { error: `Failed to create auth user: ${authErr?.message ?? "unknown"}` },
        { status: 500 }
      )
    }
    // Collision — retry with a fresh PIN.
  }

  if (!newPin || !authUser) {
    return NextResponse.json(
      {
        error:
          "Failed to generate a unique PIN after 10 attempts" +
          (lastAuthError?.message ? `: ${lastAuthError.message}` : ""),
      },
      { status: 500 }
    )
  }

  const authUserId = authUser.id

  // 2. Create the public.users row.
  const { data: insertData, error: insertErr } = await admin
    .from("users")
    .insert({
      first_names: body.firstNames,
      surname: body.surname,
      email: body.email,
      contact_number: body.contactNumber,
      role: body.role,
      unit_id: body.unitIds[0] ?? null,
      client_id: body.clientId ?? null,
      status: "Active",
      auth_user_id: authUserId,
    })
    .select("id")
    .single()

  if (insertErr || !insertData) {
    // Rollback the auth user so we don't leak orphans.
    await admin.auth.admin.deleteUser(authUserId)
    return NextResponse.json(
      { error: `Failed to create user row: ${insertErr?.message ?? "unknown"}` },
      { status: 500 }
    )
  }

  const userId = insertData.id

  // 3. Insert user_units assignments.
  if (body.unitIds.length > 0) {
    const rows = body.unitIds.map((unitId) => ({
      user_id: userId,
      unit_id: unitId,
    }))
    const { error: junctionErr } = await admin.from("user_units").insert(rows)
    if (junctionErr) {
      // Best-effort cleanup so the user is fully removed.
      await admin.from("users").delete().eq("id", userId)
      await admin.auth.admin.deleteUser(authUserId)
      return NextResponse.json(
        { error: `Failed to assign units: ${junctionErr.message}` },
        { status: 500 }
      )
    }
  }

  // 4. Send the new user their PIN via email.
  let emailSent = false
  if (body.email) {
    const result = await sendPinResetEmail({
      to: body.email,
      firstName: body.firstNames,
      newPin: newPin,
      appUrl: "http://187.127.135.11:3000",
    })
    emailSent = result.sent
  }

  // 5. Audit log — resolve unit IDs to names for readability.
  let unitNames: string[] = []
  if (body.unitIds.length > 0) {
    const { data: unitRows } = await admin
      .from("units")
      .select("unit_name")
      .in("id", body.unitIds)
    unitNames = (unitRows ?? []).map((u: { unit_name: string }) => u.unit_name)
  }

  writeAuditLog({
    actorId: caller.id,
    actorName: caller.name,
    actorRole: caller.role,
    action: "create",
    entityType: "user",
    entityId: userId,
    entityName: `${body.firstNames} ${body.surname}`.trim(),
    changes: {
      Role: { new: body.role },
      Email: { new: body.email },
      Units: { new: unitNames.length > 0 ? unitNames : body.unitIds },
    },
    ipAddress: getCallerIp(request),
  })

  return NextResponse.json({ id: userId, pin: newPin, emailSent }, { status: 201 })
}
