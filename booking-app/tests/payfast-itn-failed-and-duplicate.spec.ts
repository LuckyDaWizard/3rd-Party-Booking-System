/* eslint-disable no-console */
// =============================================================================
// PayFast ITN — non-COMPLETE + duplicate idempotency (backlog C3)
//
// Sibling of payfast-itn-happy-path.spec.ts (C2). Same infra: serial mode,
// beforeEach mock reset, service-role booking fixture, signItn + postItnToApp,
// cleanup in finally. Read C2's header for the validation-order / mock-setup
// background — this file only covers the two paths C2 explicitly deferred:
//
//   A. A validly-signed ITN whose payment_status is NOT "COMPLETE" (e.g.
//      "FAILED") must be ACCEPTED (200) but must NOT flip the booking. The
//      route reaches step 4 (server confirmation passes against the default
//      "valid" mock) and then hits the non-COMPLETE branch which returns an
//      accept WITHOUT calling transitionStatus. pf_payment_id stays null,
//      payment_type stays null, status stays "In Progress".
//
//   B. A second COMPLETE ITN arriving on an already-completed booking must be
//      idempotent. The notify route's idempotency guard (route.ts:181) fires
//      on `if (booking.pf_payment_id)` — set by the first ITN — and returns a
//      200 accept "Already processed" WITHOUT re-running the transition. The
//      stored pf_payment_id MUST remain the FIRST id (not overwritten by the
//      second), and there must be exactly ONE "Payment Complete (ITN)" audit
//      row for the booking.
//
// HOW TO RUN — identical to C2:
//     cd booking-app
//     PLAYWRIGHT_SEED=1 npx playwright test payfast-itn-failed-and-duplicate --project=chromium
//     npx playwright test payfast-itn-failed-and-duplicate --project=chromium   # re-run
// =============================================================================

import { test, expect } from "@playwright/test"
import crypto from "node:crypto"

import { getAdmin } from "./_helpers/admin"
import {
  createBookingForUnit,
  getSeededIds,
  readBooking,
} from "./_helpers/fixtures"
import { signInAsSeededUser } from "./_helpers/auth"
import {
  clearPayfastMockReceived,
  postItnToApp,
  prefixedMPaymentId,
  resetPayfastMockMode,
  signItn,
} from "./_helpers/payfast"

// Pinned literal — see C2's note on not importing from src in the Playwright
// context.
const PAYMENT_ITEM_NAME = "CareFirst Consultation Booking"

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

test.describe.configure({ mode: "serial" })

test.describe("PayFast ITN — non-COMPLETE + duplicate", () => {
  test.beforeEach(async () => {
    await resetPayfastMockMode()
    await clearPayfastMockReceived()
  })

  // ---------------------------------------------------------------------------
  // Test A — non-COMPLETE ITN does not flip the booking.
  // ---------------------------------------------------------------------------
  test("non-COMPLETE ITN does not flip the booking", async ({ page }) => {
    // ----- Arrange ------------------------------------------------------------
    // getSeededIds() runs loadEnvLocal() (via getAdmin), populating
    // PAYFAST_PASSPHRASE before signItn() reads it. Order matters.
    const { unitId } = await getSeededIds()
    const booking = await createBookingForUnit(unitId, "In Progress")
    await signInAsSeededUser(page)

    try {
      // Validly-signed ITN with payment_status="FAILED". amount_gross is set
      // to the booking's 325.00 so the amount check (step 3) passes and we
      // reach the COMPLETE/non-COMPLETE branch cleanly — proving the status
      // is the ONLY reason the row stays untouched, not an earlier reject.
      const pfPaymentId = uniquePfId()
      const fields: Record<string, string> = {
        merchant_id: requireMerchantId(),
        // Prefixed ref — every booking here is under the seeded coded client,
        // so a real gateway ITN carries "<CODE>-<uuid>".
        m_payment_id: prefixedMPaymentId(booking.id),
        pf_payment_id: pfPaymentId,
        payment_status: "FAILED",
        item_name: PAYMENT_ITEM_NAME,
        amount_gross: "325.00",
        amount_fee: "-10.00",
        amount_net: "315.00",
      }
      const signature = signItn(fields)

      // ----- Act --------------------------------------------------------------
      const res = await postItnToApp(BASE_URL, fields, signature)

      // ----- Assert -----------------------------------------------------------
      // 200 accept (PayFast must stop retrying) but no flip. Reason names the
      // non-COMPLETE status so a regression that silently swallows it is
      // visible.
      expect(
        res.status,
        "non-COMPLETE ITN should be accepted (200), not rejected"
      ).toBe(200)
      const body = (await res.json()) as { ok: boolean; reason: string }
      expect(body.ok).toBe(true)
      expect(body.reason).toMatch(/non-complete/i)

      const final = await readBooking(booking.id)
      expect(
        final?.status,
        "FAILED ITN must leave the booking In Progress"
      ).toBe("In Progress")
      expect(
        final?.pf_payment_id,
        "FAILED ITN must NOT stamp pf_payment_id"
      ).toBeNull()
      expect(
        final?.payment_type,
        "FAILED ITN must not touch payment_type"
      ).toBeNull()
      expect(
        final?.payment_confirmed_at,
        "FAILED ITN must not stamp payment_confirmed_at"
      ).toBeNull()
    } finally {
      await booking.cleanup()
      await clearPayfastMockReceived()
    }
  })

  // ---------------------------------------------------------------------------
  // Test B — duplicate COMPLETE ITN is idempotent.
  // ---------------------------------------------------------------------------
  test("duplicate COMPLETE ITN is idempotent", async ({ page }) => {
    // ----- Arrange ------------------------------------------------------------
    const { unitId } = await getSeededIds()
    const booking = await createBookingForUnit(unitId, "In Progress")
    await signInAsSeededUser(page)

    const merchantId = requireMerchantId()
    const firstPfId = uniquePfId()
    const secondPfId = uniquePfId()
    expect(firstPfId).not.toBe(secondPfId)

    try {
      // ----- Act 1: first COMPLETE ITN flips the booking ----------------------
      const firstFields: Record<string, string> = {
        merchant_id: merchantId,
        m_payment_id: prefixedMPaymentId(booking.id),
        pf_payment_id: firstPfId,
        payment_status: "COMPLETE",
        item_name: PAYMENT_ITEM_NAME,
        amount_gross: "325.00",
        amount_fee: "-10.00",
        amount_net: "315.00",
      }
      const firstRes = await postItnToApp(
        BASE_URL,
        firstFields,
        signItn(firstFields)
      )
      expect(firstRes.status, "first COMPLETE ITN should flip the booking").toBe(
        200
      )
      const firstBody = (await firstRes.json()) as {
        ok: boolean
        reason: string
      }
      expect(firstBody.ok).toBe(true)
      expect(firstBody.reason).toMatch(/marked as Payment Complete/i)

      const afterFirst = await readBooking(booking.id)
      expect(afterFirst?.status).toBe("Payment Complete")
      expect(afterFirst?.pf_payment_id).toBe(firstPfId)

      // ----- Act 2: second COMPLETE ITN with a DIFFERENT pf id ----------------
      const secondFields: Record<string, string> = {
        merchant_id: merchantId,
        m_payment_id: prefixedMPaymentId(booking.id),
        pf_payment_id: secondPfId,
        payment_status: "COMPLETE",
        item_name: PAYMENT_ITEM_NAME,
        amount_gross: "325.00",
        amount_fee: "-10.00",
        amount_net: "315.00",
      }
      const secondRes = await postItnToApp(
        BASE_URL,
        secondFields,
        signItn(secondFields)
      )

      // ----- Assert -----------------------------------------------------------
      // The idempotency guard (route.ts:181) short-circuits on the already-set
      // pf_payment_id BEFORE the amount + server-confirmation steps, so the
      // route returns a 200 accept "Already processed".
      expect(
        secondRes.status,
        "duplicate COMPLETE ITN should be accepted (200), idempotent"
      ).toBe(200)
      const secondBody = (await secondRes.json()) as {
        ok: boolean
        reason: string
      }
      expect(secondBody.ok).toBe(true)
      expect(secondBody.reason).toMatch(/already processed/i)

      const final = await readBooking(booking.id)
      expect(final?.status).toBe("Payment Complete")
      // The stored pf_payment_id MUST still be the FIRST id — the duplicate
      // must not overwrite it. This is the load-bearing idempotency invariant:
      // a partner could otherwise spoof a re-pay and clobber our record.
      expect(
        final?.pf_payment_id,
        "duplicate ITN must NOT overwrite the stored pf_payment_id"
      ).toBe(firstPfId)
      expect(final?.pf_payment_id).not.toBe(secondPfId)
      expect(final?.payment_type).toBeNull()

      // Exactly ONE audit row recording the ITN flip. Poll like C2 does —
      // writeAuditLog is fire-and-forget. The second ITN short-circuits
      // before writeAuditLog, so a second matching row would be a regression
      // (double-processing). Filter on the changes JSON to be robust against
      // any unrelated system rows on this booking.
      const admin = getAdmin()
      type AuditRow = {
        changes: Record<string, { old?: unknown; new?: unknown }> | null
        created_at: string
      }
      let itnRows: AuditRow[] = []
      for (let i = 0; i < 20; i++) {
        const { data } = await admin
          .from("audit_log")
          .select("changes, created_at")
          .eq("entity_id", booking.id)
          .eq("actor_role", "system")
          .order("created_at", { ascending: false })
        const rows = (data as AuditRow[] | null) ?? []
        itnRows = rows.filter(
          (r) => r.changes?.["Payment Status"]?.new === "Payment Complete (ITN)"
        )
        if (itnRows.length >= 1) break
        await new Promise((r) => setTimeout(r, 100))
      }
      expect(
        itnRows.length,
        "there must be exactly one 'Payment Complete (ITN)' audit row — the duplicate must not produce a second"
      ).toBe(1)
      // The single row carries the FIRST pf id, confirming it's the original
      // flip's row and not a clobbered re-write.
      expect(itnRows[0].changes?.["PF Payment ID"]?.new).toBe(firstPfId)
    } finally {
      await booking.cleanup()
      await clearPayfastMockReceived()
    }
  })

  // ---------------------------------------------------------------------------
  // Test C — BACKWARD COMPAT (critical): a legacy bare-UUID m_payment_id still
  //          confirms the booking.
  //
  // In-flight sandbox transactions created BEFORE migration 041 / the prefixed-
  // m_payment_id deploy carry the bare booking UUID, with NO client-code prefix.
  // The notify route's stripBookingId() must return such a ref UNCHANGED (its
  // 8-hex first segment can't match the {3,5} code prefix), so the row resolves
  // and the booking still flips to Payment Complete. This proves the deploy
  // doesn't strand any payment that was already on the gateway.
  //
  // We deliberately set m_payment_id to the BARE booking.id here (NOT the
  // prefixed form), even though the seeded client now has a code — this is the
  // legacy wire shape, and the route must accept it irrespective of the client's
  // current code.
  // ---------------------------------------------------------------------------
  test("legacy bare-UUID m_payment_id (no client-code prefix) still confirms the booking", async ({
    page,
  }) => {
    // ----- Arrange ------------------------------------------------------------
    const { unitId } = await getSeededIds()
    const booking = await createBookingForUnit(unitId, "In Progress", "device")
    await signInAsSeededUser(page)

    const pfPaymentId = uniquePfId()

    try {
      const fields: Record<string, string> = {
        merchant_id: requireMerchantId(),
        // BARE UUID — the legacy, pre-prefix wire shape. stripBookingId returns
        // it unchanged, so the route resolves the booking and flips it.
        m_payment_id: booking.id,
        pf_payment_id: pfPaymentId,
        payment_status: "COMPLETE",
        item_name: PAYMENT_ITEM_NAME,
        amount_gross: "325.00",
        amount_fee: "-10.00",
        amount_net: "315.00",
      }
      const signature = signItn(fields)

      // ----- Act --------------------------------------------------------------
      const res = await postItnToApp(BASE_URL, fields, signature)

      // ----- Assert -----------------------------------------------------------
      expect(
        res.status,
        "legacy bare-UUID ITN should confirm the booking (200)"
      ).toBe(200)
      const body = (await res.json()) as { ok: boolean; reason: string }
      expect(body.ok).toBe(true)
      expect(body.reason).toMatch(/marked as Payment Complete/i)

      const final = await readBooking(booking.id)
      expect(
        final?.status,
        "legacy bare-UUID ITN must flip the booking to Payment Complete"
      ).toBe("Payment Complete")
      expect(
        final?.pf_payment_id,
        "legacy bare-UUID ITN must still stamp pf_payment_id"
      ).toBe(pfPaymentId)
      expect(final?.payment_type).toBe("device")
      expect(final?.payment_confirmed_at).toBeTruthy()
    } finally {
      await booking.cleanup()
      await clearPayfastMockReceived()
    }
  })
})
