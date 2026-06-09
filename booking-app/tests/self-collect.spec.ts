/* eslint-disable no-console */
// =============================================================================
// /create-booking — self-collect (collect_payment_at_unit) payment path
//
// HOW TO RUN
// -----------
// First time (creates the persistent seeded fixtures in the dev Supabase):
//
//     cd booking-app
//     PLAYWRIGHT_SEED=1 npx playwright test self-collect.spec.ts --project=chromium
//
// Subsequent runs (re-uses the seeded user; per-test client/unit/booking are
// one-off and torn down in finally):
//
//     npx playwright test self-collect.spec.ts --project=chromium
//
// Required env (.env.local in booking-app/):
//     NEXT_PUBLIC_SUPABASE_URL=...
//     NEXT_PUBLIC_SUPABASE_ANON_KEY=...
//     SUPABASE_SERVICE_ROLE_KEY=...        (required for the per-test fixtures)
//
// WHAT THIS TEST GUARDS
// ----------------------
// Self-collect (clients.collect_payment_at_unit = true) is the payment branch
// that BYPASSES PayFast entirely. The unit collects the consultation fee from
// the patient directly; our server marks the booking Payment Complete with
// payment_type = "self_collect", and PayFast never gets called.
//
// The unique invariants vs the other coupon / PayFast paths:
//
//   1. AUTH-GATED — /api/bookings/[id]/mark-self-collect requires an
//      authenticated session. (The server route is NOT PIN-gated — PIN
//      re-verification happens client-side via a separate
//      /api/verify/manager-pin call before the UI fires mark-self-collect.
//      Confirmed by reading the route on 2026-06-09.) An unauthenticated
//      request must 401 with no state change.
//
//   2. STATUS FLIPS to Payment Complete with payment_type = "self_collect"
//      (path-distinguishing — NOT "payfast", "coupon_comp", or
//      "monthly_invoice"). Pinning the value catches accidental cross-wiring
//      between the three "bypass PayFast" branches.
//
//   3. VALIDATOR RECORDED — validated_by_user_id / validated_by_name on the
//      booking row reflect the operator who confirmed self-collect. The
//      Excel export keys off these columns; a regression in
//      recordBookingValidator() (or the wiring at the call-site) would
//      drop the audit trail silently.
//
//   4. SELF-COLLECT + COUPONS ARE MUTEX — a client cannot have both
//      collect_payment_at_unit = true AND allow_coupons = true. The coupon
//      apply route gates on the parent client's allow_coupons; for a
//      self-collect client the apply must be rejected with 403 and the
//      booking must remain unchanged.
//
// FIXTURES
// --------
// The seeded "Playwright Test Clinic" has allow_coupons=true and
// collect_payment_at_unit=false, so it can't be used for self-collect. Each
// test stands up its own one-off client + unit with the correct flag combo
// and tears them down in `finally`. The seeded user (system_admin, PIN 900900)
// is re-used because system_admin bypasses unit-scoping in the routes under
// test (mark-self-collect:61, coupon apply:89), so we don't need a fresh
// user_units mapping for the new unit.
//
// SCOPE GUARDS
// -------------
// This spec stops at "Payment Complete". The CareFirst SSO handoff that
// follows (Start Consult -> Successful) is covered by the R0 happy-path
// spec; the unique self-collect invariant is the payment_type pin, not the
// handoff.
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
// the imports above. The self-collect FIXTURE below (one-off client +
// unit with collect_payment_at_unit=true) is spec-specific.

// ----- Fixture: a one-off self-collect client + unit -------------------------
//
// The seeded clinic is configured for coupons (allow_coupons=true,
// collect_payment_at_unit=false), so it can't host self-collect bookings.
// Each test stands up its own client with:
//   - collect_payment_at_unit = true
//   - allow_coupons          = false   (mutex with self-collect)
//   - bill_monthly           = false   (mutex with self-collect)
//
// Cleanup deletes in the FK-safe order: bookings -> user_units -> units ->
// client. Mirrors the cascade chain in the admin DELETE route
// (src/app/api/admin/clients/[id]/route.ts:293-370); the DB does NOT have
// ON DELETE CASCADE on units.client_id / bookings.unit_id, so order matters.

interface SelfCollectFixture {
  clientId: string
  unitId: string
  /** Tear everything down. Safe to call multiple times. */
  cleanup: () => Promise<void>
}

async function createSelfCollectFixture(): Promise<SelfCollectFixture> {
  const admin = getAdmin()
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

  // 1. Client
  const { data: clientRow, error: clientErr } = await admin
    .from("clients")
    .insert({
      client_name: `Playwright Self-Collect Clinic-${suffix}`,
      email: `self-collect-${suffix}@example.test`,
      contact_number: "+27000000010",
      status: "Active",
      collect_payment_at_unit: true,
      allow_coupons: false,
      bill_monthly: false,
      skip_patient_metrics: false,
      nurse_verification: false,
    })
    .select("id")
    .single()
  if (clientErr || !clientRow) {
    throw new Error(`Failed to seed self-collect client: ${clientErr?.message}`)
  }
  const clientId = (clientRow as { id: string }).id

  // 2. Unit under that client
  const { data: unitRow, error: unitErr } = await admin
    .from("units")
    .insert({
      unit_name: `Playwright Self-Collect Unit-${suffix}`,
      client_id: clientId,
      status: "Active",
    })
    .select("id")
    .single()
  if (unitErr || !unitRow) {
    // Roll back the client before throwing.
    await admin.from("clients").delete().eq("id", clientId)
    throw new Error(`Failed to seed self-collect unit: ${unitErr?.message}`)
  }
  const unitId = (unitRow as { id: string }).id

  // NB: We deliberately do NOT add a user_units mapping for the seeded
  // tester. The seeded user is system_admin, which bypasses unit-scoping
  // in mark-self-collect (route.ts:61) and coupons/apply (route.ts:89).
  // Skipping the mapping keeps cleanup simpler and avoids a phantom row
  // if cleanup is interrupted.

  // Single-call cleanup — each test invokes this exactly once in its
  // `finally`. If a future hook needs concurrent calls, switch to a
  // shared-promise pattern.
  let cleanedUp = false
  return {
    clientId,
    unitId,
    async cleanup() {
      if (cleanedUp) return
      cleanedUp = true
      // Order matters — no FK cascade on these tables. Each step is
      // wrapped so a failure (e.g. a future migration adds an unmet
      // constraint) doesn't strand the later steps and leak the fixture.
      const safeDelete = async (label: string, fn: () => PromiseLike<unknown>) => {
        try {
          await fn()
        } catch (err) {
          console.warn(
            `[self-collect cleanup] ${label} failed:`,
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

// Force serial within the file — same reason as the coupon specs: the Next.js
// dev server (single process, on-demand compile) serialises compilation; two
// workers slamming it concurrently can trip Playwright's 30s timeout.
test.describe.configure({ mode: "serial" })

test.describe("Self-collect payment path", () => {
  // ---------------------------------------------------------------------------
  // Test A — Happy path: authenticated operator marks self-collect, booking
  //          flips to Payment Complete with payment_type=self_collect and
  //          validator columns are populated.
  // ---------------------------------------------------------------------------
  test("authenticated mark-self-collect flips booking to Payment Complete and records the validator", async ({
    page,
  }) => {
    // ----- Arrange ------------------------------------------------------------
    const fixture = await createSelfCollectFixture()
    const booking = await createBookingForUnit(fixture.unitId, "In Progress")
    const seededUserId = await getSeededUserId()

    try {
      await signInAsSeededUser(page)
      const csrf = await readCsrfToken(page.context())
      const csrfHeaders = { [CSRF_HEADER_NAME]: csrf }

      // ----- Act --------------------------------------------------------------
      const res = await page.request.post(
        `/api/bookings/${booking.id}/mark-self-collect`,
        { headers: csrfHeaders }
      )

      // ----- Assert -----------------------------------------------------------
      expect(res.status(), "mark-self-collect should return 200").toBe(200)
      const body = (await res.json()) as { ok: boolean; alreadyComplete?: boolean }
      expect(body.ok).toBe(true)

      const after = await readBooking(booking.id)
      expect(after?.status).toBe("Payment Complete")
      // The path-distinguishing invariant. payment_type pins the route the
      // booking went through; if this asserts as "payfast", "coupon_comp",
      // or "monthly_invoice" the routes got cross-wired.
      expect(
        after?.payment_type,
        "self-collect must record payment_type='self_collect'"
      ).toBe("self_collect")
      // payment_amount preserved (the booking row was created with 325; the
      // route doesn't overwrite a non-null value).
      expect(Number(after?.payment_amount)).toBe(325)
      expect(
        after?.payment_confirmed_at,
        "payment_confirmed_at should be stamped"
      ).toBeTruthy()
      // Validator audit trail. recordBookingValidator is best-effort
      // fire-and-forget; the route returns before it resolves. Poll briefly
      // so a slow service-role write doesn't flake the assertion.
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
  // Test B — Unauthenticated mark-self-collect: 401 with no state change.
  //
  // The route uses requireAuthenticated() — no session cookie means 401
  // before any DB writes. (The PIN re-verification that the UI performs
  // BEFORE calling mark-self-collect happens against the separate
  // /api/verify/manager-pin route; mark-self-collect itself accepts no
  // PIN. Confirmed by reading the route on 2026-06-09.) An unauthenticated
  // hit is the meaningful "wrong credentials" test here.
  // ---------------------------------------------------------------------------
  test("unauthenticated mark-self-collect is rejected and leaves the booking untouched", async ({
    browser,
  }) => {
    // ----- Arrange ------------------------------------------------------------
    const fixture = await createSelfCollectFixture()
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
        `/api/bookings/${booking.id}/mark-self-collect`
      )

      // ----- Assert -----------------------------------------------------------
      // CSRF proxy returns 403 BEFORE the route's requireAuthenticated()
      // check fires — our double-submit cookie pattern requires a CSRF
      // header on all state-changing methods (POST/PUT/PATCH/DELETE).
      // No session = no CSRF cookie = no matching header = 403 from the
      // proxy. The route never gets to the DB write either way; both
      // 401 and 403 prove "unauthenticated request can't mutate state".
      // We assert 403 because that's the actual contract (proxy layer is
      // the outer gate).
      expect(
        res.status(),
        "unauthenticated mark-self-collect must be rejected at the CSRF proxy (403)"
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
  // Test C — Self-collect + coupons are mutex: applying any coupon on a
  //          self-collect booking is rejected by the apply route's
  //          allow_coupons gate.
  //
  // The mutex isn't enforced at the booking row — it's enforced at the
  // client config (a self-collect client has allow_coupons=false) and the
  // coupon apply route reads the parent client's allow_coupons before
  // doing anything else. We mark the booking self-collect FIRST so the
  // assertion is sharper: a coupon apply against an already-completed
  // self-collect booking must not silently mutate the row.
  // ---------------------------------------------------------------------------
  test("applying a coupon on a self-collect booking is rejected; payment_type stays self_collect", async ({
    page,
  }) => {
    // ----- Arrange ------------------------------------------------------------
    const fixture = await createSelfCollectFixture()
    const booking = await createBookingForUnit(fixture.unitId, "In Progress")
    const seededUserId = await getSeededUserId()
    // Coupon is scoped to the SEEDED test clinic (a different client), so
    // even if allow_coupons somehow passed, the client-scope check would
    // reject it. We want the apply rejected ON THE FIRST GATE
    // (allow_coupons=false), so this is belt + braces.
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
        codePrefix: "PLAYWRIGHT-MUTEX",
      }
    )

    try {
      await signInAsSeededUser(page)
      const csrf = await readCsrfToken(page.context())
      const csrfHeaders = { [CSRF_HEADER_NAME]: csrf }

      // Mark self-collect first so payment_type = "self_collect" before the
      // coupon attempt.
      const markRes = await page.request.post(
        `/api/bookings/${booking.id}/mark-self-collect`,
        { headers: csrfHeaders }
      )
      expect(markRes.status()).toBe(200)
      const afterMark = await readBooking(booking.id)
      expect(afterMark?.payment_type).toBe("self_collect")
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
      const applyBody = (await applyRes.json()) as { ok: boolean; error?: string }
      expect(applyBody.ok).toBe(false)
      expect(applyBody.error).toBeTruthy()

      const afterApply = await readBooking(booking.id)
      // The booking is unchanged from the post-mark state.
      expect(
        afterApply?.payment_type,
        "self-collect booking must keep payment_type='self_collect' after a rejected coupon apply"
      ).toBe("self_collect")
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
