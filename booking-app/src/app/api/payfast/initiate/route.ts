import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireAuthenticated } from "@/lib/api-auth"
import { createRateLimiter } from "@/lib/rate-limit"
import {
  getPayfastConfig,
  getProcessUrl,
  generateSignature,
  buildPaymentData,
  PAYMENT_AMOUNT,
  PAYMENT_ITEM_NAME,
} from "@/lib/payfast"
import { recordBookingValidator } from "@/lib/booking-validator"

// Per-user rate limit on PayFast initiation (audit #19). A legitimate
// operator hits this once per booking — 10 per minute leaves plenty of
// headroom for honest retries on flaky networks but stops a compromised
// session from spamming the gateway.
const initiateRateLimiter = createRateLimiter({
  max: 10,
  windowMs: 60 * 1000,
})

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

  // Keyed by user id so the limit is per-account, not per-IP — multiple
  // operators behind a single NAT shouldn't share a bucket.
  const limit = initiateRateLimiter(caller.id)
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: `Too many payment initiations. Please retry in ${limit.retryAfterSeconds}s.`,
      },
      {
        status: 429,
        headers: {
          "retry-after": String(limit.retryAfterSeconds),
        },
      }
    )
  }

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

  // Embed the booking's unit row (FK: bookings.unit_id → units.id) so we
  // resolve booking + client_id in a single round-trip instead of two
  // sequential reads (audit #17).
  const { data: booking, error: loadErr } = await admin
    .from("bookings")
    .select("id, status, first_names, surname, email_address, unit_id, units(client_id)")
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

  // Defence-in-depth: refuse if the booking's parent client is configured
  // for any non-gateway billing mode. The patient-details + /payment pages
  // already route self-collect / monthly-invoice bookings to their own
  // mark-* endpoints, but this guards against any caller that tries to
  // push them through the gateway anyway. The units row was embedded in
  // the bookings query above; only the clients lookup is a separate hop.
  const unitEmbed = booking.units as
    | { client_id: string | null }
    | { client_id: string | null }[]
    | null
  const unitRow = Array.isArray(unitEmbed) ? unitEmbed[0] ?? null : unitEmbed
  const clientId = unitRow?.client_id ?? null
  if (clientId) {
    const { data: client } = await admin
      .from("clients")
      .select("collect_payment_at_unit, bill_monthly")
      .eq("id", clientId)
      .single()
    const c = client as {
      collect_payment_at_unit: boolean | null
      bill_monthly: boolean | null
    } | null
    if (c?.bill_monthly) {
      return NextResponse.json(
        {
          error:
            "This client is billed monthly. Bookings auto-complete without going through the gateway.",
        },
        { status: 400 }
      )
    }
    if (c?.collect_payment_at_unit) {
      return NextResponse.json(
        {
          error:
            "This client collects payment directly. Use the in-unit payment confirmation flow instead.",
        },
        { status: 400 }
      )
    }
  }

  // Two independent post-check writes — UPDATE payment_amount and the
  // booking-validator snapshot — run in parallel (audit #17). Both are
  // best-effort with respect to user-facing flow; the validator helper
  // already swallows its own errors, and a failed UPDATE here would
  // surface at ITN-validation time.
  await Promise.all([
    admin
      .from("bookings")
      .update({ payment_amount: parseFloat(PAYMENT_AMOUNT) })
      .eq("id", bookingId),
    recordBookingValidator(admin, bookingId, caller),
  ])

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
