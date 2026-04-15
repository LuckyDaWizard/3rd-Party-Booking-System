import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getSupabaseAdmin, pinToEmail } from "@/lib/supabase-admin"
import { getSupabaseServer } from "@/lib/supabase-server"
import { PIN_REGEX } from "@/lib/constants"

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
 * Verify a PIN against Supabase Auth using a fresh, disposable client.
 * Returns the matching auth user id on success, or null on failure.
 *
 * IMPORTANT: uses a NEW createClient instance (not getSupabaseServer or
 * getSupabaseAdmin) so this sign-in doesn't write any cookies or interfere
 * with the caller's existing session.
 */
async function verifyPinAgainstAuth(pin: string): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null

  const disposable = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  const { data, error } = await disposable.auth.signInWithPassword({
    email: pinToEmail(pin),
    password: pin,
  })

  // Always sign out the disposable session to avoid any lingering state.
  if (data.session) {
    await disposable.auth.signOut()
  }

  if (error || !data.user) return null
  return data.user.id
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

  // Step 1: Verify the PIN by attempting a Supabase Auth sign-in.
  const matchedAuthId = await verifyPinAgainstAuth(pin)
  if (!matchedAuthId) {
    return NextResponse.json({ valid: false })
  }

  // Step 2: Look up the matched user's role and unit assignments via admin.
  let admin
  try {
    admin = getSupabaseAdmin()
  } catch {
    return NextResponse.json({ valid: false }, { status: 500 })
  }

  const { data: matched, error: lookupErr } = await admin
    .from("users")
    .select("id, first_names, surname, role, status")
    .eq("auth_user_id", matchedAuthId)
    .single()

  if (lookupErr || !matched) {
    return NextResponse.json({ valid: false })
  }

  // Only unit_manager or system_admin can authorise.
  if (matched.role !== "unit_manager" && matched.role !== "system_admin") {
    return NextResponse.json({ valid: false })
  }

  // Must be Active.
  if (matched.status !== "Active") {
    return NextResponse.json({ valid: false })
  }

  // system_admin authorises anything anywhere.
  if (matched.role === "system_admin") {
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
      return NextResponse.json({ valid: false })
    }
  }

  return NextResponse.json({
    valid: true,
    role: matched.role,
    name: `${matched.first_names} ${matched.surname}`.trim(),
  })
}
