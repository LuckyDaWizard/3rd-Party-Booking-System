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
// Status code policy (IMPORTANT — drives PayFast retry behaviour):
//   - 200  → definitive accept or definitive reject. Do NOT retry.
//   - 4xx  → malformed request or definitive reject. Do NOT retry.
//   - 5xx  → transient server-side failure. PayFast will retry.
//
// Validation (in order — short-circuits on first failure):
//   1. Signature check        → 400 (definitive reject, attacker / config bug)
//   2. Source IP check        → 400 (definitive reject, not from PayFast)
//   3. Amount validation      → 400 (definitive reject, tampering)
//   4. Server confirmation    → 502 (transient network/PayFast error, retry)
//
// Booking lookup:
//   - Not found               → 200 (can't recover, stop retrying)
//   - Already processed       → 200 (idempotent accept)
//   - DB connection error     → 503 (transient, retry)
//
// NO auth guard — PayFast calls this directly. Trust is established via
// signature + IP + server confirmation, not via session.
// =============================================================================

interface ItnOutcome {
  ok: boolean
  reason: string
  status: number
}

function accept(reason: string): ItnOutcome {
  return { ok: true, reason, status: 200 }
}

function reject(reason: string, status = 400): ItnOutcome {
  return { ok: false, reason, status }
}

function transientFailure(reason: string, status = 500): ItnOutcome {
  return { ok: false, reason, status }
}

async function processItn(request: Request): Promise<ItnOutcome> {
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

  // Malformed request — PayFast retrying won't help.
  if (!bookingId || !pfPaymentId) {
    return reject("Missing m_payment_id or pf_payment_id", 400)
  }

  // Config problem on our side is transient (deploy + env var might recover).
  let config
  try {
    config = getPayfastConfig()
  } catch (err) {
    console.error("[PayFast ITN] Config error:", err)
    return transientFailure("Server misconfigured", 500)
  }

  // Step 1: Signature. A bad signature means an attacker or a config
  // mismatch — neither recovers on retry.
  const sigValid = validateItnSignature(postData, config.passphrase)
  if (!sigValid) {
    return reject("Invalid signature", 400)
  }

  // Step 2: Source IP. Either the request isn't from PayFast, or our proxy
  // isn't forwarding the real client IP. Don't have PayFast retry against
  // a spoofed origin — reject definitively.
  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"

  const ipValid = await validateItnSourceIp(clientIp)
  if (!ipValid) {
    return reject(`Invalid source IP: ${clientIp}`, 400)
  }

  // DB client setup — transient if it fails.
  let admin
  try {
    admin = getSupabaseAdmin()
  } catch (err) {
    console.error("[PayFast ITN] Admin client error:", err)
    return transientFailure("Database client error", 503)
  }

  // Load booking. A DB error here is transient; a "not found" is not.
  const { data: booking, error: loadErr } = await admin
    .from("bookings")
    .select("id, status, payment_amount, pf_payment_id")
    .eq("id", bookingId)
    .single()

  if (loadErr) {
    // Distinguish "no rows" (PGRST116) from actual DB errors.
    if (loadErr.code === "PGRST116") {
      // Booking genuinely not found — retries won't help.
      return accept(`Booking not found: ${bookingId} (ignored)`)
    }
    console.error("[PayFast ITN] DB load error:", loadErr.message)
    return transientFailure("Database query error", 503)
  }

  if (!booking) {
    return accept(`Booking not found: ${bookingId} (ignored)`)
  }

  // Idempotency: already processed.
  if (booking.pf_payment_id) {
    return accept(`Already processed booking ${bookingId}`)
  }

  // Step 3: Amount. Mismatch = tampering, definitive reject.
  const expectedAmount = booking.payment_amount?.toString() ?? "325.00"
  if (amountGross && !validateItnAmount(amountGross, expectedAmount)) {
    return reject(
      `Amount mismatch: expected ${expectedAmount}, got ${amountGross}`,
      400
    )
  }

  // Step 4: Server confirmation. A network failure here is transient —
  // PayFast's validate endpoint could be briefly unreachable.
  const serverValid = await validateItnServerConfirmation(postData, config.testMode)
  if (!serverValid) {
    return transientFailure("Server confirmation failed or returned non-VALID", 502)
  }

  // All validations passed — apply the update.
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
      // DB write failure is transient — let PayFast retry.
      return transientFailure("Failed to update booking", 503)
    }

    return accept(`Booking ${bookingId} marked as Payment Complete`)
  }

  // Non-COMPLETE status (FAILED, PENDING, CANCELLED) — accept but don't
  // mark as paid. No retry needed.
  return accept(`Non-COMPLETE status for ${bookingId}: ${paymentStatus}`)
}

export async function POST(request: Request) {
  try {
    const outcome = await processItn(request)

    if (outcome.ok) {
      console.log(`[PayFast ITN] ${outcome.reason}`)
    } else if (outcome.status >= 500) {
      console.error(`[PayFast ITN] TRANSIENT (${outcome.status}): ${outcome.reason}`)
    } else {
      console.error(`[PayFast ITN] REJECT (${outcome.status}): ${outcome.reason}`)
    }

    return NextResponse.json(
      { ok: outcome.ok, reason: outcome.reason },
      { status: outcome.status }
    )
  } catch (err) {
    // Unhandled exception = transient by default. PayFast will retry.
    console.error("[PayFast ITN] Unhandled error:", err)
    return NextResponse.json(
      { ok: false, reason: "Internal server error" },
      { status: 500 }
    )
  }
}
