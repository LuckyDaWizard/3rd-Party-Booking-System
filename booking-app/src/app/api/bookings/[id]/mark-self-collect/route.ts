import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireAuthenticated } from "@/lib/api-auth"
import { writeAuditLog, getCallerIp } from "@/lib/audit-log"
import { PAYMENT_AMOUNT } from "@/lib/payfast"

// =============================================================================
// POST /api/bookings/[id]/mark-self-collect
//
// Marks a booking as Payment Complete with payment_type = 'self_collect'.
// Used when the unit is configured to bypass the payment gateway (collects
// the consultation fee directly). The server is the source of truth — it
// re-checks the unit's collect_payment_at_unit flag before accepting the
// completion, so a malicious caller cannot forge a self-collect even if
// they spoof the booking's payment_type via the client.
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
    .select("id, status, first_names, surname, unit_id")
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

  // Server-side authority check: the unit MUST have the collect_payment_at_unit
  // flag set. Otherwise refuse — the payment must go through the gateway.
  const { data: unit, error: unitErr } = await admin
    .from("units")
    .select("collect_payment_at_unit, unit_name")
    .eq("id", booking.unit_id)
    .single()

  if (unitErr || !unit) {
    return NextResponse.json({ error: "Unit not found" }, { status: 404 })
  }

  if (!unit.collect_payment_at_unit) {
    return NextResponse.json(
      {
        error:
          "This unit is not configured to collect payment directly. The booking must be paid via the payment gateway.",
      },
      { status: 400 }
    )
  }

  // Idempotent for already-completed bookings.
  if (booking.status === "Payment Complete" || booking.status === "Successful") {
    return NextResponse.json({ ok: true, alreadyComplete: true })
  }

  if (booking.status !== "In Progress") {
    return NextResponse.json(
      { error: `Cannot complete payment for booking with status "${booking.status}"` },
      { status: 409 }
    )
  }

  const { error: updErr } = await admin
    .from("bookings")
    .update({
      status: "Payment Complete",
      payment_type: "self_collect",
      payment_amount: parseFloat(PAYMENT_AMOUNT),
      payment_confirmed_at: new Date().toISOString(),
    })
    .eq("id", id)

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  const patientName =
    [booking.first_names, booking.surname].filter(Boolean).join(" ") || "Unknown patient"

  writeAuditLog({
    actorId: caller.id,
    actorName: caller.name,
    actorRole: caller.role,
    action: "update",
    entityType: "user",
    entityId: id,
    entityName: `Booking for ${patientName}`,
    changes: {
      "Payment Status": {
        old: booking.status,
        new: "Payment Complete (self-collect at unit)",
      },
      "Unit": { new: unit.unit_name ?? booking.unit_id },
    },
    ipAddress: getCallerIp(request),
  })

  return NextResponse.json({ ok: true })
}
