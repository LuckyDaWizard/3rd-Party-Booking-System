import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireSystemAdmin } from "@/lib/api-auth"

// =============================================================================
// GET /api/admin/auth-attempts
//
// Returns a grouped summary of sign-in attempts for the security dashboard.
// Each entry represents a unique PIN with:
//   - total failures in the last 15 minutes (current lockout window)
//   - whether the PIN is currently locked
//   - minutes remaining until unlock
//   - the user associated with the PIN (first names, surname, email)
//   - full list of recent attempts (capped at 50 most recent)
//
// Auth: system_admin only.
// =============================================================================

const MAX_ATTEMPTS = 5
const WINDOW_MINUTES = 15
const WINDOW_MS = WINDOW_MINUTES * 60 * 1000

interface AttemptRow {
  id: string
  pin: string
  attempted_at: string
  succeeded: boolean
  ip_address: string | null
}

interface UserLookupRow {
  pin: string
  first_names: string
  surname: string
  email: string
}

export async function GET() {
  const denied = await requireSystemAdmin()
  if (denied) return denied

  let admin
  try {
    admin = getSupabaseAdmin()
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server misconfigured" },
      { status: 500 }
    )
  }

  // Pull the last 500 attempts (any PIN, any status) — plenty for display.
  const { data: attemptsData, error: attemptsErr } = await admin
    .from("auth_attempts")
    .select("id, pin, attempted_at, succeeded, ip_address")
    .order("attempted_at", { ascending: false })
    .limit(500)

  if (attemptsErr) {
    return NextResponse.json({ error: attemptsErr.message }, { status: 500 })
  }

  const attempts = (attemptsData ?? []) as AttemptRow[]

  // Look up user info for every unique PIN we've seen.
  const uniquePins = Array.from(new Set(attempts.map((a) => a.pin)))
  let usersByPin = new Map<string, UserLookupRow>()

  if (uniquePins.length > 0) {
    const { data: userRows } = await admin
      .from("users")
      .select("pin, first_names, surname, email")
      .in("pin", uniquePins)

    usersByPin = new Map(
      ((userRows ?? []) as UserLookupRow[]).map((u) => [u.pin, u])
    )
  }

  // Group by PIN, compute lockout status.
  const windowStart = Date.now() - WINDOW_MS
  const byPin = new Map<
    string,
    {
      pin: string
      userExists: boolean
      firstNames: string | null
      surname: string | null
      email: string | null
      totalAttempts: number
      failuresInWindow: number
      locked: boolean
      minutesUntilUnlock: number | null
      lastAttemptAt: string
      lastIp: string | null
      recentAttempts: {
        id: string
        attemptedAt: string
        succeeded: boolean
        ipAddress: string | null
      }[]
    }
  >()

  for (const attempt of attempts) {
    const existing = byPin.get(attempt.pin)
    const attemptTime = new Date(attempt.attempted_at).getTime()
    const inWindow = attemptTime >= windowStart && !attempt.succeeded

    if (!existing) {
      const user = usersByPin.get(attempt.pin)
      byPin.set(attempt.pin, {
        pin: attempt.pin,
        userExists: !!user,
        firstNames: user?.first_names ?? null,
        surname: user?.surname ?? null,
        email: user?.email ?? null,
        totalAttempts: 1,
        failuresInWindow: inWindow ? 1 : 0,
        locked: false,
        minutesUntilUnlock: null,
        lastAttemptAt: attempt.attempted_at,
        lastIp: attempt.ip_address,
        recentAttempts: [
          {
            id: attempt.id,
            attemptedAt: attempt.attempted_at,
            succeeded: attempt.succeeded,
            ipAddress: attempt.ip_address,
          },
        ],
      })
    } else {
      existing.totalAttempts += 1
      if (inWindow) existing.failuresInWindow += 1
      if (existing.recentAttempts.length < 50) {
        existing.recentAttempts.push({
          id: attempt.id,
          attemptedAt: attempt.attempted_at,
          succeeded: attempt.succeeded,
          ipAddress: attempt.ip_address,
        })
      }
    }
  }

  // Compute lockout for each PIN.
  for (const entry of byPin.values()) {
    if (entry.failuresInWindow >= MAX_ATTEMPTS) {
      // Find the OLDEST failure still in the window — that's when the
      // lockout will expire (window slides).
      const failuresInWindow = entry.recentAttempts
        .filter(
          (a) =>
            !a.succeeded &&
            new Date(a.attemptedAt).getTime() >= windowStart
        )
        .sort(
          (a, b) =>
            new Date(a.attemptedAt).getTime() -
            new Date(b.attemptedAt).getTime()
        )

      if (failuresInWindow.length > 0) {
        const oldest = failuresInWindow[0]
        const unlockAt = new Date(oldest.attemptedAt).getTime() + WINDOW_MS
        const minutesLeft = Math.max(
          0,
          Math.ceil((unlockAt - Date.now()) / 60000)
        )
        entry.locked = true
        entry.minutesUntilUnlock = minutesLeft
      }
    }
  }

  // Sort: locked first, then by failures desc, then by last attempt desc.
  const entries = Array.from(byPin.values()).sort((a, b) => {
    if (a.locked !== b.locked) return a.locked ? -1 : 1
    if (a.failuresInWindow !== b.failuresInWindow)
      return b.failuresInWindow - a.failuresInWindow
    return (
      new Date(b.lastAttemptAt).getTime() -
      new Date(a.lastAttemptAt).getTime()
    )
  })

  // Summary stats.
  const totalLocked = entries.filter((e) => e.locked).length
  const totalFailures24h = attempts.filter((a) => {
    const t = new Date(a.attempted_at).getTime()
    return !a.succeeded && t >= Date.now() - 24 * 60 * 60 * 1000
  }).length

  return NextResponse.json({
    data: entries,
    summary: {
      totalLocked,
      totalFailures24h,
      windowMinutes: WINDOW_MINUTES,
      maxAttempts: MAX_ATTEMPTS,
    },
  })
}
