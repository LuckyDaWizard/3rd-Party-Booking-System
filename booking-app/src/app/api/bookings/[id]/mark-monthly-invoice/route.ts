import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireAuthenticated } from "@/lib/api-auth"
import { writeAuditLog, getCallerIp, bookingRef } from "@/lib/audit-log"
import { PAYMENT_AMOUNT } from "@/lib/payfast"
import { recordBookingValidator } from "@/lib/booking-validator"

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

  const { data: booking, error: loadErr } = await admin
    .from("bookings")
    .select("id, status, first_names, surname, unit_id, payment_amount")
    .eq("id", id)
    .single()

  if (loadErr || !booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 })
  }

  if (!booking.unit_id) {
    return NextResponse.json(
      { error: "Booking has no unit assigned" },
      { status: 400 }
    )
  }

  if (caller.role !== "system_admin" && !caller.unitIds.includes(booking.unit_id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
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
    return NextResponse.json({ error: "Unit not found" }, { status: 404 })
  }

  if (!unit.client_id) {
    return NextResponse.json(
      { error: "Unit has no client assigned" },
      { status: 400 }
    )
  }

  const { data: client, error: clientErr } = await admin
    .from("clients")
    .select("bill_monthly")
    .eq("id", unit.client_id)
    .single()

  if (clientErr || !client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 })
  }

  if (!client.bill_monthly) {
    return NextResponse.json(
      {
        error:
          "This client is not configured for monthly invoicing. The booking must be paid via the gateway or in-unit confirmation.",
      },
      { status: 400 }
    )
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
      return NextResponse.json(
        {
          error:
            "Cannot confirm payment — booking was abandoned before reaching the payment step.",
        },
        { status: 409 }
      )
    }
  } else if (booking.status !== "In Progress") {
    return NextResponse.json(
      { error: `Cannot complete payment for booking with status "${booking.status}"` },
      { status: 409 }
    )
  }

  const { error: updErr } = await admin
    .from("bookings")
    .update({
      status: "Payment Complete",
      payment_type: "monthly_invoice",
      payment_amount: parseFloat(PAYMENT_AMOUNT),
      payment_confirmed_at: new Date().toISOString(),
    })
    .eq("id", id)

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 })
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
