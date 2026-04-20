import { NextResponse } from "next/server"
import crypto from "crypto"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { sendPinResetCodeEmail } from "@/lib/email"
import { createRateLimiter, getClientIp } from "@/lib/rate-limit"

// =============================================================================
// POST /api/auth/forgot-pin
//
// Starts a self-service PIN reset. Takes an email address. If it matches an
// Active user, issues a 6-digit reset code by email. Always returns 200 to
// prevent account enumeration.
//
// Body: { email: string }
//
// Returns ALWAYS: { ok: true }
//
// NO auth required — this is an unauthenticated recovery flow. Rate limiting
// is the only protection against abuse (email bombing, enumeration timing).
// =============================================================================

const EXPIRES_MINUTES = 15

// Per-IP rate limit: 5 requests/hour. Prevents an attacker from using us as
// an email-spam amplifier and makes any attempt to enumerate accounts by
// timing infeasible.
const forgotPinLimiter = createRateLimiter({
  max: 5,
  windowMs: 60 * 60 * 1000,
})

interface Body {
  email?: string
}

/**
 * Hash a (code, userId) pair for storage. Binding the hash to the user_id
 * means a stolen code blob can't be replayed against a different account
 * even if the hashes collide somehow.
 */
function hashCodeForStorage(code: string, userId: string): string {
  return crypto
    .createHash("sha256")
    .update(`${code}:${userId}`)
    .digest("hex")
}

/** Generate a cryptographically random 6-digit code (leading zeros OK). */
function generateResetCode(): string {
  // 0 to 999_999 inclusive. crypto.randomInt is uniform.
  const n = crypto.randomInt(0, 1_000_000)
  return n.toString().padStart(6, "0")
}

export async function POST(request: Request) {
  const ipAddress = getClientIp(request) ?? "unknown"
  const limit = forgotPinLimiter(ipAddress)
  if (!limit.allowed) {
    // Still return 200 to preserve anti-enumeration. The rate-limit info is
    // in the response headers but the body is identical to success.
    return NextResponse.json(
      { ok: true },
      {
        status: 200,
        headers: {
          "retry-after": String(limit.retryAfterSeconds),
        },
      }
    )
  }

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ ok: true })
  }

  const email = body.email?.trim().toLowerCase()
  if (!email || !email.includes("@")) {
    return NextResponse.json({ ok: true })
  }

  let admin
  try {
    admin = getSupabaseAdmin()
  } catch (err) {
    console.error("[forgot-pin] admin client error:", err)
    return NextResponse.json({ ok: true })
  }

  // Look up the user by email. Must be Active. If the email doesn't match or
  // the account is disabled, we silently do nothing and still return 200.
  const { data: user, error: userErr } = await admin
    .from("users")
    .select("id, auth_user_id, first_names, email, status")
    .eq("email", email)
    .single()

  if (userErr || !user || user.status !== "Active") {
    // Log server-side for debugging; do not reveal to caller.
    if (userErr && userErr.code !== "PGRST116") {
      console.warn(`[forgot-pin] Lookup error for ${email}:`, userErr.message)
    }
    return NextResponse.json({ ok: true })
  }

  // Invalidate any prior unused tokens for this user — only one active
  // reset attempt at a time. An attacker who somehow grabbed an old token
  // also can't use it once a new one is issued.
  await admin
    .from("pin_reset_tokens")
    .delete()
    .eq("user_id", user.id)
    .is("used_at", null)

  const code = generateResetCode()
  const tokenHash = hashCodeForStorage(code, user.id)
  const expiresAt = new Date(Date.now() + EXPIRES_MINUTES * 60 * 1000).toISOString()

  const { error: insertErr } = await admin.from("pin_reset_tokens").insert({
    user_id: user.id,
    token_hash: tokenHash,
    expires_at: expiresAt,
    ip_address: ipAddress === "unknown" ? null : ipAddress,
  })

  if (insertErr) {
    console.error("[forgot-pin] token insert failed:", insertErr.message)
    return NextResponse.json({ ok: true })
  }

  // Fire-and-log email. A send failure is logged but not surfaced to the
  // caller (still return 200 — otherwise an attacker could probe which
  // emails are deliverable).
  const sendResult = await sendPinResetCodeEmail({
    to: user.email,
    firstName: user.first_names ?? "there",
    code,
    expiresMinutes: EXPIRES_MINUTES,
  })

  if (!sendResult.sent) {
    console.error(
      `[forgot-pin] Email delivery failed for user ${user.id}: ${sendResult.error}`
    )
  }

  return NextResponse.json({ ok: true })
}
