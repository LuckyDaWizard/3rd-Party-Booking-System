// =============================================================================
// pin-throttle.ts
//
// Shared brute-force protection for any PIN-verification flow.
//
// Two counters run against the same auth_attempts table so they're SHARED
// across sign-in and manager-PIN verification. This means an attacker cannot
// probe PINs via /api/verify/manager-pin to bypass the /api/auth/throttle
// lockout — both endpoints charge into the same bucket.
//
//   PER_PIN: MAX_ATTEMPTS_PER_PIN failures in WINDOW for a single PIN
//   PER_IP:  MAX_ATTEMPTS_PER_IP failures in WINDOW from a single IP
//
// Server-only. Must use the service-role admin client so RLS doesn't get in
// the way of reading/writing auth_attempts.
// =============================================================================

import type { SupabaseClient } from "@supabase/supabase-js"

export const MAX_ATTEMPTS_PER_PIN = 5
export const MAX_ATTEMPTS_PER_IP = 20
export const WINDOW_MINUTES = 15
export const WINDOW_MS = WINDOW_MINUTES * 60 * 1000

export type ThrottleLockReason = "pin" | "ip"

export interface ThrottleStatus {
  locked: boolean
  retryAfterSeconds: number
  attemptsRemaining: number
  /** Which counter tripped the lock (undefined when not locked). */
  reason?: ThrottleLockReason
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAdmin = SupabaseClient<any, any, any>

/**
 * Check current throttle state for a (pin, ipAddress) pair without writing.
 * Safe to call from any PIN-entry flow before running the actual verification.
 */
export async function checkPinThrottle(
  admin: AnyAdmin,
  pin: string,
  ipAddress: string | null
): Promise<ThrottleStatus> {
  const windowStart = new Date(Date.now() - WINDOW_MS).toISOString()

  const { data: pinFailures } = await admin
    .from("auth_attempts")
    .select("attempted_at")
    .eq("pin", pin)
    .eq("succeeded", false)
    .gte("attempted_at", windowStart)
    .order("attempted_at", { ascending: false })

  const pinFailureCount = (pinFailures ?? []).length
  const pinLocked = pinFailureCount >= MAX_ATTEMPTS_PER_PIN

  let ipFailureCount = 0
  let ipLocked = false
  let ipFailures: { attempted_at: string }[] = []
  if (ipAddress) {
    const { data } = await admin
      .from("auth_attempts")
      .select("attempted_at")
      .eq("ip_address", ipAddress)
      .eq("succeeded", false)
      .gte("attempted_at", windowStart)
      .order("attempted_at", { ascending: false })

    ipFailures = data ?? []
    ipFailureCount = ipFailures.length
    ipLocked = ipFailureCount >= MAX_ATTEMPTS_PER_IP
  }

  if (pinLocked || ipLocked) {
    let retryAfterSeconds = WINDOW_MINUTES * 60
    let reason: ThrottleLockReason = "pin"

    if (pinLocked && pinFailures && pinFailures.length > 0) {
      const oldest = pinFailures[pinFailures.length - 1]
      const lockoutEndsAt = new Date(oldest.attempted_at).getTime() + WINDOW_MS
      retryAfterSeconds = Math.max(0, Math.ceil((lockoutEndsAt - Date.now()) / 1000))
      reason = "pin"
    }
    if (ipLocked && ipFailures.length > 0) {
      const oldest = ipFailures[ipFailures.length - 1]
      const lockoutEndsAt = new Date(oldest.attempted_at).getTime() + WINDOW_MS
      const ipRetry = Math.max(0, Math.ceil((lockoutEndsAt - Date.now()) / 1000))
      if (ipRetry > retryAfterSeconds) {
        retryAfterSeconds = ipRetry
        reason = "ip"
      }
    }

    return {
      locked: true,
      retryAfterSeconds,
      attemptsRemaining: 0,
      reason,
    }
  }

  const pinRemaining = Math.max(0, MAX_ATTEMPTS_PER_PIN - pinFailureCount)
  const ipRemaining = ipAddress
    ? Math.max(0, MAX_ATTEMPTS_PER_IP - ipFailureCount)
    : MAX_ATTEMPTS_PER_PIN

  return {
    locked: false,
    retryAfterSeconds: 0,
    attemptsRemaining: Math.min(pinRemaining, ipRemaining),
  }
}

/**
 * Record a PIN verification attempt. On success, clears prior failed attempts
 * for this PIN so users aren't penalised for their own fumbling — but does
 * NOT clear per-IP failures, so an attacker can't wipe IP-level evidence by
 * completing a legitimate sign-in.
 */
export async function recordPinAttempt(
  admin: AnyAdmin,
  pin: string,
  succeeded: boolean,
  ipAddress: string | null
): Promise<void> {
  await admin.from("auth_attempts").insert({
    pin,
    succeeded,
    ip_address: ipAddress,
  })

  if (succeeded) {
    await admin
      .from("auth_attempts")
      .delete()
      .eq("pin", pin)
      .eq("succeeded", false)
  }
}

/** Helper: parse the caller IP from proxy headers. */
export function getThrottleIp(request: Request): string | null {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null
  )
}
