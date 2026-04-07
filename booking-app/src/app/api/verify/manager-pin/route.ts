import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"

// =============================================================================
// POST /api/verify/manager-pin
//
// Two-person sign-off verification: a `user`-role staff member needs a
// `unit_manager` (assigned to the same unit) or a `system_admin` to enter
// their PIN to authorize an action (booking creation, PIN reset, etc.).
//
// Why this is a server route, not a direct supabase query:
//   Under the Phase 5 RLS policies, an authenticated `user` can only read
//   their own row in public.users. Looking up another user's PIN to verify
//   them is forbidden — by design. The service role bypasses RLS, so the
//   lookup happens server-side and only the boolean result is returned.
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
// Auth: caller must be signed in (any role). The route is callable from any
// authenticated session because the verification flow is part of the normal
// app for `user` role. We use the service-role client only AFTER confirming
// the caller has a session.
// =============================================================================

import { getSupabaseServer } from "@/lib/supabase-server"

interface Body {
  pin?: string
  unitId?: string | null
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

  if (!pin || !/^\d{4,6}$/.test(pin)) {
    return NextResponse.json({ valid: false })
  }

  let admin
  try {
    admin = getSupabaseAdmin()
  } catch {
    return NextResponse.json({ valid: false }, { status: 500 })
  }

  // Look up the user with that PIN. Service role bypasses RLS.
  const { data: matches, error } = await admin
    .from("users")
    .select("id, first_names, surname, role, status")
    .eq("pin", pin)
    .eq("status", "Active")
    .in("role", ["unit_manager", "system_admin"])
    .limit(1)

  if (error || !matches || matches.length === 0) {
    return NextResponse.json({ valid: false })
  }

  const matched = matches[0]

  // system_admin authorizes anything anywhere.
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
