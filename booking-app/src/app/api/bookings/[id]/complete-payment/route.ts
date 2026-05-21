import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireAdminOrManager } from "@/lib/api-auth"
import { writeAuditLog, getCallerIp, bookingRef } from "@/lib/audit-log"
import { recordBookingValidator } from "@/lib/booking-validator"
import { apiError } from "@/lib/api-response"
import {
  transitionStatus,
  type BookingStatus,
} from "@/lib/booking-state-machine"

// =============================================================================
// POST /api/bookings/[id]/complete-payment
//
// Manually confirm a booking as "Payment Complete".
//
// Auth: system_admin (any booking) OR unit_manager (bookings in their units).
//
// Why this is restricted:
//   The PayFast ITN callback is the authoritative source of payment
//   confirmation. This route is NOT called during the normal booking flow.
//   It exists ONLY for the rare case where an ITN genuinely fails to arrive
//   (e.g. sandbox mode with no public domain, PayFast outage) — in which
//   case an accountable supervisor must verify the payment on PayFast's
//   dashboard and then mark the booking as paid here.
//
//   Regular `user` role is NOT permitted — marking a booking as paid is a
//   financial-integrity action that requires supervisor-level oversight.
//
// Checks:
//   1. Caller must be system_admin or unit_manager (session + role lookup).
//   2. Booking must exist.
//   3. Booking must be "In Progress" (idempotent for already-paid; rejects
//      for Discarded/Abandoned).
//   4. Unit scoping: unit_manager may only confirm bookings in their own
//      assigned units. system_admin can confirm anywhere.
//
// Audit: every confirmation is logged with actor, booking id, and IP.
// =============================================================================

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: Request, context: RouteContext) {
  const { caller, denied } = await requireAdminOrManager()
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

  // Load the booking.
  const { data: booking, error: loadErr } = await admin
    .from("bookings")
    .select("id, status, first_names, surname, unit_id, payment_amount")
    .eq("id", id)
    .single()

  if (loadErr || !booking) {
    return apiError("Booking not found", 404)
  }

  // Unit scoping: unit_manager can only confirm bookings in their units.
  // system_admin can confirm any booking.
  if (caller.role === "unit_manager") {
    if (!booking.unit_id) {
      return apiError("Forbidden — booking is not assigned to a unit", 403)
    }
    if (!caller.unitIds.includes(booking.unit_id)) {
      return apiError("Forbidden — booking is not in your assigned units", 403)
    }
  }

  // Idempotency.
  if (booking.status === "Payment Complete" || booking.status === "Successful") {
    return NextResponse.json({ ok: true, alreadyComplete: true })
  }

  // Allow confirming "In Progress" bookings normally, and also "Abandoned"
  // bookings that had a payment_amount stored (meaning they reached the
  // payment step before being abandoned — e.g. user closed the success
  // page before ITN confirmation arrived). Discarded bookings remain
  // unrecoverable — those were an explicit user choice.
  if (booking.status === "Abandoned") {
    if (!booking.payment_amount) {
      return apiError("Cannot confirm payment — booking was abandoned before reaching the payment step.", 409)
    }
  } else if (booking.status !== "In Progress") {
    return apiError(`Cannot complete payment for booking with status "${booking.status}"`, 409)
  }

  // Conditional update via the canonical state machine (audit #8). Filters
  // on the current status so a concurrent writer (PayFast ITN / reconcile
  // sweep) can't double-process the same booking.
  const fromStatus = booking.status as BookingStatus
  const result = await transitionStatus(
    admin,
    id,
    fromStatus,
    "Payment Complete",
    { payment_confirmed_at: new Date().toISOString() }
  )

  if (!result.ok) {
    if (result.reason === "conflict") {
      return apiError(
        "Booking status changed while completing payment — please refresh and retry.",
        409
      )
    }
    return apiError(
      `Failed to update booking: ${result.error instanceof Error ? result.error.message : "DB error"}`,
      500
    )
  }

  // Snapshot the supervisor who manually confirmed payment — best-effort.
  await recordBookingValidator(admin, id, caller)

  // Audit log: manual payment confirmations are high-trust actions.
  const patientName =
    [booking.first_names, booking.surname].filter(Boolean).join(" ") || "Unknown patient"

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
        new: "Payment Complete (manual)",
      },
    },
    ipAddress: getCallerIp(request),
  })

  return NextResponse.json({ ok: true })
}
