import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireAuthenticated } from "@/lib/api-auth"
import { writeAuditLog, getCallerIp, bookingRef } from "@/lib/audit-log"
import { recordBookingValidator } from "@/lib/booking-validator"
import { apiError } from "@/lib/api-response"
import {
  transitionStatus,
  type BookingStatus,
} from "@/lib/booking-state-machine"

// =============================================================================
// POST /api/bookings/[id]/complete-coupon-comp
//
// Complete a booking whose final amount is R0 because a coupon brought it
// down to zero (e.g. a 100%-off code, or a fixed-amount coupon worth more
// than the consultation fee).
//
// Why this exists:
//   PayFast — like most payment gateways — refuses transactions with
//   amount = 0. If a patient applies a coupon that takes the bill to R0
//   and then clicks "Pay with PayFast", the initiate call would fail and
//   the patient would be stuck on the payment page.
//
//   This endpoint is the equivalent of "Pay Now" for the R0 case: it
//   transitions the booking to Payment Complete WITHOUT touching PayFast,
//   marks the payment_type as "coupon_comp" so reports can tell these
//   apart from real gateway / self-collect / monthly-invoice flows, and
//   audit-logs the action.
//
// Body: {} (no args)
//
// Returns on success:
//   { ok: true }
//
// Auth: requireAuthenticated (any role). Unit-scoped check for
// non-admins — a user can't comp a booking outside their unit.
//
// Preconditions (all rejected with 409 if violated):
//   - Booking exists and is "In Progress"
//   - A coupon is attached (booking.coupon_id IS NOT NULL)
//   - payment_amount is zero (the only legitimate case for this endpoint)
// =============================================================================

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: Request, context: RouteContext) {
  const { caller, denied } = await requireAuthenticated()
  if (denied) return denied

  const { id } = await context.params
  if (!id) return apiError("Missing booking id", 400)

  let admin
  try { admin = getSupabaseAdmin() }
  catch (err) {
    return apiError(err instanceof Error ? err.message : "Server misconfigured", 500)
  }

  const { data: booking, error: loadErr } = await admin
    .from("bookings")
    .select("id, status, first_names, surname, unit_id, payment_amount, coupon_id, coupon_code")
    .eq("id", id)
    .single()
  if (loadErr || !booking) return apiError("Booking not found", 404)

  // Unit scoping for non-admins. Matches the rule on /api/payfast/initiate.
  if (caller.role !== "system_admin") {
    if (!booking.unit_id || !caller.unitIds.includes(booking.unit_id)) {
      return apiError("Forbidden — booking is not in your assigned units", 403)
    }
  }

  // Idempotency.
  if (booking.status === "Payment Complete" || booking.status === "Successful") {
    return NextResponse.json({ ok: true, alreadyComplete: true })
  }

  if (booking.status !== "In Progress") {
    return apiError(
      `Cannot complete a coupon-comp for booking with status "${booking.status}"`,
      409
    )
  }

  // Strict preconditions — this endpoint is ONLY for the R0-after-coupon
  // path. Anything else has to go through the normal gateway / self-collect
  // / monthly-invoice flow.
  if (!booking.coupon_id) {
    return apiError(
      "This booking has no coupon — use the normal payment flow.",
      409
    )
  }
  const amount = Number(booking.payment_amount ?? -1)
  if (amount !== 0) {
    return apiError(
      "This endpoint only completes R0 bookings. The current amount is R" +
        amount.toFixed(2) +
        ".",
      409
    )
  }

  // Conditional update via the canonical state machine (audit #8). Filters
  // on the current status so a concurrent writer (PayFast retry, reconcile
  // sweep — though unlikely for R0) can't double-process.
  const fromStatus = booking.status as BookingStatus
  const result = await transitionStatus(
    admin,
    id,
    fromStatus,
    "Payment Complete",
    {
      payment_type: "coupon_comp",
      payment_confirmed_at: new Date().toISOString(),
    }
  )
  if (!result.ok) {
    if (result.reason === "conflict") {
      return apiError(
        "Booking status changed while completing the booking — please refresh and retry.",
        409
      )
    }
    return apiError(
      `Failed to update booking: ${
        result.error instanceof Error ? result.error.message : "DB error"
      }`,
      500
    )
  }

  // Snapshot the operator who comped the booking (mirrors PayFast initiate
  // + mark-self-collect — keeps the booking-validator chain populated).
  // Fire-and-forget: helper swallows its own errors and the booking row is
  // already in its final state — no reason for the response to block on it.
  void recordBookingValidator(admin, id, caller)

  const patientName =
    [booking.first_names, booking.surname].filter(Boolean).join(" ") ||
    "Unknown patient"

  writeAuditLog({
    actorId: caller.id,
    actorName: caller.name,
    actorRole: caller.role,
    action: "update",
    entityType: "booking",
    entityId: id,
    entityName: `[${bookingRef(id)}] Booking for ${patientName} — comped (coupon ${booking.coupon_code ?? "?"})`,
    changes: {
      "Payment Type": { new: "coupon_comp" },
      "Payment Amount": { new: "0.00" },
      "Coupon": { new: booking.coupon_code ?? "?" },
    },
    ipAddress: getCallerIp(request),
  })

  return NextResponse.json({ ok: true })
}
