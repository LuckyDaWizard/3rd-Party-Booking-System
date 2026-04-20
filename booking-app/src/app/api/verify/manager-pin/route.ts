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
// Two-person sign-off verification: a `user`-role staff member needs a
// `unit_manager` (assigned to the same unit) or a `system_admin` to enter
// their PIN to authorize an action (booking creation, PIN reset, etc.).
//
// How it works:
//   - No longer uses `public.users.pin` (plaintext column has been dropped).
//   - Instead, verifies the PIN by attempting a Supabase Auth sign-in against
//     a disposable client (autoRefreshToken + persistSession off, never
//     touches the caller's cookies or session).
//   - If sign-in succeeds, we have a valid PIN for an existing user.
//   - We then look up the user's role, unit scoping, and status via the
//     service-role admin client and return the result.
//
// Body:
//   {
//     pin: string                              // 6-digit PIN entered
//     unitId?: string                          // optional — if provided,
//                                              // unit_managers must be
//                                              // assigned to this unit
//   }
//
// Returns on success:
//   { valid: true, role: "system_admin" | "unit_manager", name: string }
//
// Returns on failure:
//   { valid: false }    (deliberately doesn't say WHY — don't leak whether
//                       the PIN exists, the user is wrong role, the user
//                       isn't in the unit, etc.)
//
// Auth: caller must be signed in (any role).
// =============================================================================

interface Body {
  pin?: string
  unitId?: string | null
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

export async function POST(request: Request) {
  // Require any signed-in caller. Without this, an unauthenticated attacker
  // could brute-force PINs by spamming this endpoint.
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

  if (!pin || !PIN_REGEX.test(pin)) {
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
    return NextResponse.json({ valid: false })
  }

  // Only unit_manager or system_admin can authorise — treat anything else
  // as a failure from a throttle perspective, since a user-role PIN
  // shouldn't ever be entered here (still records against both counters).
  if (matched.role !== "unit_manager" && matched.role !== "system_admin") {
    await recordPinAttempt(admin, pin, false, ipAddress)
    return NextResponse.json({ valid: false })
  }

  // Must be Active.
  if (matched.status !== "Active") {
    await recordPinAttempt(admin, pin, false, ipAddress)
    return NextResponse.json({ valid: false })
  }

  // system_admin authorises anything anywhere.
  if (matched.role === "system_admin") {
    await recordPinAttempt(admin, pin, true, ipAddress)
    return NextResponse.json({
      valid: true,
      role: matched.role,
      name: `${matched.first_names} ${matched.surname}`.trim(),
    })
  }

  // unit_manager: must be assigned to the supplied unitId (if any).
  if (unitId) {
    const { data: link, error: linkErr } = await admin
      .from("user_units")
      .select("unit_id")
      .eq("user_id", matched.id)
      .eq("unit_id", unitId)
      .limit(1)

    if (linkErr || !link || link.length === 0) {
      await recordPinAttempt(admin, pin, false, ipAddress)
      return NextResponse.json({ valid: false })
    }
  }

  await recordPinAttempt(admin, pin, true, ipAddress)
  return NextResponse.json({
    valid: true,
    role: matched.role,
    name: `${matched.first_names} ${matched.surname}`.trim(),
  })
}
