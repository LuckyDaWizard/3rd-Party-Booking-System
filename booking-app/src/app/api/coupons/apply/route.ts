import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireAuthenticated } from "@/lib/api-auth"
import { apiError } from "@/lib/api-response"
import {
  writeAuditLog,
  getCallerIp,
  bookingRef,
  SYSTEM_ACTOR_ID,
} from "@/lib/audit-log"
import {
  checkCouponConstraints,
  resolveDiscount,
  rejectionMessage,
  codeLookupKey,
  type DbCoupon,
} from "@/lib/coupons"
import { PAYMENT_AMOUNT } from "@/lib/payfast"

// =============================================================================
// POST /api/coupons/apply
//
// Apply a coupon code to a booking. Validates every constraint server-side
// using the shared helper, writes coupon_uses, and updates the booking with
// the resolved discount.
//
// Body:
//   { code: string, bookingId: string }
//
// Returns on success:
//   {
//     ok: true,
//     code: string,
//     originalAmount: number,
//     discountAmount: number,
//     finalAmount: number,
//     description: string | null,
//   }
//
// Returns on rejection:
//   { ok: false, error: "<friendly message>" }
//
// Replace semantics: if another coupon is already on this booking, the
// existing coupon_uses row is removed first. Same coupon re-applied just
// updates the row (idempotent at the booking level).
// =============================================================================

interface Body {
  code?: string
  bookingId?: string
}

export async function POST(request: Request) {
  const { caller, denied } = await requireAuthenticated()
  if (denied) return denied

  let body: Body
  try { body = (await request.json()) as Body }
  catch { return apiError("Invalid JSON body", 400) }

  const code = (body.code ?? "").trim()
  const bookingId = (body.bookingId ?? "").trim()
  if (!code) return apiError("Missing code", 400)
  if (!bookingId) return apiError("Missing bookingId", 400)

  let admin
  try { admin = getSupabaseAdmin() }
  catch (err) {
    return apiError(err instanceof Error ? err.message : "Server misconfigured", 500)
  }

  // 1. Load booking — need its current/base amount + email + status, plus
  // the parent client's allow_coupons flag to gate this entire endpoint.
  const { data: booking, error: bookErr } = await admin
    .from("bookings")
    .select(
      "id, status, payment_amount, original_amount, email_address, coupon_id, unit_id, units(client_id, clients(allow_coupons))"
    )
    .eq("id", bookingId)
    .maybeSingle()
  if (bookErr) return apiError(bookErr.message, 500)
  if (!booking) return apiError("Booking not found", 404)

  // Per-client gate: extract the parent client's allow_coupons flag. The
  // embed comes back as either an object or a singleton-array depending on
  // Supabase's mood; handle both shapes.
  const unitEmbed = booking.units as
    | { clients: { allow_coupons: boolean | null } | { allow_coupons: boolean | null }[] | null }
    | { clients: { allow_coupons: boolean | null } | { allow_coupons: boolean | null }[] | null }[]
    | null
  const unitRow = Array.isArray(unitEmbed) ? unitEmbed[0] ?? null : unitEmbed
  const clientEmbed = unitRow?.clients ?? null
  const clientRow = Array.isArray(clientEmbed) ? clientEmbed[0] ?? null : clientEmbed
  const allowCoupons = Boolean(clientRow?.allow_coupons)
  if (!allowCoupons) {
    return NextResponse.json(
      { ok: false, error: "Coupons aren't available for this clinic." },
      { status: 403 }
    )
  }

  // Once paid / discarded / abandoned a coupon can't be added or changed.
  if (booking.status !== "In Progress") {
    return NextResponse.json(
      { ok: false, error: "Coupon can only be applied while the booking is in progress." },
      { status: 409 }
    )
  }

  // 2. Resolve the BASE amount — what we'd have charged with no coupon.
  // Prefer the booking's stored original_amount; fall back to current
  // payment_amount; fall back to the system default.
  const baseAmount = Number(
    booking.original_amount ?? booking.payment_amount ?? PAYMENT_AMOUNT
  )

  // 3. Find the coupon by case-insensitive code.
  const lookupKey = codeLookupKey(code)
  const { data: coupon } = await admin
    .from("coupons")
    .select("*")
    .filter("code", "ilike", lookupKey)
    .limit(1)
    .maybeSingle()
  if (!coupon) {
    return NextResponse.json(
      { ok: false, error: rejectionMessage("not-found") },
      { status: 404 }
    )
  }
  const c = coupon as DbCoupon

  // 4. Count uses for the constraint check. Exclude any existing row for
  // THIS booking — we replace it below, so it shouldn't count against the
  // limits when the patient is re-applying / re-typing.
  const { count: totalUsesRaw } = await admin
    .from("coupon_uses")
    .select("id", { count: "exact", head: true })
    .eq("coupon_id", c.id)
    .neq("booking_id", bookingId)
  const totalUses = totalUsesRaw ?? 0

  const patientEmail = booking.email_address
    ? String(booking.email_address).trim().toLowerCase()
    : null

  let usesForEmail = 0
  if (patientEmail) {
    const { count: emailUsesRaw } = await admin
      .from("coupon_uses")
      .select("id", { count: "exact", head: true })
      .eq("coupon_id", c.id)
      .ilike("patient_email", patientEmail)
      .neq("booking_id", bookingId)
    usesForEmail = emailUsesRaw ?? 0
  }

  // 5. Run every WooCommerce-style constraint.
  const reason = checkCouponConstraints(c, {
    patientEmail,
    bookingAmount: baseAmount,
    totalUses,
    usesForEmail,
    now: new Date().toISOString(),
  })
  if (reason) {
    return NextResponse.json(
      { ok: false, error: rejectionMessage(reason), reason },
      { status: 409 }
    )
  }

  // 6. Resolve the discount.
  const resolved = resolveDiscount(c, baseAmount)

  // 7. Write coupon_uses (upsert by booking_id — unique index enforces 1
  // row per booking). Replacing means a different coupon already there
  // gets cleared too.
  await admin.from("coupon_uses").delete().eq("booking_id", bookingId)
  const { error: useErr } = await admin.from("coupon_uses").insert({
    coupon_id: c.id,
    booking_id: bookingId,
    patient_email: patientEmail ?? "",
    original_amount: resolved.originalAmount,
    discount_amount: resolved.discountAmount,
    final_amount: resolved.finalAmount,
  })
  if (useErr) return apiError(`Failed to record coupon use: ${useErr.message}`, 500)

  // 8. Update the booking row — denormalised fields for fast list + the
  // payment_amount column that PayFast initiate / ITN / reconcile all
  // read from.
  const { error: bookUpdErr } = await admin
    .from("bookings")
    .update({
      coupon_id: c.id,
      coupon_code: c.code,
      original_amount: resolved.originalAmount,
      discount_amount: resolved.discountAmount,
      payment_amount: resolved.finalAmount,
    })
    .eq("id", bookingId)
  if (bookUpdErr) {
    // Rollback the coupon_uses insert so we don't end up with a phantom
    // use without the matching booking field.
    await admin.from("coupon_uses").delete().eq("booking_id", bookingId)
    return apiError(`Failed to update booking: ${bookUpdErr.message}`, 500)
  }

  // 9. Audit log.
  writeAuditLog({
    actorId: caller.id || SYSTEM_ACTOR_ID,
    actorName: caller.name || "System",
    actorRole: caller.role,
    action: "update",
    entityType: "booking",
    entityId: bookingId,
    entityName: `Booking ${bookingRef(bookingId)} — coupon ${c.code} applied`,
    changes: {
      "Coupon": { new: c.code },
      "Original": { new: String(resolved.originalAmount) },
      "Discount": { new: String(resolved.discountAmount) },
      "Final": { new: String(resolved.finalAmount) },
    },
    ipAddress: getCallerIp(request),
  })

  return NextResponse.json({
    ok: true,
    code: c.code,
    description: c.description,
    originalAmount: resolved.originalAmount,
    discountAmount: resolved.discountAmount,
    finalAmount: resolved.finalAmount,
  })
}
