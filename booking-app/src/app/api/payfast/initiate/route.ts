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
import { apiError } from "@/lib/api-response"

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
    return apiError(
      `Too many payment initiations. Please retry in ${limit.retryAfterSeconds}s.`,
      429,
      { headers: { "retry-after": String(limit.retryAfterSeconds) } }
    )
  }

  let body: { bookingId?: string }
  try {
    body = await request.json()
  } catch {
    return apiError("Invalid JSON body", 400)
  }

  const bookingId = body.bookingId
  if (!bookingId) {
    return apiError("bookingId is required", 400)
  }

  let config
  try {
    config = getPayfastConfig()
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Server misconfigured", 500)
  }

  // Load the booking to get patient info for PayFast
  let admin
  try {
    admin = getSupabaseAdmin()
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Server misconfigured", 500)
  }

  // Embed the booking's unit row (FK: bookings.unit_id → units.id) so we
  // resolve booking + client_id in a single round-trip instead of two
  // sequential reads (audit #17).
  const { data: booking, error: loadErr } = await admin
    .from("bookings")
    .select("id, status, first_names, surname, email_address, unit_id, payment_amount, coupon_code, units(client_id)")
    .eq("id", bookingId)
    .single()

  if (loadErr || !booking) {
    return apiError("Booking not found", 404)
  }

  // Unit scoping: non-admin callers may only initiate payments for bookings
  // in their assigned units. system_admin can initiate for any booking.
  // Bookings without a unit_id (shouldn't happen in normal flow) are treated
  // as admin-only to avoid accidental cross-unit access.
  if (caller.role !== "system_admin") {
    if (!booking.unit_id || !caller.unitIds.includes(booking.unit_id)) {
      return apiError("Forbidden — booking is not in your assigned units", 403)
    }
  }

  if (booking.status !== "In Progress") {
    return apiError(
      `Booking status is "${booking.status}", expected "In Progress"`,
      400
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
      return apiError("This client is billed monthly. Bookings auto-complete without going through the gateway.", 400)
    }
    if (c?.collect_payment_at_unit) {
      return apiError("This client collects payment directly. Use the in-unit payment confirmation flow instead.", 400)
    }
  }

  // Resolve the amount to charge. If a coupon was applied at /payment,
  // booking.payment_amount has already been set to the discounted total
  // by /api/coupons/apply. Otherwise it's null and we use the system
  // default (the original PAYMENT_AMOUNT constant). The PayFast string
  // must match the format the ITN validator expects ("325.00" style).
  const resolvedAmount =
    booking.payment_amount !== null && booking.payment_amount !== undefined
      ? Number(booking.payment_amount).toFixed(2)
      : PAYMENT_AMOUNT

  // Two independent post-check writes — UPDATE payment_amount (only when
  // there isn't one yet, so we don't clobber a coupon-discounted amount)
  // and the booking-validator snapshot — run in parallel (audit #17).
  // Both are best-effort with respect to user-facing flow; the validator
  // helper already swallows its own errors, and a failed UPDATE here
  // would surface at ITN-validation time.
  const needsAmountWrite =
    booking.payment_amount === null || booking.payment_amount === undefined
  await Promise.all([
    recordBookingValidator(admin, bookingId, caller),
    needsAmountWrite
      ? admin
          .from("bookings")
          .update({ payment_amount: parseFloat(PAYMENT_AMOUNT) })
          .eq("id", bookingId)
          .then(() => undefined)
      : Promise.resolve(),
  ])

  // Build the form data in PayFast's required field order
  const itemName = booking.coupon_code
    ? `${PAYMENT_ITEM_NAME} (coupon ${booking.coupon_code})`
    : PAYMENT_ITEM_NAME
  const formData = buildPaymentData(config, {
    bookingId,
    amount: resolvedAmount,
    itemName,
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
