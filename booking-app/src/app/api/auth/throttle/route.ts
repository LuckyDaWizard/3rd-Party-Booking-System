import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getSupabaseServer } from "@/lib/supabase-server"
import { PIN_REGEX } from "@/lib/constants"

// =============================================================================
// POST /api/auth/throttle
//
// Server-side brute-force protection for PIN sign-in.
//
// Two counters run in parallel — either can lock:
//
//   1. Per-PIN: MAX_ATTEMPTS_PER_PIN failures in WINDOW for a single PIN →
//      that PIN is locked (protects an individual account).
//
//   2. Per-IP:  MAX_ATTEMPTS_PER_IP failures in WINDOW from a single IP,
//      regardless of PIN → that IP is locked (protects against an attacker
//      iterating the 10^6 PIN keyspace from one source).
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
//   as a failure. This prevents an attacker from spoofing a success to
//   clear the counter.
//
// NO auth guard — this is called before sign-in by unauthenticated users.
// The throttle itself is the protection.
// =============================================================================

const MAX_ATTEMPTS_PER_PIN = 5
const MAX_ATTEMPTS_PER_IP = 20
const WINDOW_MINUTES = 15
const WINDOW_MS = WINDOW_MINUTES * 60 * 1000

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

  const windowStart = new Date(Date.now() - WINDOW_MS).toISOString()
  const ipAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null

  // Verify any claimed success by checking the server's session state.
  // Supabase's client SDK sets auth cookies after signInWithPassword, so by
  // the time the page calls us to "record", a genuine success has an
  // authenticated session attached. A lying client has no such session.
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

  // If the caller is recording an attempt, insert first so the subsequent
  // count includes it.
  if (body.action === "record") {
    await admin.from("auth_attempts").insert({
      pin: body.pin,
      succeeded: verifiedSuccess,
      ip_address: ipAddress,
    })

    // If the attempt genuinely succeeded (verified by session cookie), clear
    // prior failed attempts for this PIN so the user isn't penalised for
    // their own fumbling. Do NOT clear per-IP failures — an attacker could
    // otherwise complete their own valid sign-in to wipe out IP-level
    // evidence.
    if (verifiedSuccess) {
      await admin
        .from("auth_attempts")
        .delete()
        .eq("pin", body.pin)
        .eq("succeeded", false)

      return NextResponse.json({ locked: false, attemptsRemaining: MAX_ATTEMPTS_PER_PIN })
    }
  }

  // Count per-PIN failures within the window.
  const { data: pinFailures } = await admin
    .from("auth_attempts")
    .select("attempted_at")
    .eq("pin", body.pin)
    .eq("succeeded", false)
    .gte("attempted_at", windowStart)
    .order("attempted_at", { ascending: false })

  const pinFailureCount = pinFailures?.length ?? 0
  const pinLocked = pinFailureCount >= MAX_ATTEMPTS_PER_PIN

  // Count per-IP failures within the window. Only runs if we have an IP
  // (fallback to PIN-only if the proxy didn't forward a client IP).
  let ipFailureCount = 0
  let ipLocked = false
  let ipFailuresForRetry: { attempted_at: string }[] = []
  if (ipAddress) {
    const { data: ipFailures } = await admin
      .from("auth_attempts")
      .select("attempted_at")
      .eq("ip_address", ipAddress)
      .eq("succeeded", false)
      .gte("attempted_at", windowStart)
      .order("attempted_at", { ascending: false })

    ipFailureCount = ipFailures?.length ?? 0
    ipLocked = ipFailureCount >= MAX_ATTEMPTS_PER_IP
    ipFailuresForRetry = ipFailures ?? []
  }

  const locked = pinLocked || ipLocked

  if (locked) {
    // Determine retry: the lockout ends WINDOW_MS after the oldest failure
    // in the triggering window. Take whichever lock triggered first.
    let retryAfterSeconds = WINDOW_MINUTES * 60
    let reason: "pin" | "ip" = "pin"

    if (pinLocked && pinFailures && pinFailures.length > 0) {
      const oldest = pinFailures[pinFailures.length - 1]
      const lockoutEndsAt = new Date(oldest.attempted_at).getTime() + WINDOW_MS
      retryAfterSeconds = Math.max(0, Math.ceil((lockoutEndsAt - Date.now()) / 1000))
      reason = "pin"
    }
    if (ipLocked && ipFailuresForRetry.length > 0) {
      const oldest = ipFailuresForRetry[ipFailuresForRetry.length - 1]
      const lockoutEndsAt = new Date(oldest.attempted_at).getTime() + WINDOW_MS
      const ipRetry = Math.max(0, Math.ceil((lockoutEndsAt - Date.now()) / 1000))
      // Use the LONGER of the two retry windows so the response tells the
      // user the truth about when they can try again.
      if (ipRetry > retryAfterSeconds) {
        retryAfterSeconds = ipRetry
        reason = "ip"
      }
    }

    return NextResponse.json({
      locked: true,
      retryAfterSeconds,
      attemptsRemaining: 0,
      reason,
    })
  }

  // Not locked — report whichever bucket has fewer remaining attempts so
  // the UI can warn users approaching the threshold.
  const pinRemaining = Math.max(0, MAX_ATTEMPTS_PER_PIN - pinFailureCount)
  const ipRemaining = ipAddress
    ? Math.max(0, MAX_ATTEMPTS_PER_IP - ipFailureCount)
    : MAX_ATTEMPTS_PER_PIN

  return NextResponse.json({
    locked: false,
    attemptsRemaining: Math.min(pinRemaining, ipRemaining),
  })
}
