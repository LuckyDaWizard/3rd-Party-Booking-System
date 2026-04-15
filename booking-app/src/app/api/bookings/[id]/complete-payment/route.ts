import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getSupabaseServer } from "@/lib/supabase-server"

// =============================================================================
// POST /api/bookings/[id]/complete-payment
//
// Mark a booking as "Payment Complete" server-side. This is the fallback
// path used by the payment success page when the PayFast ITN callback
// doesn't arrive (common in sandbox mode without a public domain).
//
// Why this route exists:
//   - Migration 011 revoked UPDATE on the bookings.status column from
//     authenticated users when transitioning to "Payment Complete" or
//     "Successful" (enforced by a DB trigger). Only service_role may do it.
//   - The browser used to call booking-store.completePayment() which wrote
//     to Supabase directly — that now fails.
//   - This route uses the service-role admin client to perform the update
//     on behalf of a verified authenticated caller.
//
// Checks performed:
//   1. Caller must have a valid Supabase session (can't be anonymous).
//   2. The booking must exist.
//   3. The booking must currently be "In Progress" (idempotency — already
//      Paid bookings are a no-op, not an error).
//   4. The caller must be able to see the booking (unit-scoped) unless
//      system_admin.
//
// Why a server-side call is still appropriate security:
//   - The ITN callback remains the authoritative source of truth (set
//     directly by PayFast, validated via 4-step check).
//   - This route is a fallback for when ITN can't reach the VPS (no public
//     domain). Once HTTPS + domain is set up, ITN will be reliable and this
//     route becomes a belt-and-braces safety net.
// =============================================================================

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: Request, context: RouteContext) {
  // 1. Verify the caller is authenticated.
  const sb = await getSupabaseServer()
  const {
    data: { user: authCaller },
  } = await sb.auth.getUser()

  if (!authCaller) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  }

  const { id } = await context.params
  if (!id) {
    return NextResponse.json({ error: "Missing booking id" }, { status: 400 })
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

  // 2. Load the caller's public.users row to get their role + unit scope.
  const { data: callerRow } = await admin
    .from("users")
    .select("id, role, status")
    .eq("auth_user_id", authCaller.id)
    .single()

  if (!callerRow || callerRow.status !== "Active") {
    return NextResponse.json({ error: "Caller not provisioned" }, { status: 403 })
  }

  // 3. Load the booking to check current state + unit scope.
  const { data: booking, error: loadErr } = await admin
    .from("bookings")
    .select("id, status, unit_id, pf_payment_id")
    .eq("id", id)
    .single()

  if (loadErr || !booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 })
  }

  // 4. Idempotency: if already Payment Complete, return success without
  // re-writing. If already terminal (Discarded/Abandoned), reject.
  if (booking.status === "Payment Complete" || booking.status === "Successful") {
    return NextResponse.json({ ok: true, alreadyComplete: true })
  }
  if (booking.status !== "In Progress") {
    return NextResponse.json(
      { error: `Cannot complete payment for booking with status "${booking.status}"` },
      { status: 409 }
    )
  }

  // 5. Unit scoping: system_admin can complete any booking, others must
  // have the booking's unit in their assigned units.
  if (callerRow.role !== "system_admin") {
    if (!booking.unit_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const { data: userUnit } = await admin
      .from("user_units")
      .select("unit_id")
      .eq("user_id", callerRow.id)
      .eq("unit_id", booking.unit_id)
      .limit(1)

    if (!userUnit || userUnit.length === 0) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  // 6. Perform the update via service role (bypasses the trigger's
  // authenticated-role check).
  const { error: updErr } = await admin
    .from("bookings")
    .update({
      status: "Payment Complete",
      payment_confirmed_at: new Date().toISOString(),
    })
    .eq("id", id)

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
