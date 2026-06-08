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

// =============================================================================
// POST /api/coupons/remove
//
// Remove a coupon from a booking. Reverses /apply: deletes coupon_uses,
// clears the denormalised booking fields, restores payment_amount to the
// original_amount.
//
// Body:
//   { bookingId: string }
//
// Returns:
//   { ok: true, paymentAmount: number }
// =============================================================================

interface Body { bookingId?: string }

export async function POST(request: Request) {
  const { caller, denied } = await requireAuthenticated()
  if (denied) return denied

  let body: Body
  try { body = (await request.json()) as Body }
  catch { return apiError("Invalid JSON body", 400) }

  const bookingId = (body.bookingId ?? "").trim()
  if (!bookingId) return apiError("Missing bookingId", 400)

  let admin
  try { admin = getSupabaseAdmin() }
  catch (err) {
    return apiError(err instanceof Error ? err.message : "Server misconfigured", 500)
  }

  const { data: booking } = await admin
    .from("bookings")
    .select("id, status, unit_id, coupon_id, coupon_code, original_amount, payment_amount")
    .eq("id", bookingId)
    .maybeSingle()
  if (!booking) return apiError("Booking not found", 404)

  // Unit-scope guard: a caller may only touch bookings in their own unit(s).
  // system_admin bypasses scoping. Mirrors the booking-mutation routes
  // (e.g. mark-self-collect) and prevents a cross-unit financial IDOR where
  // a user enumerates another unit's booking UUID to alter its amount.
  if (!booking.unit_id) return apiError("Booking has no unit assigned", 400)
  if (caller.role !== "system_admin" && !caller.unitIds.includes(booking.unit_id)) {
    return apiError("Forbidden", 403)
  }

  // Idempotent short-circuit first: if there's nothing to remove, succeed.
  // This is important for Abandoned bookings — the abandon-release trigger
  // (migration 036) already cleared coupon_id, so a remove call here would
  // otherwise hit the status check below and fail with a confusing error.
  if (!booking.coupon_id) {
    // Idempotent — already no coupon. Return success so the client doesn't
    // have to special-case it.
    return NextResponse.json({
      ok: true,
      paymentAmount: Number(booking.payment_amount ?? 0),
    })
  }

  // Once paid / handed off / discarded, the coupon is part of the booking's
  // transaction record and shouldn't be retroactively dropped.
  if (booking.status !== "In Progress") {
    return apiError(
      "Coupon can only be removed while the booking is in progress.",
      409
    )
  }

  // Restore: payment_amount → original_amount (or leave alone if unknown).
  const restoredAmount = booking.original_amount !== null
    ? Number(booking.original_amount)
    : Number(booking.payment_amount ?? 0)

  await admin.from("coupon_uses").delete().eq("booking_id", bookingId)
  const removedCode = booking.coupon_code
  const { error: updErr } = await admin
    .from("bookings")
    .update({
      coupon_id: null,
      coupon_code: null,
      discount_amount: null,
      payment_amount: restoredAmount,
      // Keep original_amount populated as the historical record.
    })
    .eq("id", bookingId)
  if (updErr) return apiError(`Failed to update booking: ${updErr.message}`, 500)

  writeAuditLog({
    actorId: caller.id || SYSTEM_ACTOR_ID,
    actorName: caller.name || "System",
    actorRole: caller.role,
    action: "update",
    entityType: "booking",
    entityId: bookingId,
    entityName: `Booking ${bookingRef(bookingId)} — coupon ${removedCode ?? ""} removed`,
    changes: {
      "Coupon": { old: removedCode ?? "", new: "" },
      "Payment amount": { new: String(restoredAmount) },
    },
    ipAddress: getCallerIp(request),
  })

  return NextResponse.json({ ok: true, paymentAmount: restoredAmount })
}
