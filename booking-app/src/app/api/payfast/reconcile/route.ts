import { NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase-server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import {
  findCompletedPayfastTransaction,
  getPayfastConfig,
  validateItnAmount,
} from "@/lib/payfast"
import { writeAuditLog, SYSTEM_ACTOR_ID, bookingRef } from "@/lib/audit-log"
import { recordIncident, buildSignature } from "@/lib/incidents"
import { apiError } from "@/lib/api-response"
import { isAuthorizedCronCall } from "@/lib/api-auth"
import {
  transitionStatus,
  type BookingStatus,
} from "@/lib/booking-state-machine"

// =============================================================================
// POST /api/payfast/reconcile
//
// Pull-based payment reconciliation. ITN delivery can drop for a range of
// reasons — transient network blips, brief PayFast outages, our app
// restarting mid-callback, a firewall hiccup at either end. This route
// actively queries PayFast's Transaction History API and updates bookings
// it finds have been paid, regardless of whether the ITN arrived.
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
  // Auth: either a signed-in session OR a valid cron-secret header.
  // A cron call is treated as system_admin-equivalent for batch mode.
  const isCron = isAuthorizedCronCall(request)

  let authUser: { id: string } | null = null
  if (!isCron) {
    const sb = await getSupabaseServer()
    const {
      data: { user },
    } = await sb.auth.getUser()
    if (!user) {
      return apiError("Unauthenticated", 401)
    }
    authUser = { id: user.id }
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
    return apiError(err instanceof Error ? err.message : "Server misconfigured", 500)
  }

  let admin
  try {
    admin = getSupabaseAdmin()
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Server misconfigured", 500)
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

  // Batch mode — require admin role (skipped for cron callers).
  if (!isCron) {
    const sb = await getSupabaseServer()
    const { data: callerRow } = await sb
      .from("users")
      .select("role, status")
      .eq("auth_user_id", authUser!.id)
      .single()

    if (!callerRow || callerRow.status !== "Active" || callerRow.role !== "system_admin") {
      return apiError("Batch reconciliation requires system_admin", 403)
    }
  }

  // Find pending bookings from the last LOOKBACK_HOURS. Include both
  // "In Progress" and "Abandoned" — the latter covers the case where a
  // user closed the success page before ITN arrived, causing the booking
  // store's beforeunload handler to flip them to Abandoned. PayFast may
  // still have a COMPLETE transaction for them.
  const cutoff = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString()
  const { data: pending, error: pendingErr } = await admin
    .from("bookings")
    .select("id")
    .in("status", ["In Progress", "Abandoned"])
    .not("payment_amount", "is", null)
    .gte("created_at", cutoff)
    .limit(100)

  if (pendingErr) {
    return apiError(`Failed to load pending bookings: ${pendingErr.message}`, 500)
  }

  // Bounded-concurrency pool. PayFast Transaction History calls average
  // ~300ms each, so a serial loop over 100 bookings blocks the Node event
  // loop for ~30s — bad on a 1-vCPU box hit every 15 min by cron. Running
  // 5 in flight at a time gives us most of the wall-clock saving without
  // hammering PayFast (their docs allow ~10 concurrent connections per
  // merchant, we stay well under). Process in chunks of CONCURRENCY,
  // awaiting each chunk before starting the next.
  const CONCURRENCY = 5
  const pendingRows = pending ?? []
  const results: ReconcileResult[] = []

  for (let i = 0; i < pendingRows.length; i += CONCURRENCY) {
    const chunk = pendingRows.slice(i, i + CONCURRENCY)
    // Promise.allSettled means one failure doesn't abort the chunk; we
    // still record a row for each result so the response counts add up.
    const settled = await Promise.allSettled(
      chunk.map((row) => reconcileOne(admin, config, row.id))
    )
    for (let j = 0; j < settled.length; j += 1) {
      const result = settled[j]
      if (result.status === "fulfilled") {
        results.push(result.value)
      } else {
        results.push({
          bookingId: chunk[j].id,
          updated: false,
          reason:
            result.reason instanceof Error
              ? result.reason.message
              : "Unknown error during reconcile",
        })
      }
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
    .select("id, status, payment_amount, pf_payment_id, first_names, surname")
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

  // Accept "In Progress" (normal) and "Abandoned" (user closed the tab
  // before ITN arrived). Reject "Discarded" (explicit user choice).
  if (booking.status !== "In Progress" && booking.status !== "Abandoned") {
    return {
      bookingId,
      updated: false,
      reason: `Cannot reconcile booking in status "${booking.status}"`,
    }
  }

  // Abandoned bookings must have reached the payment step (payment_amount
  // set) — otherwise there's no PayFast transaction to reconcile against.
  if (booking.status === "Abandoned" && !booking.payment_amount) {
    return {
      bookingId,
      updated: false,
      reason: "Abandoned before reaching payment",
    }
  }

  // Query PayFast for this booking's transaction.
  let match
  try {
    match = await findCompletedPayfastTransaction(config, bookingId, 2)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // Repeated reconcile-query failures point at PayFast's Transaction History
    // API being unreachable — surface as an incident.
    recordIncident({
      signature: buildSignature({
        source: "payfast",
        endpoint: "reconcile",
        statusOrClass: "query-failed",
      }),
      source: "payfast",
      category: "payment",
      title: "PayFast reconcile — Transaction History API failing",
      errorMsg: msg,
      bookingId,
    })
    return {
      bookingId,
      updated: false,
      reason: `PayFast query failed: ${msg}`,
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

  // Conditional update via the state machine — filters on the current
  // status so a concurrent writer (ITN webhook arriving mid-reconcile, or
  // an admin manual confirm) doesn't double-update.
  const fromStatus = booking.status as BookingStatus
  const result = await transitionStatus(
    admin,
    bookingId,
    fromStatus,
    "Payment Complete",
    {
      pf_payment_id: pfPaymentId,
      payment_confirmed_at: new Date().toISOString(),
    }
  )

  if (!result.ok) {
    if (result.reason === "conflict") {
      // Another writer beat us to it. Not an error from reconcile's POV —
      // the booking IS now Payment Complete, just not via this sweep.
      return {
        bookingId,
        updated: false,
        reason: "Concurrent writer transitioned this booking first",
      }
    }
    return {
      bookingId,
      updated: false,
      reason: `DB update failed: ${
        result.error instanceof Error ? result.error.message : "unknown"
      }`,
    }
  }

  // PII redaction (audit #2): short reference, not raw UUID.
  console.log(
    `[PayFast Reconcile] Booking ${bookingRef(bookingId)} marked Payment Complete (pf_payment_id=${pfPaymentId ?? "none"})`
  )

  const patientName =
    [booking.first_names, booking.surname].filter(Boolean).join(" ") ||
    "Unknown patient"

  await writeAuditLog({
    actorId: SYSTEM_ACTOR_ID,
    actorName: "PayFast Reconcile",
    actorRole: "system",
    action: "update",
    entityType: "booking",
    entityId: bookingId,
    entityName: `[${bookingRef(bookingId)}] Booking for ${patientName}`,
    changes: {
      "Payment Status": {
        old: booking.status,
        new: "Payment Complete (reconciled)",
      },
      "PF Payment ID": { new: pfPaymentId ?? "unknown" },
    },
  })

  return {
    bookingId,
    updated: true,
    reason: "Marked Payment Complete via PayFast Query API",
  }
}
