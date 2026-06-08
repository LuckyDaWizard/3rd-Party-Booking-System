import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireAuthenticated } from "@/lib/api-auth"
import { writeAuditLog, getCallerIp, bookingRef } from "@/lib/audit-log"
import { PAYMENT_AMOUNT } from "@/lib/payfast"
import { recordBookingValidator } from "@/lib/booking-validator"
import { apiError } from "@/lib/api-response"
import {
  transitionStatus,
  type BookingStatus,
} from "@/lib/booking-state-machine"

// =============================================================================
// POST /api/bookings/[id]/mark-self-collect
//
// Marks a booking as Payment Complete with payment_type = 'self_collect'.
// Used when the parent client is configured to bypass the payment gateway
// (units collect the consultation fee directly). The server is the source of
// truth — it re-checks the client's collect_payment_at_unit flag before
// accepting the completion, so a malicious caller cannot forge a self-collect
// even if they spoof the booking's payment_type via the client.
//
// Auth: any authenticated user, unit-scoped against the booking's unit_id.
// system_admin bypasses unit scoping.
// =============================================================================

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: Request, context: RouteContext) {
  const { caller, denied } = await requireAuthenticated()
  if (denied) return denied

  const { id } = await context.params
  if (!id) {
    return apiError("Missing booking id", 400)
  }

  let admin
  try {
    admin = getSupabaseAdmin()
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Server misconfigured", 500)
  }

  const { data: booking, error: loadErr } = await admin
    .from("bookings")
    .select("id, status, first_names, surname, unit_id, payment_amount")
    .eq("id", id)
    .single()

  if (loadErr || !booking) {
    return apiError("Booking not found", 404)
  }

  if (!booking.unit_id) {
    return apiError("Booking has no unit assigned", 400)
  }

  if (caller.role !== "system_admin" && !caller.unitIds.includes(booking.unit_id)) {
    return apiError("Forbidden", 403)
  }

  // Server-side authority: the unit's parent client MUST have
  // collect_payment_at_unit = true. Otherwise refuse — the payment must
  // go through the gateway.
  const { data: unit, error: unitErr } = await admin
    .from("units")
    .select("unit_name, client_id")
    .eq("id", booking.unit_id)
    .single()

  if (unitErr || !unit) {
    return apiError("Unit not found", 404)
  }

  if (!unit.client_id) {
    return apiError("Unit has no client assigned", 400)
  }

  const { data: client, error: clientErr } = await admin
    .from("clients")
    .select("collect_payment_at_unit")
    .eq("id", unit.client_id)
    .single()

  if (clientErr || !client) {
    return apiError("Client not found", 404)
  }

  if (!client.collect_payment_at_unit) {
    return apiError("This client is not configured to collect payment directly. The booking must be paid via the payment gateway.", 400)
  }

  // Idempotent for already-completed bookings.
  if (booking.status === "Payment Complete" || booking.status === "Successful") {
    return NextResponse.json({ ok: true, alreadyComplete: true })
  }

  // Status carve-out — mirrors /api/bookings/[id]/complete-payment so a
  // self-collect booking that was abandoned (rare but possible: tab closed
  // mid-flow) can still be recovered. "In Progress" is the happy path;
  // "Abandoned" is recoverable only if it had reached the payment step
  // (payment_amount populated). "Discarded" remains unrecoverable —
  // that was an explicit user choice.
  if (booking.status === "Abandoned") {
    if (!booking.payment_amount) {
      return apiError("Cannot confirm payment — booking was abandoned before reaching the payment step.", 409)
    }
  } else if (booking.status !== "In Progress") {
    return apiError(`Cannot complete payment for booking with status "${booking.status}"`, 409)
  }

  // Conditional update via the canonical state machine (audit #8).
  // Preserve any coupon-discounted payment_amount that's already on the
  // row; only set the system default when the column is empty.
  const fromStatus = booking.status as BookingStatus
  const resolvedAmount =
    booking.payment_amount !== null && booking.payment_amount !== undefined
      ? Number(booking.payment_amount)
      : parseFloat(PAYMENT_AMOUNT)
  const result = await transitionStatus(
    admin,
    id,
    fromStatus,
    "Payment Complete",
    {
      payment_type: "self_collect",
      payment_amount: resolvedAmount,
      payment_confirmed_at: new Date().toISOString(),
    }
  )

  if (!result.ok) {
    if (result.reason === "conflict") {
      return apiError(
        "Booking status changed while marking self-collect — please refresh.",
        409
      )
    }
    return apiError(
      `Failed to update booking: ${result.error instanceof Error ? result.error.message : "DB error"}`,
      500
    )
  }

  // Snapshot the operator who confirmed the self-collect — best-effort,
  // fire-and-forget. Helper swallows its own errors; booking is already in
  // its final state.
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
    entityName: `[${bookingRef(id)}] Booking for ${patientName}`,
    changes: {
      "Payment Status": {
        old: booking.status,
        new: "Payment Complete (self-collect at unit)",
      },
      Unit: { new: unit.unit_name ?? booking.unit_id },
    },
    ipAddress: getCallerIp(request),
  })

  return NextResponse.json({ ok: true })
}
