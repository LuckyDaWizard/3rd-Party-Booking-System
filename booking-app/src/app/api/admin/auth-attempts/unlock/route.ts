import { NextResponse } from "next/server"
import { getSupabaseAdmin, pinToEmail } from "@/lib/supabase-admin"
import { requireSystemAdminWithCaller } from "@/lib/api-auth"
import { PIN_REGEX } from "@/lib/constants"
import { writeAuditLog, getCallerIp } from "@/lib/audit-log"

// =============================================================================
// POST /api/admin/auth-attempts/unlock
//
// Clear all failed sign-in attempts for a specific PIN, immediately unlocking
// the account. Logs an audit entry.
//
// Body: { pin: string }
//
// Auth: system_admin only.
// =============================================================================

interface UnlockBody {
  pin: string
}

export async function POST(request: Request) {
  const { caller, denied } = await requireSystemAdminWithCaller()
  if (denied) return denied

  let body: UnlockBody
  try {
    body = (await request.json()) as UnlockBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!body.pin || !PIN_REGEX.test(body.pin)) {
    return NextResponse.json({ error: "Invalid PIN format" }, { status: 400 })
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

  // Look up the user (for audit log entity info). The plaintext `pin` column
  // has been dropped, so we resolve PIN -> auth.users.email via our synthetic
  // email scheme, then join with public.users on auth_user_id. If the PIN
  // has no user, we still allow the unlock — it just removes stale attempts.
  const expectedEmail = pinToEmail(body.pin)
  const { data: authList } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  })
  const authMatch = (authList?.users ?? []).find((u) => u.email === expectedEmail)

  let user: { id: string; first_names: string; surname: string } | null = null
  if (authMatch) {
    const { data: userRow } = await admin
      .from("users")
      .select("id, first_names, surname")
      .eq("auth_user_id", authMatch.id)
      .single()
    user = userRow
  }

  // Delete all failed attempts for this PIN.
  const { error: delErr } = await admin
    .from("auth_attempts")
    .delete()
    .eq("pin", body.pin)
    .eq("succeeded", false)

  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 })
  }

  // Audit log (PIN is masked).
  writeAuditLog({
    actorId: caller.id,
    actorName: caller.name,
    actorRole: caller.role,
    action: "update",
    entityType: "user",
    entityId: user?.id ?? body.pin,
    entityName: user
      ? `${user.first_names} ${user.surname}`.trim()
      : `PIN ***`,
    changes: { lockout: { old: "locked", new: "unlocked" } },
    ipAddress: getCallerIp(request),
  })

  return NextResponse.json({ ok: true })
}
