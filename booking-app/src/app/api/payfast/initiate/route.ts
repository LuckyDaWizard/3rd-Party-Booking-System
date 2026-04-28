import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireAuthenticated } from "@/lib/api-auth"
import {
  getPayfastConfig,
  getProcessUrl,
  generateSignature,
  buildPaymentData,
  PAYMENT_AMOUNT,
  PAYMENT_ITEM_NAME,
} from "@/lib/payfast"

// =============================================================================
// POST /api/payfast/initiate
//
// Builds the PayFast form data + signature for a booking. The frontend uses
// the returned fields to auto-submit a hidden form to PayFast.
//
// Auth: requires a signed-in, Active user (any role). Before this guard was
// added, any caller on the internet could POST `{bookingId}` and receive the
// booking's first_names / surname / email_address in the response — enabling
// PII harvesting + booking enumeration. unit_manager and user callers are
// additionally unit-scoped against the booking's unit_id.
//
// Body: { bookingId: string }
//
// Returns:
//   {
//     paymentUrl: string,           // PayFast process URL
//     formFields: Record<string, string>,  // Hidden form fields including signature
//   }
// =============================================================================

export async function POST(request: Request) {
  const { caller, denied } = await requireAuthenticated()
  if (denied) return denied

  let body: { bookingId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const bookingId = body.bookingId
  if (!bookingId) {
    return NextResponse.json({ error: "bookingId is required" }, { status: 400 })
  }

  let config
  try {
    config = getPayfastConfig()
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server misconfigured" },
      { status: 500 }
    )
  }

  // Load the booking to get patient info for PayFast
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
    .select("id, status, first_names, surname, email_address, unit_id")
    .eq("id", bookingId)
    .single()

  if (loadErr || !booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 })
  }

  // Unit scoping: non-admin callers may only initiate payments for bookings
  // in their assigned units. system_admin can initiate for any booking.
  // Bookings without a unit_id (shouldn't happen in normal flow) are treated
  // as admin-only to avoid accidental cross-unit access.
  if (caller.role !== "system_admin") {
    if (!booking.unit_id || !caller.unitIds.includes(booking.unit_id)) {
      return NextResponse.json(
        { error: "Forbidden — booking is not in your assigned units" },
        { status: 403 }
      )
    }
  }

  if (booking.status !== "In Progress") {
    return NextResponse.json(
      { error: `Booking status is "${booking.status}", expected "In Progress"` },
      { status: 400 }
    )
  }

  // Refuse if the booking's client is configured to collect payment directly.
  // Defence-in-depth — the payment page already routes self-collect bookings
  // to /api/bookings/[id]/mark-self-collect; this guards against any caller
  // that tries to push them through the gateway anyway. The toggle now lives
  // on clients, resolved via units.client_id.
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
        .select("collect_payment_at_unit")
        .eq("id", clientId)
        .single()
      if ((client as { collect_payment_at_unit: boolean | null } | null)?.collect_payment_at_unit) {
        return NextResponse.json(
          {
            error:
              "This client collects payment directly. Use the in-unit payment confirmation flow instead.",
          },
          { status: 400 }
        )
      }
    }
  }

  // Store the payment amount on the booking for ITN validation later
  await admin
    .from("bookings")
    .update({ payment_amount: parseFloat(PAYMENT_AMOUNT) })
    .eq("id", bookingId)

  // Build the form data in PayFast's required field order
  const formData = buildPaymentData(config, {
    bookingId,
    amount: PAYMENT_AMOUNT,
    itemName: PAYMENT_ITEM_NAME,
    buyerFirstName: booking.first_names ?? undefined,
    buyerLastName: booking.surname ?? undefined,
    buyerEmail: booking.email_address ?? undefined,
  })

  // Generate the signature and append it
  const signature = generateSignature(formData, config.passphrase)
  formData.signature = signature

  return NextResponse.json({
    paymentUrl: getProcessUrl(config.testMode),
    formFields: formData,
  })
}
