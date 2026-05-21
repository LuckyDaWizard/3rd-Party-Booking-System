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
// POST /api/bookings/[id]/mark-monthly-invoice
//
// Marks a booking as Payment Complete with payment_type = 'monthly_invoice'.
// Used when the parent client is configured for end-of-month invoicing
// (clients.bill_monthly = TRUE). The server is the source of truth — it
// re-checks the client's flag before accepting the completion, so a
// malicious caller cannot forge a monthly_invoice booking for a normal
// client.
//
// Auth: any authenticated user, unit-scoped against the booking's unit_id.
// system_admin bypasses unit scoping.
//
// This route is the auto-skip path: patient-details step 5 fires this on
// mount when paymentMode resolves to "monthly_invoice", with no operator
// confirmation. By design — the booking has no fee at the unit, the
// client is invoiced separately. Audit log captures the auto-skip.
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
  // bill_monthly = true. Otherwise refuse — the payment must go through
  // the gateway or self-collect path.
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
    .select("bill_monthly")
    .eq("id", unit.client_id)
    .single()

  if (clientErr || !client) {
    return apiError("Client not found", 404)
  }

  if (!client.bill_monthly) {
    return apiError("This client is not configured for monthly invoicing. The booking must be paid via the gateway or in-unit confirmation.", 400)
  }

  // Idempotent for already-completed bookings.
  if (booking.status === "Payment Complete" || booking.status === "Successful") {
    return NextResponse.json({ ok: true, alreadyComplete: true })
  }

  // Status carve-out — mirrors mark-self-collect / complete-payment:
  // "In Progress" is the happy path; "Abandoned" is recoverable only
  // if it had reached the payment step (payment_amount populated).
  if (booking.status === "Abandoned") {
    if (!booking.payment_amount) {
      return apiError("Cannot confirm payment — booking was abandoned before reaching the payment step.", 409)
    }
  } else if (booking.status !== "In Progress") {
    return apiError(`Cannot complete payment for booking with status "${booking.status}"`, 409)
  }

  // Conditional update via the canonical state machine (audit #8).
  const fromStatus = booking.status as BookingStatus
  const result = await transitionStatus(
    admin,
    id,
    fromStatus,
    "Payment Complete",
    {
      payment_type: "monthly_invoice",
      payment_amount: parseFloat(PAYMENT_AMOUNT),
      payment_confirmed_at: new Date().toISOString(),
    }
  )

  if (!result.ok) {
    if (result.reason === "conflict") {
      return apiError(
        "Booking status changed while marking monthly invoice — please refresh.",
        409
      )
    }
    return apiError(
      `Failed to update booking: ${result.error instanceof Error ? result.error.message : "DB error"}`,
      500
    )
  }

  // Snapshot the operator who triggered the auto-skip — best-effort.
  await recordBookingValidator(admin, id, caller)

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
        new: "Payment Complete (monthly invoice)",
      },
      Unit: { new: unit.unit_name ?? booking.unit_id },
    },
    ipAddress: getCallerIp(request),
  })

  return NextResponse.json({ ok: true })
}
