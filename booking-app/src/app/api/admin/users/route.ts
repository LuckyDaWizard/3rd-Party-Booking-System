import { NextResponse } from "next/server"
import { getSupabaseAdmin, pinToEmail } from "@/lib/supabase-admin"
import { requireSystemAdmin } from "@/lib/api-auth"
import { PIN_REGEX } from "@/lib/constants"

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
  pin: string
  role: "system_admin" | "unit_manager" | "user"
  unitIds: string[]
  clientId: string | null
}

export async function POST(request: Request) {
  const denied = await requireSystemAdmin()
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
  if (!body.pin || !PIN_REGEX.test(body.pin)) errors.push("pin must be exactly 6 digits")
  if (!body.role || !["system_admin", "unit_manager", "user"].includes(body.role))
    errors.push("role must be system_admin, unit_manager, or user")
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

  // Reject PIN collisions up front so we don't half-create.
  const { data: existing, error: pinCheckErr } = await admin
    .from("users")
    .select("id")
    .eq("pin", body.pin)
    .limit(1)

  if (pinCheckErr) {
    return NextResponse.json({ error: pinCheckErr.message }, { status: 500 })
  }
  if (existing && existing.length > 0) {
    return NextResponse.json(
      { error: `PIN ${body.pin} is already in use` },
      { status: 409 }
    )
  }

  // 1. Create the auth user.
  const email = pinToEmail(body.pin)
  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email,
    password: body.pin,
    email_confirm: true,
    user_metadata: {
      first_names: body.firstNames,
      surname: body.surname,
      role: body.role,
    },
  })

  if (authErr || !authData?.user) {
    return NextResponse.json(
      { error: `Failed to create auth user: ${authErr?.message ?? "unknown"}` },
      { status: 500 }
    )
  }

  const authUserId = authData.user.id

  // 2. Create the public.users row.
  const { data: insertData, error: insertErr } = await admin
    .from("users")
    .insert({
      first_names: body.firstNames,
      surname: body.surname,
      email: body.email,
      contact_number: body.contactNumber,
      pin: body.pin,
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

  return NextResponse.json({ id: userId }, { status: 201 })
}
