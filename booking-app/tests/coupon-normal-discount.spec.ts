/* eslint-disable no-console */
// =============================================================================
// /create-booking — coupon NORMAL-discount path (booking still pays via PayFast)
//
// HOW TO RUN
// -----------
// First time (creates seeded fixtures in the dev Supabase):
//
//     cd booking-app
//     PLAYWRIGHT_SEED=1 npx playwright test coupon-normal-discount.spec.ts --project=chromium
//
// Subsequent runs (re-uses the seeded fixtures — no DB writes from setup):
//
//     npx playwright test coupon-normal-discount.spec.ts --project=chromium
//
// Required env (.env.local in booking-app/):
//     NEXT_PUBLIC_SUPABASE_URL=...
//     NEXT_PUBLIC_SUPABASE_ANON_KEY=...
//     SUPABASE_SERVICE_ROLE_KEY=...        (PLAYWRIGHT_SEED=1 only)
//
// WHAT THIS TEST GUARDS
// ----------------------
// The companion R0 (100%-off) path is covered by coupon-r0-happy-path.spec.ts.
// This file covers the OTHER coupon branch — a coupon was applied, the final
// amount is > R0, and the booking still pays through PayFast.
//
// Three catchable revenue bugs live in the parts we can test without standing
// up a PayFast mock for the ITN leg:
//
//   1. DISCOUNT MATH on the apply route — a regression in resolveDiscount() or
//      the apply route would silently let the wrong finalAmount/discountAmount
//      pair land on the booking row.
//   2. BOOKING-ROW DENORM after apply — payment_amount must match the
//      discounted final, payment_type must stay NULL (NOT flip to "coupon_comp"
//      — that would mean we accidentally routed through the R0 bypass path),
//      and the status must stay "In Progress" so the PayFast leg can proceed.
//   3. PAYFAST INITIATE OUTBOUND AMOUNT — the real revenue bug. If the
//      initiate route reads the wrong field (e.g. original_amount instead of
//      payment_amount) the patient gets charged full price even though the
//      booking row says they should get the discount.
//
// SCOPE GUARDS
// -------------
// The ITN-back-into-Payment-Complete leg is OUT OF SCOPE here — we don't have
// a PayFast mock yet, and the operator-facing UI's revenue exposure is fully
// captured by asserting on the outbound /api/payfast/initiate payload's
// `amount` field. Adding a PayFast mock for the ITN flip is logged as a
// separate follow-up.
//
// FIXTURES
// --------
// Each test creates a one-off coupon with a `Date.now()`-suffixed code to
// dodge the `coupons.code_lower` unique index when parallel runs collide.
// The seeded 100%-off `100OFF-PLAYWRIGHT` coupon stays untouched (R0 file
// uses it). Cleanup happens in `finally` blocks alongside the booking
// cleanup — coupon delete cascades the coupon_uses row (FK CASCADE from
// migration 033).
// =============================================================================

import { test, expect } from "@playwright/test"
import {
  CSRF_HEADER_NAME,
  readCsrfToken,
  signInAsSeededUser,
} from "./_helpers/auth"
import {
  createBookingForUnit,
  createDiscountCoupon,
  getSeededIds,
  getSeededUserId,
  readBooking,
} from "./_helpers/fixtures"
import { prefixedMPaymentId } from "./_helpers/payfast"

// Shared admin/auth/fixtures helpers extracted to tests/_helpers/ — see
// the imports above. Includes: getAdmin (cached), readBooking (kitchen-
// sink columns), createBookingForUnit, createDiscountCoupon (one-off
// scoped to a client), getSeededIds, getSeededUserId, signInAsSeededUser,
// readCsrfToken, CSRF_HEADER_NAME constant.

// =============================================================================
// Tests
// =============================================================================

// Force these tests to run serially in a single worker for the same reason as
// coupon-r0-happy-path.spec.ts: the Next.js dev server (which Playwright auto-
// starts via webServer in playwright.config.ts) serialises compilation on a
// single process; parallel workers slamming it concurrently can stall request
// handling long enough to trip Playwright's 30-second test timeout.
test.describe.configure({ mode: "serial" })

test.describe("Coupon normal-discount (still pays via PayFast)", () => {
  // ---------------------------------------------------------------------------
  // Test A — 50%-off coupon: apply maths + booking-row invariants
  //
  // Guards: discount calculation, payment_amount denorm, payment_type stays
  // NULL (the path-distinguishing invariant — "coupon_comp" would mean we
  // accidentally exercised the R0 bypass), status stays "In Progress" so the
  // PayFast leg can still proceed.
  // ---------------------------------------------------------------------------
  test("apply 50%-off coupon: booking shows discounted amount, stays In Progress, payment_type unchanged", async ({
    page,
  }) => {
    // ----- Arrange ------------------------------------------------------------
    const { clientId, unitId } = await getSeededIds()
    const createdBy = await getSeededUserId()
    const coupon = await createDiscountCoupon(clientId, createdBy, {
      discount_type: "percentage",
      discount_value: 50,
      codePrefix: "PLAYWRIGHT-50PCT",
    })
    const booking = await createBookingForUnit(unitId, "In Progress")

    try {
      await signInAsSeededUser(page)
      const csrf = await readCsrfToken(page.context())
      const csrfHeaders = { [CSRF_HEADER_NAME]: csrf }

      // ----- Act --------------------------------------------------------------
      const applyRes = await page.request.post("/api/coupons/apply", {
        headers: csrfHeaders,
        data: { code: coupon.code, bookingId: booking.id },
      })

      // ----- Assert -----------------------------------------------------------
      expect(applyRes.status(), "apply should return 200").toBe(200)
      const applyBody = (await applyRes.json()) as {
        ok: boolean
        code: string
        originalAmount: number
        discountAmount: number
        finalAmount: number
      }
      expect(applyBody.ok).toBe(true)
      expect(applyBody.code).toBe(coupon.code)
      // 50% of R325.00 — resolveDiscount rounds to 2dp.
      expect(applyBody.originalAmount).toBe(325)
      expect(applyBody.discountAmount).toBe(162.5)
      expect(applyBody.finalAmount).toBe(162.5)

      // Booking row: discount denormalised onto bookings; PayFast leg can
      // still proceed because status stayed In Progress and payment_type
      // is still NULL (the R0 path is the one that pre-sets payment_type
      // to "coupon_comp" — staying NULL is the in-DB signal this booking
      // is on the "still pays" branch).
      const after = await readBooking(booking.id)
      expect(after?.status).toBe("In Progress")
      expect(Number(after?.payment_amount)).toBe(162.5)
      expect(Number(after?.original_amount)).toBe(325)
      expect(Number(after?.discount_amount)).toBe(162.5)
      expect(after?.coupon_id).toBe(coupon.id)
      expect(after?.coupon_code).toBe(coupon.code)
      // The path-distinguishing invariant. If this ever asserts as
      // "coupon_comp" the apply route accidentally short-circuited
      // through the R0 bypass branch — a silent loss of PayFast
      // revenue on every discounted booking.
      expect(
        after?.payment_type,
        "non-R0 coupon must not pre-set payment_type to coupon_comp"
      ).toBeNull()
    } finally {
      await booking.cleanup()
      await coupon.cleanup()
    }
  })

  // ---------------------------------------------------------------------------
  // Test B — 50%-off coupon: PayFast initiate sends the DISCOUNTED amount
  //
  // The real revenue bug. If the initiate route reads original_amount instead
  // of payment_amount (or any other regression that drops the discount), the
  // patient gets charged full price even though our booking row says they
  // should get the discount. PayFast wire format is Rand string with 2dp.
  // ---------------------------------------------------------------------------
  test("PayFast initiate uses the discounted amount, not the original", async ({
    page,
  }) => {
    // ----- Arrange ------------------------------------------------------------
    const { clientId, unitId } = await getSeededIds()
    const createdBy = await getSeededUserId()
    const coupon = await createDiscountCoupon(clientId, createdBy, {
      discount_type: "percentage",
      discount_value: 50,
      codePrefix: "PLAYWRIGHT-50PCT",
    })
    const booking = await createBookingForUnit(unitId, "In Progress")

    try {
      await signInAsSeededUser(page)
      const csrf = await readCsrfToken(page.context())
      const csrfHeaders = { [CSRF_HEADER_NAME]: csrf }

      const applyRes = await page.request.post("/api/coupons/apply", {
        headers: csrfHeaders,
        data: { code: coupon.code, bookingId: booking.id },
      })
      expect(applyRes.status(), "apply should return 200").toBe(200)

      // ----- Act --------------------------------------------------------------
      const initiateRes = await page.request.post("/api/payfast/initiate", {
        headers: csrfHeaders,
        data: { bookingId: booking.id },
      })

      // ----- Assert -----------------------------------------------------------
      expect(initiateRes.status(), "initiate should return 200").toBe(200)
      const initiateBody = (await initiateRes.json()) as {
        paymentUrl: string
        formFields: Record<string, string>
      }
      expect(initiateBody.paymentUrl).toBeTruthy()
      expect(initiateBody.formFields).toBeTruthy()

      const fields = initiateBody.formFields
      // PayFast wire format: amount as Rand string, 2dp, NO currency symbol.
      // Source of truth: src/lib/payfast.ts buildPaymentData (data.amount
      // is set from payment.amount which is `Number(payment_amount).toFixed(2)`).
      expect(
        fields.amount,
        "PayFast outbound amount must be the discounted final, not the original"
      ).toBe("162.50")
      // m_payment_id is the PREFIXED ref "<CLIENT_CODE>-<booking-uuid>" — the
      // field PayFast echoes back in its ITN so we can correlate. The seeded
      // test client carries SEED.clientCode, so buildPaymentData prefixes it.
      // Confirmed in src/lib/payfast.ts buildPaymentData:
      // `data.m_payment_id = clientCode ? `${clientCode}-${bookingId}` : bookingId`.
      expect(fields.m_payment_id).toBe(prefixedMPaymentId(booking.id))
      // Sanity-check the item name carries the coupon code (the initiate
      // route appends " (coupon <CODE>)" when a coupon is applied) so a
      // refund / dispute investigation can see which code was used.
      expect(fields.item_name).toContain(coupon.code)
      // Belt and braces: payment_amount on the booking row hasn't been
      // clobbered back to the original by the initiate route's "write
      // payment_amount if null" branch. The initiate route guards on null,
      // but a regression there would silently overwrite the discounted
      // value. Re-read the row to confirm.
      const afterInitiate = await readBooking(booking.id)
      expect(Number(afterInitiate?.payment_amount)).toBe(162.5)
      expect(afterInitiate?.payment_type).toBeNull()
      expect(afterInitiate?.status).toBe("In Progress")
    } finally {
      await booking.cleanup()
      await coupon.cleanup()
    }
  })

  // ---------------------------------------------------------------------------
  // Test C — Fixed R100-off coupon: catches a different math regression
  //          than the percentage tests.
  //
  // The fixed-amount branch of resolveDiscount() is a separate code path
  // (`discount = round2(Number(coupon.discount_value))` instead of the
  // percentage multiplication). A regression in either branch independently
  // is plausible; covering both gives us a real net.
  // ---------------------------------------------------------------------------
  test("apply fixed R100-off coupon: booking shows R225 remaining and PayFast initiate matches", async ({
    page,
  }) => {
    // ----- Arrange ------------------------------------------------------------
    const { clientId, unitId } = await getSeededIds()
    const createdBy = await getSeededUserId()
    const coupon = await createDiscountCoupon(clientId, createdBy, {
      discount_type: "fixed",
      discount_value: 100,
      codePrefix: "PLAYWRIGHT-R100OFF",
    })
    const booking = await createBookingForUnit(unitId, "In Progress")

    try {
      await signInAsSeededUser(page)
      const csrf = await readCsrfToken(page.context())
      const csrfHeaders = { [CSRF_HEADER_NAME]: csrf }

      // ----- Act --------------------------------------------------------------
      const applyRes = await page.request.post("/api/coupons/apply", {
        headers: csrfHeaders,
        data: { code: coupon.code, bookingId: booking.id },
      })

      // ----- Assert (apply) ---------------------------------------------------
      expect(applyRes.status(), "apply should return 200").toBe(200)
      const applyBody = (await applyRes.json()) as {
        ok: boolean
        originalAmount: number
        discountAmount: number
        finalAmount: number
      }
      expect(applyBody.ok).toBe(true)
      // R325 - R100 = R225. Fixed-amount discount uses the raw value,
      // capped at the booking amount (resolveDiscount: discount = min(value, amount)).
      expect(applyBody.originalAmount).toBe(325)
      expect(applyBody.discountAmount).toBe(100)
      expect(applyBody.finalAmount).toBe(225)

      const after = await readBooking(booking.id)
      expect(after?.status).toBe("In Progress")
      expect(Number(after?.payment_amount)).toBe(225)
      expect(after?.payment_type).toBeNull()

      // ----- Assert (PayFast initiate carries through) ------------------------
      const initiateRes = await page.request.post("/api/payfast/initiate", {
        headers: csrfHeaders,
        data: { bookingId: booking.id },
      })
      expect(initiateRes.status()).toBe(200)
      const initiateBody = (await initiateRes.json()) as {
        paymentUrl: string
        formFields: Record<string, string>
      }
      // R225.00 — discounted total in PayFast's 2dp Rand-string format.
      expect(initiateBody.formFields.amount).toBe("225.00")
      // Prefixed ref — seeded client carries SEED.clientCode (see Test B note).
      expect(initiateBody.formFields.m_payment_id).toBe(prefixedMPaymentId(booking.id))
    } finally {
      await booking.cleanup()
      await coupon.cleanup()
    }
  })
})
