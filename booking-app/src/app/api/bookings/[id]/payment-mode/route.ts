import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireAuthenticated } from "@/lib/api-auth"

// =============================================================================
// GET /api/bookings/[id]/payment-mode
//
// Returns the payment mode for a booking + booking-flow flags, derived
// from the parent client. Mode flags are mutually exclusive at the UI;
// server resolves monthly_invoice first if both ever arrive TRUE.
//   {
//     mode: "gateway" | "self_collect" | "monthly_invoice",
//     skipPatientMetrics: boolean   // only meaningful for monthly_invoice
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
    .select("id, unit_id")
    .eq("id", id)
    .single()

  if (loadErr || !booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 })
  }

  if (caller.role !== "system_admin") {
    if (!booking.unit_id || !caller.unitIds.includes(booking.unit_id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  // All three flags live on the parent client. Resolve unit → client_id →
  // clients.{collect_payment_at_unit, bill_monthly, skip_patient_metrics}.
  let collectAtUnit = false
  let billMonthly = false
  let skipPatientMetrics = false
  if (booking.unit_id) {
    const { data: unit } = await admin
      .from("units")
      .select("client_id")
      .eq("id", booking.unit_id)
      .single()
    const clientId = (unit as { client_id: string | null } | null)?.client_id
    if (clientId) {
      const { data: client } = await admin
        .from("clients")
        .select("collect_payment_at_unit, bill_monthly, skip_patient_metrics")
        .eq("id", clientId)
        .single()
      const c = client as {
        collect_payment_at_unit: boolean | null
        bill_monthly: boolean | null
        skip_patient_metrics: boolean | null
      } | null
      collectAtUnit = c?.collect_payment_at_unit ?? false
      billMonthly = c?.bill_monthly ?? false
      // Sub-flag is only effective when bill_monthly is TRUE. If the DB
      // ever has skip_patient_metrics=true with bill_monthly=false (it
      // shouldn't — server PATCH clamps that), still suppress here so
      // the booking flow doesn't accidentally skip metrics for a non-
      // monthly client.
      skipPatientMetrics = billMonthly && (c?.skip_patient_metrics ?? false)
    }
  }

  // Resolution: monthly_invoice wins if both ever end up TRUE (defensive
  // — UI enforces mutual exclusion, server PATCH also clamps, but the
  // resolver shouldn't drop into self_collect for a misconfigured row).
  const mode = billMonthly
    ? "monthly_invoice"
    : collectAtUnit
      ? "self_collect"
      : "gateway"

  return NextResponse.json({ mode, skipPatientMetrics })
}
