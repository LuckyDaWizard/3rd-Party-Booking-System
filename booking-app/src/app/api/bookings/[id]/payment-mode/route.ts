import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireAuthenticated } from "@/lib/api-auth"

// =============================================================================
// GET /api/bookings/[id]/payment-mode
//
// Returns the payment mode for a booking, derived from the booking's unit:
//   { mode: "gateway" }       → normal PayFast flow
//   { mode: "self_collect" }  → unit collects fee directly, skip gateway
//
// The payment page calls this on mount so it can render the right UI without
// hitting the PayFast initiate endpoint speculatively.
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

  let collectAtUnit = false
  if (booking.unit_id) {
    const { data: unit } = await admin
      .from("units")
      .select("collect_payment_at_unit")
      .eq("id", booking.unit_id)
      .single()
    collectAtUnit = (unit as { collect_payment_at_unit: boolean | null } | null)?.collect_payment_at_unit ?? false
  }

  return NextResponse.json({
    mode: collectAtUnit ? "self_collect" : "gateway",
  })
}
