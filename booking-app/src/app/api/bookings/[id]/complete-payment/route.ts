import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireAdminOrManager } from "@/lib/api-auth"
import { writeAuditLog, getCallerIp, bookingRef } from "@/lib/audit-log"
import { recordBookingValidator } from "@/lib/booking-validator"

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

  // Load the booking.
  const { data: booking, error: loadErr } = await admin
    .from("bookings")
    .select("id, status, first_names, surname, unit_id, payment_amount")
    .eq("id", id)
    .single()

  if (loadErr || !booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 })
  }

  // Unit scoping: unit_manager can only confirm bookings in their units.
  // system_admin can confirm any booking.
  if (caller.role === "unit_manager") {
    if (!booking.unit_id) {
      return NextResponse.json(
        { error: "Forbidden — booking is not assigned to a unit" },
        { status: 403 }
      )
    }
    if (!caller.unitIds.includes(booking.unit_id)) {
      return NextResponse.json(
        { error: "Forbidden — booking is not in your assigned units" },
        { status: 403 }
      )
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

  // Update via service role.
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
