import { NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase-server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import {
  findCompletedPayfastTransaction,
  getPayfastConfig,
  validateItnAmount,
} from "@/lib/payfast"

// =============================================================================
// POST /api/payfast/reconcile
//
// Pull-based payment reconciliation. Instead of waiting for PayFast's ITN to
// push us a payment confirmation (which fails on HTTP-only deployments), this
// route actively queries PayFast's Transaction History API and updates
// bookings that it finds have been paid.
//
// Two modes:
//   1. Single booking  — body: { bookingId: string }
//      Any authenticated user may reconcile a specific booking. PayFast's
//      API is the source of truth, so we can't fake a payment client-side.
//
//   2. Batch           — body: {} or {"all": true}
//      system_admin only. Reconciles every "In Progress" booking with a
//      payment_amount set from the last 2 hours.
//
// Returns:
//   { ok: true, reconciled: number, results: [{ bookingId, updated, reason }] }
//
// Idempotent: skips bookings that are already Payment Complete / Successful.
// =============================================================================

interface Body {
  bookingId?: string
}

interface ReconcileResult {
  bookingId: string
  updated: boolean
  reason: string
}

const LOOKBACK_HOURS = 2

export async function POST(request: Request) {
  // Require a signed-in session. Anyone with a session can reconcile.
  // If the request is for a specific bookingId, we don't need admin — the
  // PayFast API check gates whether we actually write.
  const sb = await getSupabaseServer()
  const {
    data: { user: authUser },
  } = await sb.auth.getUser()

  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  }

  let body: Body = {}
  try {
    body = (await request.json()) as Body
  } catch {
    // empty body is fine — batch mode
  }

  const bookingId = body.bookingId?.trim()

  let config
  try {
    config = getPayfastConfig()
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server misconfigured" },
      { status: 500 }
    )
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

  // Single-booking mode.
  if (bookingId) {
    const result = await reconcileOne(admin, config, bookingId)
    return NextResponse.json({
      ok: true,
      reconciled: result.updated ? 1 : 0,
      results: [result],
    })
  }

  // Batch mode — require admin role.
  const { data: callerRow } = await sb
    .from("users")
    .select("role, status")
    .eq("auth_user_id", authUser.id)
    .single()

  if (!callerRow || callerRow.status !== "Active" || callerRow.role !== "system_admin") {
    return NextResponse.json(
      { error: "Batch reconciliation requires system_admin" },
      { status: 403 }
    )
  }

  // Find pending bookings from the last LOOKBACK_HOURS.
  const cutoff = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString()
  const { data: pending, error: pendingErr } = await admin
    .from("bookings")
    .select("id")
    .eq("status", "In Progress")
    .not("payment_amount", "is", null)
    .gte("created_at", cutoff)
    .limit(100)

  if (pendingErr) {
    return NextResponse.json(
      { error: `Failed to load pending bookings: ${pendingErr.message}` },
      { status: 500 }
    )
  }

  const results: ReconcileResult[] = []
  for (const row of pending ?? []) {
    // Best-effort: one failure shouldn't abort the batch.
    try {
      const r = await reconcileOne(admin, config, row.id)
      results.push(r)
    } catch (err) {
      results.push({
        bookingId: row.id,
        updated: false,
        reason:
          err instanceof Error ? err.message : "Unknown error during reconcile",
      })
    }
  }

  const reconciled = results.filter((r) => r.updated).length
  return NextResponse.json({ ok: true, reconciled, results })
}

// ---------------------------------------------------------------------------
// Helper: reconcile a single booking by ID.
// ---------------------------------------------------------------------------
async function reconcileOne(
  admin: ReturnType<typeof getSupabaseAdmin>,
  config: ReturnType<typeof getPayfastConfig>,
  bookingId: string
): Promise<ReconcileResult> {
  const { data: booking, error: loadErr } = await admin
    .from("bookings")
    .select("id, status, payment_amount, pf_payment_id")
    .eq("id", bookingId)
    .single()

  if (loadErr || !booking) {
    return {
      bookingId,
      updated: false,
      reason: "Booking not found",
    }
  }

  // Idempotency — already past this point.
  if (booking.status === "Payment Complete" || booking.status === "Successful") {
    return {
      bookingId,
      updated: false,
      reason: `Already ${booking.status}`,
    }
  }

  if (booking.status !== "In Progress") {
    return {
      bookingId,
      updated: false,
      reason: `Cannot reconcile booking in status "${booking.status}"`,
    }
  }

  // Query PayFast for this booking's transaction.
  let match
  try {
    match = await findCompletedPayfastTransaction(config, bookingId, 2)
  } catch (err) {
    return {
      bookingId,
      updated: false,
      reason: `PayFast query failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    }
  }

  if (!match) {
    return {
      bookingId,
      updated: false,
      reason: "No completed PayFast transaction found yet",
    }
  }

  // Sanity-check the amount to prevent a rogue transaction from marking us
  // paid at the wrong price. Use the same tolerance as ITN.
  const expected = booking.payment_amount?.toString() ?? "325.00"
  const received = String(match.amount_gross ?? "")
  if (received && !validateItnAmount(received, expected)) {
    return {
      bookingId,
      updated: false,
      reason: `Amount mismatch (expected ${expected}, got ${received})`,
    }
  }

  const pfPaymentId = String(match.pf_payment_id ?? "").trim() || null

  const { error: updErr } = await admin
    .from("bookings")
    .update({
      status: "Payment Complete",
      pf_payment_id: pfPaymentId,
      payment_confirmed_at: new Date().toISOString(),
    })
    .eq("id", bookingId)

  if (updErr) {
    return {
      bookingId,
      updated: false,
      reason: `DB update failed: ${updErr.message}`,
    }
  }

  console.log(
    `[PayFast Reconcile] Booking ${bookingId} marked Payment Complete (pf_payment_id=${pfPaymentId ?? "none"})`
  )

  return {
    bookingId,
    updated: true,
    reason: "Marked Payment Complete via PayFast Query API",
  }
}
