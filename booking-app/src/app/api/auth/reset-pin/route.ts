import { NextResponse } from "next/server"
import crypto from "crypto"
import { getSupabaseAdmin, pinToEmail } from "@/lib/supabase-admin"
import { PIN_REGEX } from "@/lib/constants"
import { writeAuditLog, getCallerIp } from "@/lib/audit-log"
import { createRateLimiter, getClientIp } from "@/lib/rate-limit"

// =============================================================================
// POST /api/auth/reset-pin
//
// Finishes a self-service PIN reset. Takes { email, code, newPin } and, if
// the (email, code) pair matches an active, unexpired, unused token row,
// updates the user's Supabase Auth password to newPin, marks the token used,
// revokes all existing sessions (so an attacker on a compromised device is
// booted), and audit-logs the reset.
//
// Body: { email: string, code: string (6 digits), newPin: string (6 digits) }
//
// Returns:
//   200 { ok: true }                         — reset successful
//   400 { ok: false, reason: "invalid" }     — code wrong, expired, used, or no matching user
//   409 { ok: false, reason: "pin-taken" }   — newPin collides with another user's synthetic email
//   429 { ok: false, reason: "rate-limited" } — too many attempts from this IP
//   500 { ok: false, reason: "server-error" } — unexpected error
//
// Rate-limited per IP to prevent brute-forcing the 6-digit code.
// NO auth required — this is the unauthenticated recovery flow.
// =============================================================================

// 10 attempts per hour per IP. The code space is 1M values, so brute force is
// already impractical within the 15-minute token TTL, but we cap it anyway.
const resetPinLimiter = createRateLimiter({
  max: 10,
  windowMs: 60 * 60 * 1000,
})

interface Body {
  email?: string
  code?: string
  newPin?: string
}

const CODE_REGEX = /^\d{6}$/

function hashCodeForStorage(code: string, userId: string): string {
  return crypto
    .createHash("sha256")
    .update(`${code}:${userId}`)
    .digest("hex")
}

interface AuthUpdateError {
  message?: string
  status?: number
}

function isDuplicateAuthError(err: AuthUpdateError | null): boolean {
  if (!err) return false
  const msg = (err.message ?? "").toLowerCase()
  return msg.includes("already registered") || msg.includes("duplicate")
}

export async function POST(request: Request) {
  const ipAddress = getClientIp(request)
  const ipKey = ipAddress ?? "unknown"
  const limit = resetPinLimiter(ipKey)
  if (!limit.allowed) {
    return NextResponse.json(
      {
        ok: false,
        reason: "rate-limited",
        retryAfterSeconds: limit.retryAfterSeconds,
      },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } }
    )
  }

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json(
      { ok: false, reason: "invalid" },
      { status: 400 }
    )
  }

  const email = body.email?.trim().toLowerCase()
  const code = body.code?.trim()
  const newPin = body.newPin?.trim()

  if (!email || !email.includes("@") || !code || !newPin) {
    return NextResponse.json(
      { ok: false, reason: "invalid" },
      { status: 400 }
    )
  }
  if (!CODE_REGEX.test(code)) {
    return NextResponse.json(
      { ok: false, reason: "invalid" },
      { status: 400 }
    )
  }
  if (!PIN_REGEX.test(newPin)) {
    return NextResponse.json(
      { ok: false, reason: "invalid" },
      { status: 400 }
    )
  }

  let admin
  try {
    admin = getSupabaseAdmin()
  } catch (err) {
    console.error("[reset-pin] admin client error:", err)
    return NextResponse.json(
      { ok: false, reason: "server-error" },
      { status: 500 }
    )
  }

  // Load the user by email. Must be Active.
  const { data: user } = await admin
    .from("users")
    .select("id, auth_user_id, first_names, surname, email, role, status")
    .eq("email", email)
    .single()

  if (!user || user.status !== "Active" || !user.auth_user_id) {
    return NextResponse.json(
      { ok: false, reason: "invalid" },
      { status: 400 }
    )
  }

  // Look up the most recent unused, unexpired token for this user.
  const nowIso = new Date().toISOString()
  const { data: token } = await admin
    .from("pin_reset_tokens")
    .select("id, token_hash, expires_at")
    .eq("user_id", user.id)
    .is("used_at", null)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .single()

  if (!token) {
    return NextResponse.json(
      { ok: false, reason: "invalid" },
      { status: 400 }
    )
  }

  const expectedHash = hashCodeForStorage(code, user.id)
  if (
    !crypto.timingSafeEqual(
      Buffer.from(token.token_hash, "hex"),
      Buffer.from(expectedHash, "hex")
    )
  ) {
    return NextResponse.json(
      { ok: false, reason: "invalid" },
      { status: 400 }
    )
  }

  // Token is valid. Attempt to update Supabase Auth with the new PIN.
  // The synthetic-email scheme means two users can't share a PIN, so a
  // collision means the user must pick another PIN.
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
    if (isDuplicateAuthError(authErr as AuthUpdateError)) {
      return NextResponse.json(
        { ok: false, reason: "pin-taken" },
        { status: 409 }
      )
    }
    console.error(
      `[reset-pin] Auth update failed for user ${user.id}:`,
      authErr.message
    )
    return NextResponse.json(
      { ok: false, reason: "server-error" },
      { status: 500 }
    )
  }

  // Mark the token used. Even if a later step fails, we want this token
  // to be single-use so it can't be replayed.
  await admin
    .from("pin_reset_tokens")
    .update({ used_at: nowIso })
    .eq("id", token.id)

  // Revoke all existing sessions — a stolen-PIN attacker continues to have
  // access on their own device even after the password changes, until the
  // refresh token expires. Deleting the session row forces a fresh sign-in.
  try {
    await admin.rpc("revoke_all_sessions_for_user", {
      target_auth_user_id: user.auth_user_id,
    })
  } catch (err) {
    // Log but don't fail the reset — the password is already changed.
    console.error(
      `[reset-pin] revoke_all_sessions_for_user RPC failed:`,
      err
    )
  }

  // Clear any outstanding failed sign-in attempts for this user's NEW pin
  // so they aren't immediately locked out. Do NOT clear per-IP failures —
  // an attacker's IP should remain in the throttle bucket.
  await admin.from("auth_attempts").delete().eq("pin", newPin).eq("succeeded", false)

  // Audit log the reset.
  writeAuditLog({
    actorId: user.id,
    actorName: `${user.first_names ?? ""} ${user.surname ?? ""}`.trim() || "Unknown",
    actorRole: (user.role ?? "user") as "system_admin" | "unit_manager" | "user",
    action: "update",
    entityType: "user",
    entityId: user.id,
    entityName: `Self-service PIN reset: ${user.email}`,
    changes: {
      "PIN": { new: "reset via /forgot-pin" },
      "Sessions": { new: "all revoked" },
    },
    ipAddress: getCallerIp(request),
  })

  return NextResponse.json({ ok: true })
}
