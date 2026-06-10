/* eslint-disable no-console */
// =============================================================================
// PayFast reconcile — single-booking pull reconciliation (backlog C5)
//
// Sibling of payfast-itn-happy-path.spec.ts (C2). Exercises the PULL side of
// payment confirmation: /api/payfast/reconcile queries PayFast's Transaction
// History API and flips bookings it finds paid, regardless of whether the ITN
// webhook arrived. This closes the ITN-drop gap on HTTP-only deployments.
//
// MOCK SEEDING (added in C5):
//   The mock's GET /transactions/history now returns a per-test seeded list
//   via setMockTransactions() / clearMockTransactions() (helpers in
//   _helpers/payfast.ts; introspection endpoint POST/DELETE /__transactions
//   in the mock). Production's findCompletedPayfastTransaction() filters the
//   returned list client-side by m_payment_id + status === "COMPLETE", so a
//   spec seeds exactly the row(s) for its booking and the production parser
//   does the matching.
//
// AUTH:
//   Single-booking mode accepts any authenticated user. We sign in via the
//   real UI (signInAsSeededUser) and POST through page.request so the Supabase
//   session cookie rides along. The dashboard proxy enforces double-submit
//   CSRF on POST /api/payfast/reconcile, so we read the cf_csrf cookie and
//   send it as x-csrf-token (mirrors what the browser app does).
//
// WHAT EACH TEST GUARDS:
//   1. A COMPLETE matching transaction flips the booking to Payment Complete,
//      stamps pf_payment_id from the txn, leaves payment_type NULL (PayFast
//      path tell), and writes a "Payment Complete (reconciled)" audit row —
//      the parenthetical distinguishes reconcile flips from ITN flips.
//   2. No matching transaction → updated:false, booking untouched.
//   3. Amount mismatch on the matched txn → updated:false, booking untouched
//      (a rogue txn at the wrong price must NOT mark us paid).
//
// HOW TO RUN — identical to C2:
//     cd booking-app
//     PLAYWRIGHT_SEED=1 npx playwright test payfast-reconcile --project=chromium
//     npx playwright test payfast-reconcile --project=chromium   # re-run
// =============================================================================

import { test, expect } from "@playwright/test"
import crypto from "node:crypto"

import { getAdmin } from "./_helpers/admin"
import {
  createBookingForUnit,
  getSeededIds,
  readBooking,
} from "./_helpers/fixtures"
import { readCsrfToken, signInAsSeededUser, CSRF_HEADER_NAME } from "./_helpers/auth"
import {
  clearMockTransactions,
  clearPayfastMockReceived,
  resetPayfastMockMode,
  setMockTransactions,
  type PayfastTransaction,
} from "./_helpers/payfast"

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000"

function requireMerchantId(): string {
  const merchantId = process.env.PAYFAST_MERCHANT_ID
  if (!merchantId) {
    throw new Error(
      "PAYFAST_MERCHANT_ID missing from env. Set it in booking-app/.env.local."
    )
  }
  return merchantId
}

function uniquePfId(): string {
  return `TEST-PF-${crypto.randomBytes(8).toString("hex")}`
}

interface ReconcileResponse {
  ok: boolean
  reconciled: number
  results: { bookingId: string; updated: boolean; reason: string }[]
}

test.describe.configure({ mode: "serial" })

test.describe("PayFast reconcile (single booking)", () => {
  test.beforeEach(async () => {
    await resetPayfastMockMode()
    await clearPayfastMockReceived()
    await clearMockTransactions()
  })

  // ---------------------------------------------------------------------------
  // Test 1 — reconcile flips an In Progress booking via the Query API.
  // ---------------------------------------------------------------------------
  test("reconcile flips an In Progress booking when a COMPLETE transaction exists", async ({
    page,
    context,
  }) => {
    // ----- Arrange ------------------------------------------------------------
    const { unitId } = await getSeededIds()
    const booking = await createBookingForUnit(unitId, "In Progress")
    await signInAsSeededUser(page)
    const csrf = await readCsrfToken(context)

    const pfPaymentId = uniquePfId()

    try {
      // Seed a matching COMPLETE transaction. Only the four fields the
      // production parser reads are needed; the m_payment_id MUST equal the
      // booking id for findCompletedPayfastTransaction to match it.
      const txns: PayfastTransaction[] = [
        {
          m_payment_id: booking.id,
          pf_payment_id: pfPaymentId,
          payment_status: "COMPLETE",
          amount_gross: "325.00",
          merchant_id: requireMerchantId(),
        },
      ]
      await setMockTransactions(txns)

      // ----- Act --------------------------------------------------------------
      const res = await page.request.post(`${BASE_URL}/api/payfast/reconcile`, {
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER_NAME]: csrf,
        },
        data: { bookingId: booking.id },
      })

      // ----- Assert -----------------------------------------------------------
      expect(res.status(), "reconcile should return 200").toBe(200)
      const body = (await res.json()) as ReconcileResponse
      expect(body.ok).toBe(true)
      expect(body.reconciled).toBe(1)
      expect(body.results).toHaveLength(1)
      expect(body.results[0].bookingId).toBe(booking.id)
      expect(body.results[0].updated).toBe(true)
      expect(body.results[0].reason).toMatch(/query api/i)

      const final = await readBooking(booking.id)
      expect(final?.status).toBe("Payment Complete")
      // pf_payment_id comes from the TRANSACTION, not from us — that's the
      // affirmative "reconcile via PayFast" tell.
      expect(
        final?.pf_payment_id,
        "reconcile must stamp the pf_payment_id from the matched transaction"
      ).toBe(pfPaymentId)
      // PayFast path leaves payment_type NULL — only the three bypass routes
      // ever stamp it. Same cross-wiring guard as the ITN happy path.
      expect(final?.payment_type).toBeNull()
      expect(
        final?.payment_confirmed_at,
        "reconcile must stamp payment_confirmed_at"
      ).toBeTruthy()
      expect(Number(final?.payment_amount)).toBe(325)

      // Audit: a "Payment Complete (reconciled)" row written by the reconcile
      // route (actor_role=system). The parenthetical distinguishes it from the
      // ITN flip's "(ITN)" — a regression that swaps them drops the
      // reconcile-traceability signal. Poll: writeAuditLog is fire-and-forget.
      const admin = getAdmin()
      type AuditRow = {
        actor_id: string
        actor_role: string
        action: string
        entity_type: string
        changes: Record<string, { old?: unknown; new?: unknown }> | null
      }
      let auditRow: AuditRow | null = null
      for (let i = 0; i < 20 && !auditRow; i++) {
        const { data } = await admin
          .from("audit_log")
          .select("actor_id, actor_role, action, entity_type, changes")
          .eq("entity_id", booking.id)
          .eq("actor_role", "system")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
        auditRow = (data as AuditRow | null) ?? null
        if (!auditRow) await new Promise((r) => setTimeout(r, 100))
      }
      expect(
        auditRow,
        "reconcile should write a system audit_log row"
      ).not.toBeNull()
      expect(auditRow?.action).toBe("update")
      expect(auditRow?.entity_type).toBe("booking")
      expect(auditRow?.actor_id).toBe("00000000-0000-0000-0000-000000000000")
      expect(auditRow?.changes?.["Payment Status"]?.new).toBe(
        "Payment Complete (reconciled)"
      )
      expect(auditRow?.changes?.["PF Payment ID"]?.new).toBe(pfPaymentId)
    } finally {
      await clearMockTransactions()
      await clearPayfastMockReceived()
      await booking.cleanup()
    }
  })

  // ---------------------------------------------------------------------------
  // Test 2 — no matching transaction → not updated.
  // ---------------------------------------------------------------------------
  test("reconcile leaves the booking untouched when no matching transaction exists", async ({
    page,
    context,
  }) => {
    // ----- Arrange ------------------------------------------------------------
    const { unitId } = await getSeededIds()
    const booking = await createBookingForUnit(unitId, "In Progress")
    await signInAsSeededUser(page)
    const csrf = await readCsrfToken(context)

    try {
      // Seed a COMPLETE txn for a DIFFERENT booking id — proves the route
      // actually filters by m_payment_id rather than grabbing any COMPLETE
      // row. (Seeding empty would also pass, but this is the stronger check.)
      const txns: PayfastTransaction[] = [
        {
          m_payment_id: crypto.randomUUID(),
          pf_payment_id: uniquePfId(),
          payment_status: "COMPLETE",
          amount_gross: "325.00",
        },
      ]
      await setMockTransactions(txns)

      // ----- Act --------------------------------------------------------------
      const res = await page.request.post(`${BASE_URL}/api/payfast/reconcile`, {
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER_NAME]: csrf,
        },
        data: { bookingId: booking.id },
      })

      // ----- Assert -----------------------------------------------------------
      expect(res.status()).toBe(200)
      const body = (await res.json()) as ReconcileResponse
      expect(body.ok).toBe(true)
      expect(body.reconciled).toBe(0)
      expect(body.results[0].updated).toBe(false)
      expect(body.results[0].reason).toMatch(/no completed/i)

      const final = await readBooking(booking.id)
      expect(final?.status).toBe("In Progress")
      expect(final?.pf_payment_id).toBeNull()
      expect(final?.payment_confirmed_at).toBeNull()
    } finally {
      await clearMockTransactions()
      await clearPayfastMockReceived()
      await booking.cleanup()
    }
  })

  // ---------------------------------------------------------------------------
  // Test 3 — amount mismatch on the matched txn → not updated.
  // ---------------------------------------------------------------------------
  test("reconcile refuses to flip when the matched transaction amount mismatches", async ({
    page,
    context,
  }) => {
    // ----- Arrange ------------------------------------------------------------
    const { unitId } = await getSeededIds()
    const booking = await createBookingForUnit(unitId, "In Progress")
    await signInAsSeededUser(page)
    const csrf = await readCsrfToken(context)

    try {
      // A COMPLETE txn that matches m_payment_id but claims 999.00 against a
      // 325.00 booking. The route matches it, then the amount sanity-check
      // (validateItnAmount) rejects → updated:false. This guards against a
      // rogue / wrong-price transaction marking the booking paid.
      const txns: PayfastTransaction[] = [
        {
          m_payment_id: booking.id,
          pf_payment_id: uniquePfId(),
          payment_status: "COMPLETE",
          amount_gross: "999.00",
        },
      ]
      await setMockTransactions(txns)

      // ----- Act --------------------------------------------------------------
      const res = await page.request.post(`${BASE_URL}/api/payfast/reconcile`, {
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER_NAME]: csrf,
        },
        data: { bookingId: booking.id },
      })

      // ----- Assert -----------------------------------------------------------
      expect(res.status()).toBe(200)
      const body = (await res.json()) as ReconcileResponse
      expect(body.ok).toBe(true)
      expect(body.reconciled).toBe(0)
      expect(body.results[0].updated).toBe(false)
      expect(body.results[0].reason).toMatch(/amount mismatch/i)

      const final = await readBooking(booking.id)
      expect(final?.status).toBe("In Progress")
      expect(final?.pf_payment_id).toBeNull()
      expect(final?.payment_confirmed_at).toBeNull()
    } finally {
      await clearMockTransactions()
      await clearPayfastMockReceived()
      await booking.cleanup()
    }
  })
})
