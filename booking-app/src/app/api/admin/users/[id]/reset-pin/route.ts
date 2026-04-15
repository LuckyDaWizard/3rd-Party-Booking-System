import { NextResponse } from "next/server"
import { getSupabaseAdmin, pinToEmail, isDuplicateAuthError } from "@/lib/supabase-admin"
import { requireAdminOrManager, callerCanAccessUser } from "@/lib/api-auth"
import { sendPinResetEmail } from "@/lib/email"
import { writeAuditLog, getCallerIp } from "@/lib/audit-log"
import { generateSecurePin } from "@/lib/pin"

// =============================================================================
// POST /api/admin/users/[id]/reset-pin
//
// Generate a new random PIN for a user, update auth.users (email + password),
// then send the new PIN via email.
//
// PIN uniqueness is enforced by auth.users email uniqueness — we retry PIN
// generation if Supabase Auth returns a duplicate error on update.
//
// If the email fails, the PIN is still reset but returned in the response
// so the admin can share it manually.
//
// Body: (none required — PIN is auto-generated)
// =============================================================================

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: Request, context: RouteContext) {
  const { caller, denied } = await requireAdminOrManager()
  if (denied) return denied

  const { id } = await context.params
  if (!id) {
    return NextResponse.json({ error: "Missing user id" }, { status: 400 })
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

  // Load the user (no longer selecting pin — it has been dropped).
  const { data: user, error: loadErr } = await admin
    .from("users")
    .select("id, first_names, surname, email, auth_user_id")
    .eq("id", id)
    .single()

  if (loadErr || !user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  // Unit-scoping: unit_managers can only reset PINs for users in their own units.
  const hasAccess = await callerCanAccessUser(caller, id, admin)
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden — user is not in your units" }, { status: 403 })
  }

  if (!user.auth_user_id) {
    return NextResponse.json(
      { error: "User has no auth_user_id. Run the backfill script first." },
      { status: 500 }
    )
  }

  // Generate a PIN and try to apply it. Supabase Auth enforces email
  // uniqueness — if the synthetic email is taken by another user, we get a
  // duplicate error and try again with a fresh PIN. 10 retries is plenty
  // with a 1M-PIN keyspace and a small user base.
  let newPin = ""
  let lastAuthError: { message?: string; status?: number } | null = null

  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = generateSecurePin()
    const candidateEmail = pinToEmail(candidate)

    const { error: authErr } = await admin.auth.admin.updateUserById(
      user.auth_user_id,
      {
        email: candidateEmail,
        password: candidate,
        email_confirm: true,
      }
    )

    if (!authErr) {
      newPin = candidate
      break
    }

    lastAuthError = authErr
    if (!isDuplicateAuthError(authErr)) {
      // Non-collision error — bail immediately.
      return NextResponse.json(
        { error: `Failed to update auth user: ${authErr.message}` },
        { status: 500 }
      )
    }
    // Else: collision. Retry with a fresh PIN.
  }

  if (!newPin) {
    return NextResponse.json(
      {
        error:
          "Failed to generate a unique PIN after 10 attempts" +
          (lastAuthError?.message ? `: ${lastAuthError.message}` : ""),
      },
      { status: 500 }
    )
  }

  // Attempt to send the new PIN via email.
  const emailResult = await sendPinResetEmail({
    to: user.email,
    firstName: user.first_names,
    newPin,
    appUrl: "http://187.127.135.11:3000",
  })

  // Audit log (PIN values masked).
  writeAuditLog({
    actorId: caller.id,
    actorName: caller.name,
    actorRole: caller.role,
    action: "reset_pin",
    entityType: "user",
    entityId: id,
    entityName: `${user.first_names} ${user.surname}`.trim(),
    changes: { "PIN": { old: "***", new: "***" } },
    ipAddress: getCallerIp(request),
  })

  if (emailResult.sent) {
    return NextResponse.json({ ok: true, emailSent: true })
  }

  // Email failed — return the PIN so the admin can share it manually.
  return NextResponse.json({
    ok: true,
    emailSent: false,
    pin: newPin,
    emailError: emailResult.error,
  })
}
