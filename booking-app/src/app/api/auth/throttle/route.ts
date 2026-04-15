import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { PIN_REGEX } from "@/lib/constants"

// =============================================================================
// POST /api/auth/throttle
//
// Server-side brute-force protection for PIN sign-in.
// Tracks failed sign-in attempts per PIN. After 5 failures in 15 minutes,
// the PIN is locked out for the remainder of the 15-minute window.
//
// Actions:
//   - "check"  — returns { locked: boolean, retryAfterSeconds?: number }
//   - "record" — record an attempt (succeeded or failed). Returns { locked, attemptsRemaining }
//
// Body:
//   { action: "check" | "record", pin: string, succeeded?: boolean }
//
// NO auth guard — this is called before sign-in by unauthenticated users.
// The throttle itself is the protection.
// =============================================================================

const MAX_ATTEMPTS = 5
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

  // If the caller is recording an attempt, insert first so the subsequent
  // count includes it.
  if (body.action === "record") {
    await admin.from("auth_attempts").insert({
      pin: body.pin,
      succeeded: body.succeeded ?? false,
      ip_address: ipAddress,
    })

    // If the attempt succeeded, clear all prior failed attempts for this PIN
    // so the counter resets. Users who eventually get it right shouldn't
    // remain locked out.
    if (body.succeeded) {
      await admin
        .from("auth_attempts")
        .delete()
        .eq("pin", body.pin)
        .eq("succeeded", false)

      return NextResponse.json({ locked: false, attemptsRemaining: MAX_ATTEMPTS })
    }
  }

  // Count failed attempts within the window.
  const { data: recentFailures } = await admin
    .from("auth_attempts")
    .select("attempted_at")
    .eq("pin", body.pin)
    .eq("succeeded", false)
    .gte("attempted_at", windowStart)
    .order("attempted_at", { ascending: false })

  const failureCount = recentFailures?.length ?? 0
  const locked = failureCount >= MAX_ATTEMPTS

  if (locked && recentFailures && recentFailures.length > 0) {
    // Lockout expires 15 minutes after the 5th failure (oldest failure in the window).
    const oldestInWindow = recentFailures[recentFailures.length - 1]
    const lockoutEndsAt = new Date(oldestInWindow.attempted_at).getTime() + WINDOW_MS
    const retryAfterSeconds = Math.max(0, Math.ceil((lockoutEndsAt - Date.now()) / 1000))

    return NextResponse.json({
      locked: true,
      retryAfterSeconds,
      attemptsRemaining: 0,
    })
  }

  return NextResponse.json({
    locked: false,
    attemptsRemaining: Math.max(0, MAX_ATTEMPTS - failureCount),
  })
}
