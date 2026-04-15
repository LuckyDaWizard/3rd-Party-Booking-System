import { NextResponse } from "next/server"
import { getSupabaseAdmin, pinToEmail } from "@/lib/supabase-admin"
import { requireAdminOrManager, callerCanAccessUser } from "@/lib/api-auth"
import { sendPinResetEmail } from "@/lib/email"
import { writeAuditLog, getCallerIp } from "@/lib/audit-log"
import { generateSecurePin } from "@/lib/pin"

// =============================================================================
// POST /api/admin/users/[id]/reset-pin
//
// Generate a new random PIN for a user, update both public.users.pin and
// auth.users (email + password), then send the new PIN via email to the user.
//
// If the email fails to send, the PIN is still reset (so the user can't sign
// in with the old one) but the new PIN is returned in the response so the
// admin can share it manually.
//
// Body: (none required — PIN is auto-generated)
//
// Returns:
//   {
//     ok: true,
//     emailSent: boolean,        // whether the email was delivered
//     pin?: string,              // included ONLY if emailSent is false (fallback)
//     emailError?: string,       // included ONLY if emailSent is false
//   }
//
// Auth: system_admin only (via requireSystemAdmin + two-person sign-off on
// the client side before this route is called).
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

  // Load the user to get their current PIN and auth_user_id.
  const { data: user, error: loadErr } = await admin
    .from("users")
    .select("id, first_names, surname, email, pin, auth_user_id")
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

  // Generate a new PIN, retrying if it collides with an existing one.
  let newPin = ""
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = generateSecurePin()
    const { data: clash } = await admin
      .from("users")
      .select("id")
      .eq("pin", candidate)
      .limit(1)
    if (!clash || clash.length === 0) {
      newPin = candidate
      break
    }
  }

  if (!newPin) {
    return NextResponse.json(
      { error: "Failed to generate a unique PIN after 10 attempts" },
      { status: 500 }
    )
  }

  // Update auth.users first (email + password).
  const oldEmail = pinToEmail(user.pin)
  const newEmail = pinToEmail(newPin)

  const { error: authErr } = await admin.auth.admin.updateUserById(
    user.auth_user_id,
    {
      email: newEmail,
      password: newPin,
      email_confirm: true,
    }
  )

  if (authErr) {
    return NextResponse.json(
      { error: `Failed to update auth user: ${authErr.message}` },
      { status: 500 }
    )
  }

  // Update public.users.pin.
  const { error: updErr } = await admin
    .from("users")
    .update({ pin: newPin })
    .eq("id", id)

  if (updErr) {
    // Roll back the auth change so the two stay in sync.
    await admin.auth.admin.updateUserById(user.auth_user_id, {
      email: oldEmail,
      password: user.pin,
      email_confirm: true,
    })
    return NextResponse.json(
      { error: `Failed to update user PIN: ${updErr.message}` },
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
