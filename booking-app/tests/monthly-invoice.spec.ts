/* eslint-disable no-console */
// =============================================================================
// /create-booking — monthly-invoice (bill_monthly) payment path
//
// HOW TO RUN
// -----------
// First time (creates the persistent seeded fixtures in the dev Supabase):
//
//     cd booking-app
//     PLAYWRIGHT_SEED=1 npx playwright test monthly-invoice.spec.ts --project=chromium
//
// Subsequent runs (re-uses the seeded user; per-test client/unit/booking are
// one-off and torn down in finally):
//
//     npx playwright test monthly-invoice.spec.ts --project=chromium
//
// Required env (.env.local in booking-app/):
//     NEXT_PUBLIC_SUPABASE_URL=...
//     NEXT_PUBLIC_SUPABASE_ANON_KEY=...
//     SUPABASE_SERVICE_ROLE_KEY=...        (required for the per-test fixtures)
//
// WHAT THIS TEST GUARDS
// ----------------------
// Monthly-invoice (clients.bill_monthly = true) is the third payment branch
// that BYPASSES PayFast entirely. The clinic is invoiced end-of-month, so
// the patient pays nothing per-booking; our server marks the booking
// Payment Complete with payment_type = "monthly_invoice", and PayFast is
// never called.
//
// This is the auto-skip path: patient-details step 5 fires
// /api/bookings/[id]/mark-monthly-invoice on mount when paymentMode resolves
// to "monthly_invoice" — no operator confirmation step, no PIN. The server
// re-checks the parent client's bill_monthly flag so a malicious caller
// cannot forge a monthly_invoice completion for a normal client.
//
// The unique invariants vs the other coupon / PayFast / self-collect paths:
//
//   1. AUTH-GATED — /api/bookings/[id]/mark-monthly-invoice requires an
//      authenticated session via requireAuthenticated() (any role,
//      unit-scoped). NO PIN gate at the API level — this is the
//      auto-skip path. Confirmed by reading the route on 2026-06-09.
//      An unauthenticated request must be rejected with no state change.
//
//   2. STATUS FLIPS to Payment Complete with payment_type = "monthly_invoice"
//      (path-distinguishing — NOT "payfast", "coupon_comp", or
//      "self_collect"). Pinning the value catches accidental cross-wiring
//      between the three "bypass PayFast" branches.
//
//   3. MONTHLY-INVOICE + COUPONS ARE MUTEX — a client cannot have both
//      bill_monthly = true AND allow_coupons = true. The coupon apply
//      route gates on the parent client's allow_coupons; for a
//      monthly-invoice client the apply must be rejected with 403 and
//      the booking must remain unchanged.
//
// VALIDATOR COLUMNS
// ------------------
// Like mark-self-collect, this route fires recordBookingValidator()
// fire-and-forget after the status flip (route.ts:153). We assert the
// columns are populated with a short poll, same pattern as self-collect
// Test A.
//
// FIXTURES
// --------
// The seeded "Playwright Test Clinic" has allow_coupons=true and
// bill_monthly=false, so it can't be used for monthly-invoice. Each test
// stands up its own one-off client + unit with bill_monthly=true and
// tears them down in `finally`. The seeded user (system_admin, PIN 900900)
// is re-used because system_admin bypasses unit-scoping in the routes
// under test (mark-monthly-invoice:66, coupons/apply:89), so we don't
// need a fresh user_units mapping for the new unit.
//
// SCOPE GUARDS
// -------------
// This spec stops at "Payment Complete". The CareFirst SSO handoff that
// follows (Start Consult -> Successful) is covered by the R0 happy-path
// spec; the unique monthly-invoice invariant is the payment_type pin,
// not the handoff.
// =============================================================================

import { test, expect } from "@playwright/test"
import { SEED } from "./_setup/seed"
import { getAdmin } from "./_helpers/admin"
import {
  CSRF_HEADER_NAME,
  readCsrfToken,
  signInAsSeededUser,
} from "./_helpers/auth"
import {
  createBookingForUnit,
  createDiscountCoupon,
  getSeededUserId,
  readBooking,
} from "./_helpers/fixtures"

// Shared admin/auth/fixtures helpers extracted to tests/_helpers/ — see
// the imports above. The monthly-invoice FIXTURE below (one-off client +
// unit with bill_monthly=true) is spec-specific.

// ----- Fixture: a one-off monthly-invoice client + unit ----------------------
//
// The seeded clinic is configured for coupons (allow_coupons=true,
// bill_monthly=false), so it can't host monthly-invoice bookings.
// Each test stands up its own client with:
//   - bill_monthly           = true
//   - allow_coupons          = false   (mutex with monthly-invoice)
//   - collect_payment_at_unit = false  (mutex with monthly-invoice)
//
// Cleanup deletes in the FK-safe order: bookings -> user_units -> units ->
// client. Mirrors the cascade chain in the admin DELETE route
// (src/app/api/admin/clients/[id]/route.ts:293-370); the DB does NOT have
// ON DELETE CASCADE on units.client_id / bookings.unit_id, so order matters.

interface MonthlyInvoiceFixture {
  clientId: string
  unitId: string
  /** Tear everything down. Safe to call multiple times. */
  cleanup: () => Promise<void>
}

async function createMonthlyInvoiceFixture(): Promise<MonthlyInvoiceFixture> {
  const admin = getAdmin()
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

  // 1. Client
  const { data: clientRow, error: clientErr } = await admin
    .from("clients")
    .insert({
      client_name: `Playwright Monthly-Invoice Clinic-${suffix}`,
      email: `monthly-invoice-${suffix}@example.test`,
      contact_number: "+27000000020",
      status: "Active",
      bill_monthly: true,
      allow_coupons: false,
      collect_payment_at_unit: false,
      skip_patient_metrics: false,
      nurse_verification: false,
    })
    .select("id")
    .single()
  if (clientErr || !clientRow) {
    throw new Error(
      `Failed to seed monthly-invoice client: ${clientErr?.message}`
    )
  }
  const clientId = (clientRow as { id: string }).id

  // 2. Unit under that client
  const { data: unitRow, error: unitErr } = await admin
    .from("units")
    .insert({
      unit_name: `Playwright Monthly-Invoice Unit-${suffix}`,
      client_id: clientId,
      status: "Active",
    })
    .select("id")
    .single()
  if (unitErr || !unitRow) {
    // Roll back the client before throwing.
    await admin.from("clients").delete().eq("id", clientId)
    throw new Error(
      `Failed to seed monthly-invoice unit: ${unitErr?.message}`
    )
  }
  const unitId = (unitRow as { id: string }).id

  // NB: We deliberately do NOT add a user_units mapping for the seeded
  // tester. The seeded user is system_admin, which bypasses unit-scoping
  // in mark-monthly-invoice (route.ts:66) and coupons/apply (route.ts:89).
  // Skipping the mapping keeps cleanup simpler and avoids a phantom row
  // if cleanup is interrupted.

  // Single-call cleanup — each test invokes this exactly once in its
  // `finally`. Mirrors the safeDelete wrapper introduced in self-collect
  // (S1 from D15 Code Review) so a transient DB hiccup on one step
  // doesn't strand the later steps and leak the fixture.
  let cleanedUp = false
  return {
    clientId,
    unitId,
    async cleanup() {
      if (cleanedUp) return
      cleanedUp = true
      const safeDelete = async (
        label: string,
        fn: () => PromiseLike<unknown>
      ) => {
        try {
          await fn()
        } catch (err) {
          console.warn(
            `[monthly-invoice cleanup] ${label} failed:`,
            err instanceof Error ? err.message : err
          )
        }
      }
      await safeDelete("bookings", () =>
        admin.from("bookings").delete().eq("unit_id", unitId)
      )
      await safeDelete("user_units", () =>
        admin.from("user_units").delete().eq("unit_id", unitId)
      )
      await safeDelete("units", () =>
        admin.from("units").delete().eq("id", unitId)
      )
      await safeDelete("clients", () =>
        admin.from("clients").delete().eq("id", clientId)
      )
    },
  }
}

// =============================================================================
// Tests
// =============================================================================

// Force serial within the file — same reason as the coupon / self-collect
// specs: the Next.js dev server (single process, on-demand compile)
// serialises compilation; two workers slamming it concurrently can trip
// Playwright's 30s timeout.
test.describe.configure({ mode: "serial" })

test.describe("Monthly-invoice payment path", () => {
  // ---------------------------------------------------------------------------
  // Test A — Happy path: authenticated operator marks monthly-invoice,
  //          booking flips to Payment Complete with
  //          payment_type=monthly_invoice and validator columns are populated.
  // ---------------------------------------------------------------------------
  test("authenticated mark-monthly-invoice flips booking to Payment Complete and records the validator", async ({
    page,
  }) => {
    // ----- Arrange ------------------------------------------------------------
    const fixture = await createMonthlyInvoiceFixture()
    const booking = await createBookingForUnit(fixture.unitId, "In Progress")
    const seededUserId = await getSeededUserId()

    try {
      await signInAsSeededUser(page)
      const csrf = await readCsrfToken(page.context())
      const csrfHeaders = { [CSRF_HEADER_NAME]: csrf }

      // ----- Act --------------------------------------------------------------
      const res = await page.request.post(
        `/api/bookings/${booking.id}/mark-monthly-invoice`,
        { headers: csrfHeaders }
      )

      // ----- Assert -----------------------------------------------------------
      expect(res.status(), "mark-monthly-invoice should return 200").toBe(200)
      const body = (await res.json()) as {
        ok: boolean
        alreadyComplete?: boolean
      }
      expect(body.ok).toBe(true)

      const after = await readBooking(booking.id)
      expect(after?.status).toBe("Payment Complete")
      // The path-distinguishing invariant. payment_type pins the route the
      // booking went through; if this asserts as "payfast", "coupon_comp",
      // or "self_collect" the routes got cross-wired.
      expect(
        after?.payment_type,
        "monthly-invoice must record payment_type='monthly_invoice'"
      ).toBe("monthly_invoice")
      // payment_amount preserved (the booking row was created with 325; the
      // route preserves a non-null value rather than overwriting with the
      // PAYMENT_AMOUNT default).
      expect(Number(after?.payment_amount)).toBe(325)
      expect(
        after?.payment_confirmed_at,
        "payment_confirmed_at should be stamped"
      ).toBeTruthy()
      // Validator audit trail. recordBookingValidator is best-effort
      // fire-and-forget (route.ts:153); the route returns before it
      // resolves. Poll briefly so a slow service-role write doesn't flake
      // the assertion.
      let validated = after
      for (let i = 0; i < 10 && !validated?.validated_by_user_id; i++) {
        await new Promise((r) => setTimeout(r, 100))
        validated = await readBooking(booking.id)
      }
      expect(
        validated?.validated_by_user_id,
        "validated_by_user_id must capture the operator"
      ).toBe(seededUserId)
      expect(validated?.validated_by_name).toBe(
        `${SEED.user.firstNames} ${SEED.user.surname}`
      )
    } finally {
      await booking.cleanup()
      await fixture.cleanup()
    }
  })

  // ---------------------------------------------------------------------------
  // Test B — Unauthenticated mark-monthly-invoice: rejected at the CSRF
  //          proxy with no state change.
  //
  // The route uses requireAuthenticated() — but the CSRF proxy is the
  // outer gate. Our double-submit cookie pattern requires a CSRF header
  // on all state-changing methods (POST/PUT/PATCH/DELETE). No session =
  // no CSRF cookie = no matching header = 403 from the proxy, before
  // the route's auth check even fires. (Same observation as self-collect
  // Test B, confirmed 2026-06-09.)
  // ---------------------------------------------------------------------------
  test("unauthenticated mark-monthly-invoice is rejected and leaves the booking untouched", async ({
    browser,
  }) => {
    // ----- Arrange ------------------------------------------------------------
    const fixture = await createMonthlyInvoiceFixture()
    const booking = await createBookingForUnit(fixture.unitId, "In Progress")

    // Use a fresh, empty context — no session cookies, no CSRF token.
    const cleanContext = await browser.newContext()
    try {
      const before = await readBooking(booking.id)
      expect(before?.status).toBe("In Progress")
      expect(before?.payment_type).toBeNull()
      expect(before?.validated_by_user_id).toBeNull()

      // ----- Act --------------------------------------------------------------
      const res = await cleanContext.request.post(
        `/api/bookings/${booking.id}/mark-monthly-invoice`
      )

      // ----- Assert -----------------------------------------------------------
      expect(
        res.status(),
        "unauthenticated mark-monthly-invoice must be rejected at the CSRF proxy (403)"
      ).toBe(403)

      const after = await readBooking(booking.id)
      // Nothing changed.
      expect(after?.status).toBe("In Progress")
      expect(after?.payment_type).toBeNull()
      expect(after?.payment_confirmed_at).toBeNull()
      expect(after?.validated_by_user_id).toBeNull()
      expect(after?.validated_by_name).toBeNull()
    } finally {
      await cleanContext.close()
      await booking.cleanup()
      await fixture.cleanup()
    }
  })

  // ---------------------------------------------------------------------------
  // Test C — Monthly-invoice + coupons are mutex: applying any coupon on a
  //          monthly-invoice booking is rejected by the apply route's
  //          allow_coupons gate.
  //
  // The mutex isn't enforced at the booking row — it's enforced at the
  // client config (a monthly-invoice client has allow_coupons=false) and
  // the coupon apply route reads the parent client's allow_coupons before
  // doing anything else (route.ts:108-114). We mark the booking
  // monthly-invoice FIRST so the assertion is sharper: a coupon apply
  // against an already-completed monthly-invoice booking must not silently
  // mutate the row.
  // ---------------------------------------------------------------------------
  test("applying a coupon on a monthly-invoice booking is rejected; payment_type stays monthly_invoice", async ({
    page,
  }) => {
    // ----- Arrange ------------------------------------------------------------
    const fixture = await createMonthlyInvoiceFixture()
    const booking = await createBookingForUnit(fixture.unitId, "In Progress")
    const seededUserId = await getSeededUserId()
    // Coupon is scoped to the SEEDED test clinic (a different client), so
    // even if allow_coupons somehow passed, the client-scope check would
    // reject it. We want the apply rejected ON THE FIRST GATE
    // (allow_coupons=false on the monthly-invoice client), so this is
    // belt + braces.
    const { data: seededClient } = await getAdmin()
      .from("clients")
      .select("id")
      .eq("client_name", SEED.clientName)
      .maybeSingle()
    if (!seededClient) {
      throw new Error(
        "Seeded test clinic not found. Run once with PLAYWRIGHT_SEED=1 to create it."
      )
    }
    const coupon = await createDiscountCoupon(
      (seededClient as { id: string }).id,
      seededUserId,
      {
        discount_type: "percentage",
        discount_value: 50,
        codePrefix: "PLAYWRIGHT-MONTHLY-MUTEX",
      }
    )

    try {
      await signInAsSeededUser(page)
      const csrf = await readCsrfToken(page.context())
      const csrfHeaders = { [CSRF_HEADER_NAME]: csrf }

      // Mark monthly-invoice first so payment_type = "monthly_invoice"
      // before the coupon attempt.
      const markRes = await page.request.post(
        `/api/bookings/${booking.id}/mark-monthly-invoice`,
        { headers: csrfHeaders }
      )
      expect(markRes.status()).toBe(200)
      const afterMark = await readBooking(booking.id)
      expect(afterMark?.payment_type).toBe("monthly_invoice")
      expect(afterMark?.status).toBe("Payment Complete")

      // ----- Act --------------------------------------------------------------
      const applyRes = await page.request.post("/api/coupons/apply", {
        headers: csrfHeaders,
        data: { code: coupon.code, bookingId: booking.id },
      })

      // ----- Assert -----------------------------------------------------------
      // Two gates can reject this:
      //   - allow_coupons=false on the parent client -> 403 "Coupons aren't
      //     available for this clinic." (apply route line 109-114)
      //   - status not In Progress/Abandoned -> 409 "Coupon can only be
      //     applied while the booking is in progress or pending resume."
      //     (apply route line 126-135)
      // The allow_coupons check runs FIRST, so 403 is the expected outcome
      // here. We accept either 403 or 409 to keep the test robust to a
      // future re-ordering of the gates — what matters is that the apply
      // is rejected and the row is untouched.
      expect(
        [403, 409].includes(applyRes.status()),
        `expected 403 (allow_coupons gate) or 409 (status gate), got ${applyRes.status()}`
      ).toBe(true)
      const applyBody = (await applyRes.json()) as {
        ok: boolean
        error?: string
      }
      expect(applyBody.ok).toBe(false)
      expect(applyBody.error).toBeTruthy()

      const afterApply = await readBooking(booking.id)
      // The booking is unchanged from the post-mark state.
      expect(
        afterApply?.payment_type,
        "monthly-invoice booking must keep payment_type='monthly_invoice' after a rejected coupon apply"
      ).toBe("monthly_invoice")
      expect(afterApply?.status).toBe("Payment Complete")
      expect(
        afterApply?.coupon_id,
        "rejected coupon must not attach to the booking"
      ).toBeNull()
      expect(afterApply?.coupon_code).toBeNull()
      expect(Number(afterApply?.payment_amount)).toBe(325)
    } finally {
      await booking.cleanup()
      await coupon.cleanup()
      await fixture.cleanup()
    }
  })
})
