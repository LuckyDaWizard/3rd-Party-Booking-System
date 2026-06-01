import { NextResponse } from "next/server"
import { getSupabaseAdmin, pinToEmail } from "@/lib/supabase-admin"
import { getSupabaseServer } from "@/lib/supabase-server"
import { PIN_REGEX } from "@/lib/constants"
import {
  checkPinThrottle,
  recordPinAttempt,
  getThrottleIp,
} from "@/lib/pin-throttle"

// =============================================================================
// POST /api/verify/manager-pin
//
// PIN-based authorisation step. Two purposes share this endpoint:
//
//   - "booking-validation" (default) — nurse verification at booking start,
//     and Start Consult handoff. ANY Active role (`user` / `unit_manager` /
//     `system_admin`) may authorise, provided they are assigned to the
//     supplied unitId (system_admin is exempt from the unit check).
//
//   - "manager-action" — high-trust supervisor override. Covers manual
//     "Mark Payment as Confirmed" and the user / client / unit management
//     re-verification gates. Restricted to `unit_manager` / `system_admin`
//     only, retaining the two-person sign-off the original endpoint
//     enforced for these actions.
//
// How it works:
//   - Does NOT use `public.users.pin` (plaintext column has been dropped).
//     Instead verifies the PIN by calling Supabase Auth's password endpoint
//     directly via fetch (a disposable token request that never touches the
//     caller's cookies or session).
//   - On a successful PIN match, looks up role + unit assignments via the
//     service-role admin client and applies the purpose-specific rules.
//
// Body:
//   {
//     pin: string                                  // 6-digit PIN
//     unitId?: string                              // unit the action targets
//     purpose?: "booking-validation"               // default if omitted
//              | "manager-action"                  // tighter, manager+ only
//   }
//
// Returns on success:
//   { valid: true, role, name }
//
// Returns on failure:
//   { valid: false }    (deliberately doesn't say WHY — don't leak whether
//                       the PIN exists, the user is wrong role, the user
//                       isn't in the unit, etc.)
//
// Auth: caller must be signed in (any role).
// =============================================================================

type Purpose = "booking-validation" | "manager-action"

interface Body {
  pin?: string
  unitId?: string | null
  purpose?: Purpose
}

/**
 * Verify a PIN by calling the Supabase Auth REST API directly.
 * Returns the matching auth user id on success, or null on failure.
 *
 * Uses fetch() instead of the Supabase SDK so there is ZERO risk of
 * touching cookies or the caller's session. The returned tokens are
 * discarded — we only need to know whether the credentials are valid.
 */
async function verifyPinAgainstAuth(pin: string): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null

  try {
    const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({
        email: pinToEmail(pin),
        password: pin,
      }),
    })

    if (!res.ok) return null
    const data = (await res.json()) as { user?: { id?: string } }
    return data.user?.id ?? null
  } catch {
    return null
  }
}

// Constant-time floor for the PIN-verification response (audit #13).
// Every code path below — wrong PIN, wrong role, wrong unit, success — is
// padded out to MIN_RESPONSE_MS before returning, so an attacker measuring
// response time can't distinguish "PIN matches no account" (skips the
// DB role / user_units lookups) from "PIN matches an account but with the
// wrong role" (runs the lookups before failing). 300ms is comfortably
// above the slowest legitimate path even on a cold connection.
const MIN_RESPONSE_MS = 300

async function padResponse(start: number): Promise<void> {
  const elapsed = Date.now() - start
  const remaining = MIN_RESPONSE_MS - elapsed
  if (remaining > 0) {
    await new Promise((r) => setTimeout(r, remaining))
  }
}

export async function POST(request: Request) {
  const start = Date.now()

  // Require any signed-in caller. Without this, an unauthenticated attacker
  // could brute-force PINs by spamming this endpoint. The 401 / 429 / 400
  // status-code paths are NOT padded — they're distinct outcomes the
  // legitimate client needs to react to (e.g. retry-after on throttle),
  // and they don't leak account existence the way the role/unit branches do.
  const sb = await getSupabaseServer()
  const {
    data: { user: caller },
  } = await sb.auth.getUser()

  if (!caller) {
    return NextResponse.json({ valid: false }, { status: 401 })
  }

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ valid: false }, { status: 400 })
  }

  const pin = body.pin?.trim()
  const unitId = body.unitId ?? null
  const purpose: Purpose = body.purpose === "manager-action"
    ? "manager-action"
    : "booking-validation"

  if (!pin || !PIN_REGEX.test(pin)) {
    await padResponse(start)
    return NextResponse.json({ valid: false })
  }

  // Step 0: Throttle. Share the auth_attempts counter with /api/auth/throttle
  // so an attacker can't pivot between endpoints to bypass the lockout.
  let admin
  try {
    admin = getSupabaseAdmin()
  } catch {
    return NextResponse.json({ valid: false }, { status: 500 })
  }

  const ipAddress = getThrottleIp(request)
  const throttle = await checkPinThrottle(admin, pin, ipAddress)
  if (throttle.locked) {
    return NextResponse.json(
      {
        valid: false,
        locked: true,
        retryAfterSeconds: throttle.retryAfterSeconds,
      },
      { status: 429 }
    )
  }

  // Step 1: Verify the PIN by attempting a Supabase Auth sign-in.
  const matchedAuthId = await verifyPinAgainstAuth(pin)
  if (!matchedAuthId) {
    await recordPinAttempt(admin, pin, false, ipAddress)
    await padResponse(start)
    return NextResponse.json({ valid: false })
  }

  // Step 2: Look up the matched user's role and unit assignments via admin.

  const { data: matched, error: lookupErr } = await admin
    .from("users")
    .select("id, first_names, surname, role, status")
    .eq("auth_user_id", matchedAuthId)
    .single()

  if (lookupErr || !matched) {
    await recordPinAttempt(admin, pin, false, ipAddress)
    await padResponse(start)
    return NextResponse.json({ valid: false })
  }

  // Role gate — tighter for "manager-action" (payment override + admin-
  // surface gates), open to all three roles for "booking-validation"
  // (nurse verification + Start Consult). The unit-scoping check below
  // applies to non-admins regardless of purpose.
  const rolesAllowed: ReadonlySet<string> =
    purpose === "manager-action"
      ? new Set(["unit_manager", "system_admin"])
      : new Set(["user", "unit_manager", "system_admin"])
  if (!rolesAllowed.has(matched.role)) {
    await recordPinAttempt(admin, pin, false, ipAddress)
    await padResponse(start)
    return NextResponse.json({ valid: false })
  }

  // Must be Active.
  if (matched.status !== "Active") {
    await recordPinAttempt(admin, pin, false, ipAddress)
    await padResponse(start)
    return NextResponse.json({ valid: false })
  }

  // system_admin authorises anything anywhere.
  if (matched.role === "system_admin") {
    await recordPinAttempt(admin, pin, true, ipAddress)
    await padResponse(start)
    return NextResponse.json({
      valid: true,
      role: matched.role,
      name: `${matched.first_names} ${matched.surname}`.trim(),
    })
  }

  // unit_manager + user: must be assigned to the supplied unitId (if any).
  if (unitId) {
    const { data: link, error: linkErr } = await admin
      .from("user_units")
      .select("unit_id")
      .eq("user_id", matched.id)
      .eq("unit_id", unitId)
      .limit(1)

    if (linkErr || !link || link.length === 0) {
      await recordPinAttempt(admin, pin, false, ipAddress)
      await padResponse(start)
      return NextResponse.json({ valid: false })
    }
  }

  await recordPinAttempt(admin, pin, true, ipAddress)
  await padResponse(start)
  return NextResponse.json({
    valid: true,
    role: matched.role,
    name: `${matched.first_names} ${matched.surname}`.trim(),
  })
}
