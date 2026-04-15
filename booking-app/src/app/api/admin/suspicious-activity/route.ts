import { NextResponse } from "next/server"
import { getSupabaseAdmin, pinToEmail } from "@/lib/supabase-admin"
import { requireSystemAdmin } from "@/lib/api-auth"

// =============================================================================
// GET /api/admin/suspicious-activity
//
// Read-only analysis layer over public.auth_attempts. Flags patterns that
// might indicate an attack:
//
//   CRITICAL
//     - Password spraying: 15+ distinct PINs tried from one IP in 1 hour
//     - Unknown PIN probed 5+ times (ever seen)
//     - Cracked password: 3+ failures then success for a known PIN in 15 min
//
//   WARNING
//     - Rapid probing: 5+ unknown PINs from one IP in 1 hour
//     - New-IP sign-in: successful sign-in from an IP never seen for that user
//
// Trusted IPs (from public.trusted_ips) are exempt from rapid-probing and
// password-spraying flags. They still trigger cracked-password and
// unknown-PIN-probed flags since those are meaningful regardless.
//
// Auth: system_admin only.
// =============================================================================

type Severity = "critical" | "warning"
type FlagType =
  | "password_spraying"
  | "unknown_pin_probed"
  | "cracked_password"
  | "rapid_probing"
  | "new_ip_signin"

interface Flag {
  id: string               // deterministic id for de-dupe if re-fetched
  type: FlagType
  severity: Severity
  title: string
  description: string
  firstSeenAt: string      // ISO timestamp of earliest contributing attempt
  lastSeenAt: string       // ISO timestamp of most recent contributing attempt
  ipAddress: string | null
  affectedPins: string[]   // masked form (e.g. "1●●●●6") — never raw
  userName: string | null  // if the flag relates to a known user
  attemptCount: number
}

interface AttemptRow {
  id: string
  pin: string
  attempted_at: string
  succeeded: boolean
  ip_address: string | null
}

const ONE_HOUR_MS = 60 * 60 * 1000
const CRACKED_WINDOW_MS = 15 * 60 * 1000

// Thresholds chosen to avoid false-positives during normal testing.
const RAPID_PROBING_UNKNOWN_THRESHOLD = 5        // unknown PINs from one IP / 1h
const PASSWORD_SPRAYING_DISTINCT_THRESHOLD = 15  // distinct PINs from one IP / 1h
const UNKNOWN_PIN_HEAVY_THRESHOLD = 5            // attempts on single unknown PIN (ever)
const CRACKED_PASSWORD_FAILURE_COUNT = 3         // failures before a success

function maskPin(pin: string): string {
  if (pin.length <= 2) return "●".repeat(pin.length)
  return pin.slice(0, 1) + "●".repeat(pin.length - 2) + pin.slice(-1)
}

function summariseName(u: { first_names: string; surname: string } | undefined): string | null {
  if (!u) return null
  return `${u.first_names} ${u.surname}`.trim() || null
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

  // 1. Load recent attempts.
  const { data: attemptsData, error: attemptsErr } = await admin
    .from("auth_attempts")
    .select("id, pin, attempted_at, succeeded, ip_address")
    .order("attempted_at", { ascending: false })
    .limit(2000)

  if (attemptsErr) {
    return NextResponse.json({ error: attemptsErr.message }, { status: 500 })
  }

  const attempts = (attemptsData ?? []) as AttemptRow[]

  // 2. Load trusted IPs.
  const { data: trustedRows } = await admin
    .from("trusted_ips")
    .select("ip_address")

  const trustedIps = new Set<string>(
    (trustedRows ?? []).map((r: { ip_address: string }) => r.ip_address)
  )

  // 3. Resolve each unique PIN to a user via the synthetic email scheme.
  //    (public.users.pin was dropped; we map PIN -> auth.users.email ->
  //    auth.users.id -> public.users.auth_user_id.)
  const uniquePins = Array.from(new Set(attempts.map((a) => a.pin)))
  const knownPins = new Map<string, { first_names: string; surname: string }>()

  if (uniquePins.length > 0) {
    const { data: authList } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    })
    const emailToAuthId = new Map<string, string>()
    for (const u of authList?.users ?? []) {
      if (u.email) emailToAuthId.set(u.email, u.id)
    }

    const pinToAuthId = new Map<string, string>()
    for (const pin of uniquePins) {
      const authId = emailToAuthId.get(pinToEmail(pin))
      if (authId) pinToAuthId.set(pin, authId)
    }

    const authIds = Array.from(pinToAuthId.values())
    if (authIds.length > 0) {
      const { data: userRows } = await admin
        .from("users")
        .select("auth_user_id, first_names, surname")
        .in("auth_user_id", authIds)

      const userByAuthId = new Map<
        string,
        { first_names: string; surname: string }
      >()
      for (const u of (userRows ?? []) as {
        auth_user_id: string
        first_names: string
        surname: string
      }[]) {
        if (u.auth_user_id) {
          userByAuthId.set(u.auth_user_id, {
            first_names: u.first_names,
            surname: u.surname,
          })
        }
      }

      for (const [pin, authId] of pinToAuthId.entries()) {
        const user = userByAuthId.get(authId)
        if (user) knownPins.set(pin, user)
      }
    }
  }

  const pinIsKnown = (pin: string): boolean => knownPins.has(pin)

  // 4. Compute flags.
  const flags: Flag[] = []
  const now = Date.now()
  const oneHourAgo = now - ONE_HOUR_MS

  // ---- Group attempts by IP and by PIN for analysis ----
  const byIp = new Map<string, AttemptRow[]>()
  const byPin = new Map<string, AttemptRow[]>()

  for (const attempt of attempts) {
    if (attempt.ip_address) {
      const existing = byIp.get(attempt.ip_address) ?? []
      existing.push(attempt)
      byIp.set(attempt.ip_address, existing)
    }
    const existingPin = byPin.get(attempt.pin) ?? []
    existingPin.push(attempt)
    byPin.set(attempt.pin, existingPin)
  }

  // ---- Flag: rapid probing / password spraying per IP (in last 1h) ----
  for (const [ip, ipAttempts] of byIp.entries()) {
    const trusted = trustedIps.has(ip)
    const recentFailed = ipAttempts.filter(
      (a) =>
        !a.succeeded &&
        new Date(a.attempted_at).getTime() >= oneHourAgo
    )
    if (recentFailed.length === 0) continue

    const distinctPins = new Set(recentFailed.map((a) => a.pin))
    const unknownPins = [...distinctPins].filter((p) => !pinIsKnown(p))

    const firstSeenAt = recentFailed[recentFailed.length - 1].attempted_at
    const lastSeenAt = recentFailed[0].attempted_at

    // Password spraying — 15+ distinct PINs from this IP in 1h (CRITICAL)
    if (distinctPins.size >= PASSWORD_SPRAYING_DISTINCT_THRESHOLD && !trusted) {
      flags.push({
        id: `spray-${ip}-${firstSeenAt}`,
        type: "password_spraying",
        severity: "critical",
        title: "Password spraying attempt",
        description: `${distinctPins.size} distinct PINs tried from ${ip} in the last hour (${recentFailed.length} failed attempts).`,
        firstSeenAt,
        lastSeenAt,
        ipAddress: ip,
        affectedPins: [...distinctPins].slice(0, 8).map(maskPin),
        userName: null,
        attemptCount: recentFailed.length,
      })
      continue // skip the milder rapid-probing flag — spraying supersedes it
    }

    // Rapid probing — 5+ unknown PINs from this IP in 1h (WARNING)
    if (unknownPins.length >= RAPID_PROBING_UNKNOWN_THRESHOLD && !trusted) {
      flags.push({
        id: `probe-${ip}-${firstSeenAt}`,
        type: "rapid_probing",
        severity: "warning",
        title: "Rapid PIN probing from one IP",
        description: `${unknownPins.length} unknown PINs tried from ${ip} in the last hour. May indicate scanning.`,
        firstSeenAt,
        lastSeenAt,
        ipAddress: ip,
        affectedPins: unknownPins.slice(0, 8).map(maskPin),
        userName: null,
        attemptCount: recentFailed.length,
      })
    }
  }

  // ---- Flag: heavily probed unknown PIN (CRITICAL, not exempted by trust) ----
  for (const [pin, pinAttempts] of byPin.entries()) {
    if (pinIsKnown(pin)) continue
    const failures = pinAttempts.filter((a) => !a.succeeded)
    if (failures.length < UNKNOWN_PIN_HEAVY_THRESHOLD) continue

    const firstSeenAt = failures[failures.length - 1].attempted_at
    const lastSeenAt = failures[0].attempted_at
    const ip = failures[0].ip_address

    flags.push({
      id: `unknown-${pin}-${firstSeenAt}`,
      type: "unknown_pin_probed",
      severity: "critical",
      title: "Unknown PIN probed repeatedly",
      description: `An unknown PIN ${maskPin(pin)} has been tried ${failures.length} times. No user has this PIN.`,
      firstSeenAt,
      lastSeenAt,
      ipAddress: ip,
      affectedPins: [maskPin(pin)],
      userName: null,
      attemptCount: failures.length,
    })
  }

  // ---- Flag: cracked password (N failures then success within 15 min) ----
  // For each known PIN, look for a pattern in the recent attempts.
  for (const [pin, pinAttempts] of byPin.entries()) {
    if (!pinIsKnown(pin)) continue

    // Attempts are already ordered newest-first. Walk in reverse (oldest
    // first) to preserve causal order.
    const chronological = [...pinAttempts].reverse()

    for (let i = 0; i < chronological.length; i++) {
      const candidate = chronological[i]
      if (!candidate.succeeded) continue

      const successTime = new Date(candidate.attempted_at).getTime()
      const windowStart = successTime - CRACKED_WINDOW_MS

      const precedingFailures = chronological
        .slice(0, i)
        .filter((a) => {
          const t = new Date(a.attempted_at).getTime()
          return !a.succeeded && t >= windowStart && t < successTime
        })

      if (precedingFailures.length >= CRACKED_PASSWORD_FAILURE_COUNT) {
        const user = knownPins.get(pin)
        flags.push({
          id: `cracked-${pin}-${candidate.attempted_at}`,
          type: "cracked_password",
          severity: "critical",
          title: "Possible cracked PIN",
          description: `${precedingFailures.length} failed sign-ins followed by a success for ${summariseName(user) ?? "a known user"} within 15 minutes. This may indicate a brute-forced PIN.`,
          firstSeenAt: precedingFailures[precedingFailures.length - 1].attempted_at,
          lastSeenAt: candidate.attempted_at,
          ipAddress: candidate.ip_address,
          affectedPins: [maskPin(pin)],
          userName: summariseName(user),
          attemptCount: precedingFailures.length + 1,
        })
        // Only flag the first cracked-pattern per PIN to avoid noise.
        break
      }
    }
  }

  // ---- Flag: new-IP sign-in (WARNING, not exempted by trust) ----
  for (const [pin, pinAttempts] of byPin.entries()) {
    if (!pinIsKnown(pin)) continue

    const successes = pinAttempts.filter(
      (a) => a.succeeded && a.ip_address
    )
    if (successes.length < 2) continue // need at least 2 successful sign-ins to compare

    // Latest success
    const latest = successes[0]
    // Prior IPs (all older successful sign-ins)
    const priorIps = new Set(
      successes.slice(1).map((a) => a.ip_address).filter(Boolean)
    )

    if (!latest.ip_address) continue
    if (priorIps.has(latest.ip_address)) continue

    // New IP — flag it.
    const user = knownPins.get(pin)
    const isRecent =
      new Date(latest.attempted_at).getTime() >= now - 24 * 60 * 60 * 1000

    if (isRecent) {
      flags.push({
        id: `newip-${pin}-${latest.attempted_at}`,
        type: "new_ip_signin",
        severity: "warning",
        title: "Sign-in from new IP",
        description: `${summariseName(user) ?? "A known user"} signed in from ${latest.ip_address}, an IP address not previously used.`,
        firstSeenAt: latest.attempted_at,
        lastSeenAt: latest.attempted_at,
        ipAddress: latest.ip_address,
        affectedPins: [maskPin(pin)],
        userName: summariseName(user),
        attemptCount: 1,
      })
    }
  }

  // Sort: critical first, then warning, then newest first within severity.
  flags.sort((a, b) => {
    if (a.severity !== b.severity) {
      return a.severity === "critical" ? -1 : 1
    }
    return new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime()
  })

  return NextResponse.json({
    data: flags,
    summary: {
      critical: flags.filter((f) => f.severity === "critical").length,
      warning: flags.filter((f) => f.severity === "warning").length,
      total: flags.length,
    },
  })
}
