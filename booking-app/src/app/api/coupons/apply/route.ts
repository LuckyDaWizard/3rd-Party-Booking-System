import { NextResponse } from "next/server"
import { getSupabaseAdmin, unwrapEmbed } from "@/lib/supabase-admin"
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
  findCouponByCode,
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
      "id, status, payment_amount, original_amount, email_address, coupon_id, unit_id, units(client_id, clients(id, allow_coupons))"
    )
    .eq("id", bookingId)
    .maybeSingle()
  if (bookErr) return apiError(bookErr.message, 500)
  if (!booking) return apiError("Booking not found", 404)

  // Resolve the parent client. We need TWO things from it: the per-client
  // allow_coupons gate, AND the client_id used by per-coupon client-scope
  // restrictions inside the constraint check. Supabase embeds come back
  // as either an object or a singleton-array depending on cardinality;
  // unwrapEmbed normalises both layers to a scalar.
  type EmbeddedClient = { id?: string; allow_coupons: boolean | null }
  type EmbeddedUnit = {
    client_id?: string | null
    clients: EmbeddedClient | EmbeddedClient[] | null
  }
  const unitRow = unwrapEmbed<EmbeddedUnit>(
    booking.units as EmbeddedUnit | EmbeddedUnit[] | null
  )
  const clientRow = unwrapEmbed<EmbeddedClient>(unitRow?.clients ?? null)
  const bookingClientId = clientRow?.id ?? unitRow?.client_id ?? null
  const allowCoupons = Boolean(clientRow?.allow_coupons)
  if (!allowCoupons) {
    return NextResponse.json(
      { ok: false, error: "Coupons aren't available for this clinic." },
      { status: 403 }
    )
  }

  // Accept In Progress (normal flow) or Abandoned (operator resuming a
  // booking the idle-timer flipped). The status flip back to In Progress
  // happens as part of the booking update at the end of this function —
  // by the time the patient sees the page, the booking reflects "actively
  // being worked on".
  //
  // Paid / Discarded / Successful are NOT recoverable here — those need
  // explicit operator actions (manual confirm, manager-PIN, etc.), and
  // changing the discounted amount on a paid booking would silently break
  // payment reconciliation.
  if (booking.status !== "In Progress" && booking.status !== "Abandoned") {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Coupon can only be applied while the booking is in progress or pending resume.",
      },
      { status: 409 }
    )
  }
  const wasAbandoned = booking.status === "Abandoned"

  // 2. Resolve the BASE amount — what we'd have charged with no coupon.
  // Prefer the booking's stored original_amount; fall back to current
  // payment_amount; fall back to the system default.
  const baseAmount = Number(
    booking.original_amount ?? booking.payment_amount ?? PAYMENT_AMOUNT
  )

  // 3. Find the coupon by case-insensitive code.
  const c = await findCouponByCode<DbCoupon>(admin, code)
  if (!c) {
    return NextResponse.json(
      { ok: false, error: rejectionMessage("not-found") },
      { status: 404 }
    )
  }

  // 4. Pull every existing use for this coupon (excluding this booking's
  // row — we replace it below, so it shouldn't count against the limits
  // when the patient is re-applying / re-typing). Single round-trip
  // returning the email column, then count in JS: replaces two separate
  // `count: exact` head queries with one and lets the planner use the
  // existing coupon_uses_coupon_idx covering index.
  const { data: existingUsesData, error: usesErr } = await admin
    .from("coupon_uses")
    .select("patient_email")
    .eq("coupon_id", c.id)
    .neq("booking_id", bookingId)
  if (usesErr) {
    return apiError(`Failed to load coupon usage: ${usesErr.message}`, 500)
  }
  const existingUses = existingUsesData ?? []
  const totalUses = existingUses.length

  const patientEmail = booking.email_address
    ? String(booking.email_address).trim().toLowerCase()
    : null

  const usesForEmail = patientEmail
    ? existingUses.filter(
        (u) =>
          u.patient_email != null &&
          String(u.patient_email).trim().toLowerCase() === patientEmail
      ).length
    : 0

  // 5. Run every WooCommerce-style constraint.
  const reason = checkCouponConstraints(c, {
    patientEmail,
    bookingAmount: baseAmount,
    totalUses,
    usesForEmail,
    now: new Date().toISOString(),
    bookingClientId,
  })
  if (reason) {
    return NextResponse.json(
      { ok: false, error: rejectionMessage(reason), reason },
      { status: 409 }
    )
  }

  // 6. Resolve the discount.
  const resolved = resolveDiscount(c, baseAmount)

  // 7. Record / replace the coupon use atomically via upsert. The
  // coupon_uses_booking_unique index (migration 033 — one row per
  // booking_id) lets onConflict do the heavy lifting. This replaces the
  // previous delete-then-insert sequence, which had a race window: two
  // near-simultaneous applies for the same booking could both delete
  // (each seeing zero rows), then both insert — one would win on the
  // unique index, the other would surface a 500. The upsert collapses
  // it to one statement and ON CONFLICT does the right thing.
  const { error: useErr } = await admin
    .from("coupon_uses")
    .upsert(
      {
        coupon_id: c.id,
        booking_id: bookingId,
        patient_email: patientEmail ?? "",
        original_amount: resolved.originalAmount,
        discount_amount: resolved.discountAmount,
        final_amount: resolved.finalAmount,
      },
      { onConflict: "booking_id" }
    )
  if (useErr) return apiError(`Failed to record coupon use: ${useErr.message}`, 500)

  // 8. Update the booking row — denormalised fields for fast list + the
  // payment_amount column that PayFast initiate / ITN / reconcile all
  // read from. When the booking was Abandoned (operator resuming), also
  // flip status back to In Progress so the booking is in a consistent
  // state — the operator is actively working on it now.
  const bookingPatch: {
    coupon_id: string
    coupon_code: string
    original_amount: number
    discount_amount: number
    payment_amount: number
    status?: "In Progress"
  } = {
    coupon_id: c.id,
    coupon_code: c.code,
    original_amount: resolved.originalAmount,
    discount_amount: resolved.discountAmount,
    payment_amount: resolved.finalAmount,
  }
  if (wasAbandoned) bookingPatch.status = "In Progress"

  const { error: bookUpdErr } = await admin
    .from("bookings")
    .update(bookingPatch)
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
      ...(wasAbandoned
        ? { "Status": { old: "Abandoned", new: "In Progress" } }
        : {}),
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
