/* eslint-disable no-console */
// =============================================================================
// PayFast ITN — rejection paths (backlog C4)
//
// Sibling of payfast-itn-happy-path.spec.ts (C2). Covers the three currently-
// testable reject paths of /api/payfast/notify. In every case the booking
// must remain UNTOUCHED (In Progress, pf_payment_id null, payment_type null) —
// a reject that nonetheless mutated the row would be the worst kind of bug.
//
//   1. Bad signature → 400 "Invalid signature".
//   2. Amount mismatch → 400 "Amount mismatch".
//   3. Server confirmation INVALID → 502 (transient).
//
// TWO TRAPS THIS FILE NAVIGATES (see C4 brief):
//
//   Trap 1 (bad-sig test): PAYFAST_TEST_MODE=true makes notify/route.ts accept
//   a signature computed WITH *or* WITHOUT the passphrase (route.ts:127-131).
//   So signing with a "wrong passphrase" is NOT a reliable invalidation — the
//   without-passphrase recompute might still match. Instead we compute a VALID
//   signature, then MUTATE a field value after signing (flip a digit in
//   amount_gross). Now neither the with- nor without-passphrase recompute
//   matches → guaranteed 400 "Invalid signature".
//
//   Trap 2 (amount-mismatch test): the "Amount mismatch" branch (step 3) is
//   only reachable if the signature is VALID. So we build the body with the
//   WRONG amount (999.00) and sign over THAT body. The route passes steps 1+2,
//   then step 3 rejects with "Amount mismatch". (If we tampered AFTER signing
//   we'd get "Invalid signature" and be testing the wrong path — the two
//   tests would become indistinguishable.) We assert the reason strings to
//   keep the two cases honest.
//
//   Trap 3 (NOT tested here): a timeout→502 test is impossible against current
//   production code — validateItnServerConfirmation() uses a bare fetch() with
//   no AbortSignal, so the mock's 6s delay just makes production wait and then
//   succeed. For the 502 path we use the `invalid` mock mode (returns
//   "INVALID" → serverValid=false → 502), which is a real, testable 502 today.
//   See the C4 report for the AbortSignal finding.
//
// HOW TO RUN — identical to C2:
//     cd booking-app
//     PLAYWRIGHT_SEED=1 npx playwright test payfast-itn-rejections --project=chromium
//     npx playwright test payfast-itn-rejections --project=chromium   # re-run
// =============================================================================

import { test, expect } from "@playwright/test"
import crypto from "node:crypto"

import {
  createBookingForUnit,
  getSeededIds,
  readBooking,
} from "./_helpers/fixtures"
import { signInAsSeededUser } from "./_helpers/auth"
import {
  clearPayfastMockReceived,
  postItnToApp,
  resetPayfastMockMode,
  setPayfastMockMode,
  signItn,
} from "./_helpers/payfast"

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

/** Asserts the booking is exactly as createBookingForUnit left it. */
async function expectBookingUntouched(bookingId: string): Promise<void> {
  const final = await readBooking(bookingId)
  expect(final?.status, "rejected ITN must leave status In Progress").toBe(
    "In Progress"
  )
  expect(
    final?.pf_payment_id,
    "rejected ITN must not stamp pf_payment_id"
  ).toBeNull()
  expect(
    final?.payment_type,
    "rejected ITN must not touch payment_type"
  ).toBeNull()
  expect(
    final?.payment_confirmed_at,
    "rejected ITN must not stamp payment_confirmed_at"
  ).toBeNull()
}

test.describe.configure({ mode: "serial" })

test.describe("PayFast ITN — rejections", () => {
  test.beforeEach(async () => {
    await resetPayfastMockMode()
    await clearPayfastMockReceived()
  })

  // ---------------------------------------------------------------------------
  // Test 1 — bad signature → 400 (Trap 1: mutate-after-sign).
  // ---------------------------------------------------------------------------
  test("bad signature is rejected with 400 and leaves the booking untouched", async ({
    page,
  }) => {
    // ----- Arrange ------------------------------------------------------------
    const { unitId } = await getSeededIds()
    const booking = await createBookingForUnit(unitId, "In Progress")
    await signInAsSeededUser(page)

    try {
      const fields: Record<string, string> = {
        merchant_id: requireMerchantId(),
        m_payment_id: booking.id,
        pf_payment_id: uniquePfId(),
        payment_status: "COMPLETE",
        item_name: PAYMENT_ITEM_NAME,
        amount_gross: "325.00",
        amount_fee: "-10.00",
        amount_net: "315.00",
      }

      // Sign over the GOOD body...
      const signature = signItn(fields)
      // ...then mutate a field so neither the with- nor without-passphrase
      // recompute on the server matches. Flip the amount to a value that's
      // ALSO a valid amount (325.99) — that way if the route DIDN'T reject on
      // signature it would fall through to the amount-mismatch path, and the
      // reason assertion below would catch the leak by failing on /invalid
      // signature/.
      const tamperedFields = { ...fields, amount_gross: "325.99" }

      // ----- Act --------------------------------------------------------------
      const res = await postItnToApp(BASE_URL, tamperedFields, signature)

      // ----- Assert -----------------------------------------------------------
      expect(res.status, "tampered signature must be a definitive 400").toBe(400)
      const body = (await res.json()) as { ok: boolean; reason: string }
      expect(body.ok).toBe(false)
      expect(
        body.reason,
        "must reject on signature, NOT on amount (proves step 1 short-circuits)"
      ).toMatch(/invalid signature/i)

      await expectBookingUntouched(booking.id)
    } finally {
      await booking.cleanup()
      await clearPayfastMockReceived()
    }
  })

  // ---------------------------------------------------------------------------
  // Test 2 — amount mismatch → 400 (Trap 2: validly-sign the wrong amount).
  // ---------------------------------------------------------------------------
  test("amount mismatch is rejected with 400 and leaves the booking untouched", async ({
    page,
  }) => {
    // ----- Arrange ------------------------------------------------------------
    const { unitId } = await getSeededIds()
    const booking = await createBookingForUnit(unitId, "In Progress")
    await signInAsSeededUser(page)

    try {
      // Booking's payment_amount is 325.00; build + sign an ITN claiming
      // 999.00. Signature is VALID over this body, so the route passes steps
      // 1+2 and rejects at step 3.
      const fields: Record<string, string> = {
        merchant_id: requireMerchantId(),
        m_payment_id: booking.id,
        pf_payment_id: uniquePfId(),
        payment_status: "COMPLETE",
        item_name: PAYMENT_ITEM_NAME,
        amount_gross: "999.00",
        amount_fee: "-30.00",
        amount_net: "969.00",
      }
      const signature = signItn(fields)

      // ----- Act --------------------------------------------------------------
      const res = await postItnToApp(BASE_URL, fields, signature)

      // ----- Assert -----------------------------------------------------------
      expect(res.status, "amount mismatch must be a definitive 400").toBe(400)
      const body = (await res.json()) as { ok: boolean; reason: string }
      expect(body.ok).toBe(false)
      expect(
        body.reason,
        "must reject on amount, NOT on signature (proves the valid sig got through step 1)"
      ).toMatch(/amount mismatch/i)

      await expectBookingUntouched(booking.id)
    } finally {
      await booking.cleanup()
      await clearPayfastMockReceived()
    }
  })

  // ---------------------------------------------------------------------------
  // Test 3 — server confirmation INVALID → 502 (mock `invalid` mode).
  // ---------------------------------------------------------------------------
  test("server confirmation returning INVALID yields a 502 and leaves the booking untouched", async ({
    page,
  }) => {
    // ----- Arrange ------------------------------------------------------------
    const { unitId } = await getSeededIds()
    const booking = await createBookingForUnit(unitId, "In Progress")
    await signInAsSeededUser(page)

    try {
      // Flip the mock so /eng/query/validate returns "INVALID". A fully-valid
      // ITN now passes steps 1-3, then step 4's server confirmation fails →
      // 502 transient (also records an incident, which we don't assert on to
      // avoid coupling the test to the incidents table's dedup window).
      await setPayfastMockMode({ kind: "invalid" })

      const fields: Record<string, string> = {
        merchant_id: requireMerchantId(),
        m_payment_id: booking.id,
        pf_payment_id: uniquePfId(),
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
      // 502 is the transient class — PayFast SHOULD retry, which is the right
      // behaviour when our server-side confirmation can't be trusted.
      expect(
        res.status,
        "INVALID server confirmation must be a transient 502, not a 4xx"
      ).toBe(502)
      const body = (await res.json()) as { ok: boolean; reason: string }
      expect(body.ok).toBe(false)
      expect(body.reason).toMatch(/server confirmation|non-valid/i)

      await expectBookingUntouched(booking.id)
    } finally {
      await resetPayfastMockMode()
      await booking.cleanup()
      await clearPayfastMockReceived()
    }
  })
})
