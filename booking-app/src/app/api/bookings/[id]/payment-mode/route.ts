import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireAuthenticated } from "@/lib/api-auth"

// =============================================================================
// GET /api/bookings/[id]/payment-mode
//
// Returns the payment mode for a booking, derived from the parent client's
// billing flags (mutually exclusive at the UI; server resolves
// monthly_invoice first if both ever arrive TRUE):
//   { mode: "gateway" }          → normal PayFast flow
//   { mode: "self_collect" }     → unit collects fee directly, skip gateway
//   { mode: "monthly_invoice" }  → skip payment step entirely, client
//                                  invoiced at month-end. Caller should
//                                  auto-mark complete and bypass step 5.
//
// The patient-details step-5 picker and the /payment page both call this on
// mount so they can render the right UI without speculatively initiating a
// PayFast payment.
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

  // Both flags live on the parent client. Resolve unit → client_id →
  // clients.{collect_payment_at_unit, bill_monthly}.
  let collectAtUnit = false
  let billMonthly = false
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
        .select("collect_payment_at_unit, bill_monthly")
        .eq("id", clientId)
        .single()
      collectAtUnit =
        (client as { collect_payment_at_unit: boolean | null } | null)
          ?.collect_payment_at_unit ?? false
      billMonthly =
        (client as { bill_monthly: boolean | null } | null)
          ?.bill_monthly ?? false
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

  return NextResponse.json({ mode })
}
