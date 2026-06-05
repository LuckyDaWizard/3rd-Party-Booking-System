import { NextResponse } from "next/server"
import { getSupabaseAdmin, unwrapEmbed } from "@/lib/supabase-admin"
import { requireAuthenticated } from "@/lib/api-auth"
import { apiError } from "@/lib/api-response"

// =============================================================================
// GET /api/bookings/[id]/payment-mode
//
// Returns the payment mode for a booking + booking-flow flags, derived
// from the parent client. Mode flags are mutually exclusive at the UI;
// server resolves monthly_invoice first if both ever arrive TRUE.
//   {
//     mode: "gateway" | "self_collect" | "monthly_invoice",
//     skipPatientMetrics: boolean,  // only meaningful for monthly_invoice
//     nurseVerification: boolean    // when FALSE, booking flow skips the
//                                   // step-5 nurse-verification modal
//   }
//
// gateway          → normal PayFast flow
// self_collect     → unit collects fee directly, skip gateway
// monthly_invoice  → skip payment step entirely, client invoiced at
//                    month-end. Caller should auto-mark complete and
//                    bypass step 5. If skipPatientMetrics is also TRUE,
//                    /payment/success routes past /patient-metrics too.
//
// The patient-details step-5 picker, /payment page, and /payment/success
// + /patient-metrics safety nets all call this so the flow can branch
// without speculatively rendering an unwanted step.
//
// Auth: any authenticated user. Unit-scoped: non-admins may only ask about
// bookings in their assigned units.
// =============================================================================

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_request: Request, context: RouteContext) {
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

  // Embed the booking's unit row (FK: bookings.unit_id → units.id) so we
  // Resolve booking + unit + client flags in a single round-trip via a
  // nested embed. Previously this route did 2 round-trips per call (one
  // for booking+unit, one for clients). The booking flow hits this
  // 3-4× per booking (patient-details, /payment, /payment/success,
  // /patient-metrics), so going 2→1 saves ~3 DB calls per booking.
  const { data: booking, error: loadErr } = await admin
    .from("bookings")
    .select(
      "id, unit_id, units(client_id, clients(collect_payment_at_unit, bill_monthly, skip_patient_metrics, nurse_verification, allow_coupons))"
    )
    .eq("id", id)
    .single()

  if (loadErr || !booking) {
    return apiError("Booking not found", 404)
  }

  if (caller.role !== "system_admin") {
    if (!booking.unit_id || !caller.unitIds.includes(booking.unit_id)) {
      return apiError("Forbidden", 403)
    }
  }

  // Supabase returns embedded rows as either an object or array depending
  // on relationship cardinality; unwrapEmbed normalises both layers.
  type EmbeddedClient = {
    collect_payment_at_unit: boolean | null
    bill_monthly: boolean | null
    skip_patient_metrics: boolean | null
    nurse_verification: boolean | null
    allow_coupons: boolean | null
  }
  type EmbeddedUnit = {
    client_id: string | null
    clients: EmbeddedClient | EmbeddedClient[] | null
  }
  const unitRow = unwrapEmbed<EmbeddedUnit>(
    booking.units as EmbeddedUnit | EmbeddedUnit[] | null
  )
  const clientRow = unwrapEmbed<EmbeddedClient>(unitRow?.clients ?? null)

  // Default TRUE for nurse_verification — fail-safe: if we can't resolve
  // the client (no unit, missing row), keep the verification step. Only
  // flip to FALSE when the parent client has explicitly opted out. All
  // other flags default FALSE.
  const collectAtUnit = clientRow?.collect_payment_at_unit ?? false
  const billMonthly = clientRow?.bill_monthly ?? false
  // skip_patient_metrics is effective only when EITHER non-gateway billing
  // mode is ON. If the DB ever has skip=true with both billing flags off
  // (server PATCH clamps that, but defensively): still suppress here so
  // the booking flow doesn't accidentally skip metrics for a gateway client.
  const skipPatientMetrics =
    (billMonthly || collectAtUnit) && (clientRow?.skip_patient_metrics ?? false)
  const nurseVerification = clientRow
    ? clientRow.nurse_verification ?? false
    : true
  const allowCoupons = clientRow?.allow_coupons ?? false

  // Resolution: monthly_invoice wins if both ever end up TRUE (defensive
  // — UI enforces mutual exclusion, server PATCH also clamps, but the
  // resolver shouldn't drop into self_collect for a misconfigured row).
  const mode = billMonthly
    ? "monthly_invoice"
    : collectAtUnit
      ? "self_collect"
      : "gateway"

  return NextResponse.json({ mode, skipPatientMetrics, nurseVerification, allowCoupons })
}
