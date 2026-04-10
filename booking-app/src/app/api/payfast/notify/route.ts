import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import {
  getPayfastConfig,
  validateItnSignature,
  validateItnSourceIp,
  validateItnAmount,
  validateItnServerConfirmation,
} from "@/lib/payfast"

// =============================================================================
// POST /api/payfast/notify
//
// PayFast ITN (Instant Transaction Notification) callback.
// This is the AUTHORITATIVE payment confirmation — server-to-server.
//
// NO auth guard — PayFast calls this directly. Validated via:
//   1. Signature check
//   2. Source IP check
//   3. Amount validation
//   4. Server confirmation POST back to PayFast
//
// MUST always return 200 — PayFast retries on non-200 responses.
// =============================================================================

export async function POST(request: Request) {
  try {
    // Parse the URL-encoded POST body
    const text = await request.text()
    const params = new URLSearchParams(text)
    const postData: Record<string, string> = {}
    for (const [key, value] of params.entries()) {
      postData[key] = value
    }

    const bookingId = postData.m_payment_id
    const pfPaymentId = postData.pf_payment_id
    const paymentStatus = postData.payment_status
    const amountGross = postData.amount_gross

    console.log(`[PayFast ITN] Received for booking ${bookingId}, status: ${paymentStatus}`)

    if (!bookingId || !pfPaymentId) {
      console.error("[PayFast ITN] Missing m_payment_id or pf_payment_id")
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    let config
    try {
      config = getPayfastConfig()
    } catch (err) {
      console.error("[PayFast ITN] Config error:", err)
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    // Step 1: Validate signature
    const sigValid = validateItnSignature(postData, config.passphrase)
    if (!sigValid) {
      console.error("[PayFast ITN] Invalid signature")
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    // Step 2: Validate source IP
    const clientIp =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "unknown"

    const ipValid = await validateItnSourceIp(clientIp)
    if (!ipValid) {
      console.error(`[PayFast ITN] Invalid source IP: ${clientIp}`)
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    // Load the booking to check the expected amount
    let admin
    try {
      admin = getSupabaseAdmin()
    } catch (err) {
      console.error("[PayFast ITN] Admin client error:", err)
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    const { data: booking } = await admin
      .from("bookings")
      .select("id, status, payment_amount, pf_payment_id")
      .eq("id", bookingId)
      .single()

    if (!booking) {
      console.error(`[PayFast ITN] Booking not found: ${bookingId}`)
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    // Idempotency: already processed
    if (booking.pf_payment_id) {
      console.log(`[PayFast ITN] Already processed booking ${bookingId}`)
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    // Step 3: Validate amount
    const expectedAmount = booking.payment_amount?.toString() ?? "325.00"
    if (amountGross && !validateItnAmount(amountGross, expectedAmount)) {
      console.error(
        `[PayFast ITN] Amount mismatch: expected ${expectedAmount}, got ${amountGross}`
      )
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    // Step 4: Server confirmation
    const serverValid = await validateItnServerConfirmation(postData, config.testMode)
    if (!serverValid) {
      console.error("[PayFast ITN] Server confirmation failed")
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    // All validations passed — update the booking
    if (paymentStatus === "COMPLETE") {
      const { error: updErr } = await admin
        .from("bookings")
        .update({
          status: "Payment Complete",
          pf_payment_id: pfPaymentId,
          payment_confirmed_at: new Date().toISOString(),
        })
        .eq("id", bookingId)

      if (updErr) {
        console.error(`[PayFast ITN] Failed to update booking ${bookingId}:`, updErr.message)
      } else {
        console.log(`[PayFast ITN] Booking ${bookingId} marked as Payment Complete`)
      }
    } else {
      console.log(`[PayFast ITN] Non-COMPLETE status for ${bookingId}: ${paymentStatus}`)
    }

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (err) {
    console.error("[PayFast ITN] Unhandled error:", err)
    return NextResponse.json({ ok: true }, { status: 200 })
  }
}
