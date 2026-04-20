import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getSupabaseServer } from "@/lib/supabase-server"
import { PIN_REGEX } from "@/lib/constants"
import {
  checkPinThrottle,
  recordPinAttempt,
  getThrottleIp,
  MAX_ATTEMPTS_PER_PIN,
} from "@/lib/pin-throttle"

// =============================================================================
// POST /api/auth/throttle
//
// Server-side brute-force protection for PIN sign-in. Shares its backing
// store (auth_attempts) with /api/verify/manager-pin so an attacker cannot
// flip between the two endpoints to bypass a lockout.
//
// Actions:
//   - "check"  — returns { locked, retryAfterSeconds?, reason? }
//   - "record" — record an attempt (succeeded or failed). Returns
//                { locked, attemptsRemaining, reason? }
//
// Body:
//   { action: "check" | "record", pin: string, succeeded?: boolean }
//
// CLIENT TRUST NOTE:
//   The client reports `succeeded: true` after Supabase Auth signs it in,
//   but we DON'T trust the flag. We verify by reading the server's session
//   cookie via getSupabaseServer() — if there's no authenticated user,
//   any `succeeded: true` claim is ignored and the attempt is recorded
//   as a failure.
//
// NO auth guard — this is called before sign-in by unauthenticated users.
// The throttle itself is the protection.
// =============================================================================

interface ThrottleBody {
  action: "check" | "record"
  pin: string
  succeeded?: boolean
}

export async function POST(request: Request) {
  let body: ThrottleBody
  try {
    body = (await request.json()) as ThrottleBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!body.pin || !PIN_REGEX.test(body.pin)) {
    return NextResponse.json({ error: "Invalid PIN format" }, { status: 400 })
  }

  if (body.action !== "check" && body.action !== "record") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
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

  const ipAddress = getThrottleIp(request)

  // Verify any claimed success by checking the server's session state.
  let verifiedSuccess = false
  if (body.action === "record" && body.succeeded) {
    try {
      const sb = await getSupabaseServer()
      const {
        data: { user: authUser },
      } = await sb.auth.getUser()
      verifiedSuccess = Boolean(authUser)
    } catch {
      verifiedSuccess = false
    }
  }

  if (body.action === "record") {
    await recordPinAttempt(admin, body.pin, verifiedSuccess, ipAddress)

    if (verifiedSuccess) {
      return NextResponse.json({
        locked: false,
        attemptsRemaining: MAX_ATTEMPTS_PER_PIN,
      })
    }
  }

  const status = await checkPinThrottle(admin, body.pin, ipAddress)
  return NextResponse.json(status)
}
