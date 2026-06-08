/* eslint-disable no-console */
// =============================================================================
// /create-booking — coupon R0 (100%-off) happy path (backlog B3)
//
// HOW TO RUN
// -----------
// First time (creates seeded fixtures in the dev Supabase):
//
//     cd booking-app
//     PLAYWRIGHT_SEED=1 npx playwright test coupon-r0-happy-path.spec.ts --project=chromium
//
// Subsequent runs (re-uses the seeded fixtures — no DB writes from setup):
//
//     npx playwright test coupon-r0-happy-path.spec.ts --project=chromium
//
// Required env (.env.local in booking-app/):
//     NEXT_PUBLIC_SUPABASE_URL=...
//     NEXT_PUBLIC_SUPABASE_ANON_KEY=...
//     SUPABASE_SERVICE_ROLE_KEY=...        (PLAYWRIGHT_SEED=1 only)
//
// WHAT THIS TEST GUARDS
// ----------------------
// The R0 path is the single coupon flow that BYPASSES PayFast entirely —
// PayFast (like most gateways) refuses transactions with amount = 0, so a
// 100%-off coupon sends the booking through the dedicated
// /api/bookings/[id]/complete-coupon-comp endpoint, which transitions the
// booking straight to "Payment Complete" with payment_type = "coupon_comp".
//
// Two production bugs would have been caught by this test:
//   1. Coupon-on-Abandoned (commit 50c9dbe): operator could not apply a
//      coupon to a booking the idle-timer had flipped to "Abandoned". The
//      fix made /api/coupons/apply accept "Abandoned" and flip the booking
//      back to "In Progress". This spec exercises that path explicitly.
//   2. SECURITY DEFINER coupon trigger (migration 037): coupon discard
//      failed silently in prod because the SECURITY INVOKER trigger from
//      036 was blocked by RLS on coupon_uses. This spec at minimum proves
//      the apply -> complete-coupon-comp pair works end-to-end with the
//      current trigger configuration.
//
// SCOPE GUARDS
// -------------
// This test stops at "Payment Complete" — the unique R0 invariant. The
// CareFirst SSO handoff that would follow ("Successful") is a server-to-
// server fetch and CANNOT be mocked via page.route() (Playwright only
// intercepts browser-originated requests). Adding a stand-in CareFirst
// mock server is scoped as a separate follow-up; see the Open block in
// the orchestrator handoff.
//
// What the test DOES assert (the unique invariants):
//   - The /api/payfast/initiate endpoint is NEVER hit on the R0 path.
//   - The booking ends in status "Payment Complete" with
//     payment_type "coupon_comp" and payment_amount 0.
//   - The Abandoned -> apply -> In Progress hotfix still holds.
// =============================================================================

import { test, expect, type BrowserContext } from "@playwright/test"
import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { SEED } from "./_setup/seed"

// CSRF cookie + header names — kept in sync with src/lib/csrf.ts. Hard-coded
// here rather than imported so the test file stays free of @/lib paths
// (Playwright runs from booking-app/, no path-alias resolver in the test
// context).
const CSRF_COOKIE_NAME = "cf_csrf"
const CSRF_HEADER_NAME = "x-csrf-token"

// ----- Helpers: load env, build admin client ---------------------------------

function loadEnvLocal(): void {
  try {
    const p = join(process.cwd(), ".env.local")
    const txt = readFileSync(p, "utf8")
    for (const rawLine of txt.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith("#")) continue
      const eq = line.indexOf("=")
      if (eq < 0) continue
      const key = line.slice(0, eq).trim()
      const value = line.slice(eq + 1).trim()
      if (!key || process.env[key] !== undefined) continue
      process.env[key] = value
    }
  } catch {
    // Surfaced as a missing-env error below.
  }
}

function getAdmin() {
  loadEnvLocal()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const sr = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !sr) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env."
    )
  }
  return createClient(url, sr, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// ----- Fixture: a booking in the seeded test unit ----------------------------
//
// We create the booking directly via service-role rather than walking the
// 5-step UI form. The unique invariant under test (R0 bypasses PayFast) is
// owned by the apply + complete-coupon-comp routes — walking the form adds
// flakiness without adding signal. A separate UI-driven test can pick that
// up later.

interface CreatedBooking {
  id: string
  cleanup: () => Promise<void>
}

async function createBookingForUnit(
  unitId: string,
  initialStatus: "In Progress" | "Abandoned" = "In Progress"
): Promise<CreatedBooking> {
  const admin = getAdmin()
  const { data, error } = await admin
    .from("bookings")
    .insert({
      unit_id: unitId,
      status: initialStatus,
      current_step: "payment",
      first_names: "Playwright",
      surname: "Patient",
      id_type: "SA ID",
      // Canonical Luhn-valid SA ID per the payments-integration skill.
      id_number: "8701015800084",
      title: "Mr",
      nationality: "South African",
      gender: "Male",
      date_of_birth: "1987-01-01",
      address: "1 Test Lane",
      suburb: "Testville",
      city: "Johannesburg",
      province: "Gauteng",
      country: "South Africa",
      postal_code: "2000",
      country_code: "+27",
      contact_number: "0710000000",
      email_address: "patient.playwright@example.test",
      payment_amount: 325.0,
      original_amount: 325.0,
    })
    .select("id")
    .single()
  if (error || !data) {
    throw new Error(`Failed to seed booking: ${error?.message}`)
  }
  const id = (data as { id: string }).id

  return {
    id,
    async cleanup() {
      // coupon_uses cascades on booking delete (migration 033 FK ON DELETE
      // CASCADE). booking_validator is a denormalised column on bookings
      // itself, not a separate table — no separate cleanup needed.
      await admin.from("bookings").delete().eq("id", id)
    },
  }
}

// ----- Helpers: resolve seeded ids + read booking state -----------------------

async function getSeededIds() {
  const admin = getAdmin()
  const { data: client } = await admin
    .from("clients")
    .select("id")
    .eq("client_name", SEED.clientName)
    .maybeSingle()
  const { data: unit } = await admin
    .from("units")
    .select("id")
    .eq("unit_name", SEED.unitName)
    .maybeSingle()
  if (!client || !unit) {
    throw new Error(
      "Seeded client/unit not found. Run once with PLAYWRIGHT_SEED=1 to create them."
    )
  }
  return {
    clientId: (client as { id: string }).id,
    unitId: (unit as { id: string }).id,
  }
}

async function readBooking(bookingId: string) {
  const admin = getAdmin()
  const { data } = await admin
    .from("bookings")
    .select("status, payment_amount, payment_type, coupon_id, coupon_code")
    .eq("id", bookingId)
    .single()
  return data as {
    status: string
    payment_amount: number
    payment_type: string | null
    coupon_id: string | null
    coupon_code: string | null
  } | null
}

// ----- Helper: drive sign-in via the real UI to populate session cookies ----

async function signInAsSeededUser(page: import("@playwright/test").Page) {
  await page.goto("/sign-in")
  await expect(page.getByTestId("sign-in-heading")).toBeVisible()

  // The OTP input is wired so typing fills hidden digit inputs. The simplest
  // robust approach is to focus the first slot and type the digits — works
  // across the wrapper's autofocus/advance behaviour without depending on
  // its internal markup.
  //
  // NOTE: `.click()` on the testid resolves to a visual slot (input-otp's
  // wrapper), not the underlying hidden <input>. Focus reaches the input
  // via input-otp's pointer-down focus delegation — library behaviour we
  // rely on. If input-otp changes its focus model or we swap libraries,
  // change to: `await page.getByTestId('sign-in-pin-input').locator('input').focus()`.
  const otp = page.getByTestId("sign-in-pin-input")
  await otp.click()
  await page.keyboard.type(SEED.user.pin)

  const submit = page.getByTestId("sign-in-submit")
  await expect(submit).toBeEnabled()
  await submit.click()

  // Successful sign-in pushes to /home.
  await page.waitForURL(/\/home(\?|$)/, { timeout: 15_000 })
}

// ----- Helper: read the CSRF cookie from the browser context ----------------
//
// The dashboard's middleware enforces double-submit cookie CSRF (see
// src/middleware.ts + src/lib/csrf.ts): every state-changing API call
// must include `x-csrf-token` header matching the `cf_csrf` cookie. The
// browser app reads it via document.cookie; here we pluck it off the
// context and pass it through on `page.request` calls.
async function readCsrfToken(context: BrowserContext): Promise<string> {
  const cookies = await context.cookies()
  const csrf = cookies.find((c) => c.name === CSRF_COOKIE_NAME)
  if (!csrf || !csrf.value) {
    throw new Error(
      `CSRF cookie (${CSRF_COOKIE_NAME}) not present — middleware should have set it on /sign-in.`
    )
  }
  return csrf.value
}

// ----- Note: how we assert "PayFast was never touched" -----------------------
//
// Playwright's APIRequestContext doesn't expose an interception hook the way
// page.route() does for browser-originated traffic, and the PayFast call
// (when it happens) is fired from the browser as a hidden-form auto-submit
// to PayFast's hosted page — not via /api/payfast/initiate from this test.
// We observe ABSENCE indirectly by:
//   1. Never calling /api/payfast/initiate from this test.
//   2. Asserting the booking row's payment_type ends as "coupon_comp" (NOT
//      "payfast"). That column is the in-DB signal of which gateway path
//      took the booking to Payment Complete — anything other than
//      "coupon_comp" here means the R0 bypass invariant has broken.

// =============================================================================
// Tests
// =============================================================================

// Force these tests to run serially in a single worker. The Next.js dev
// server (which Playwright auto-starts via webServer in playwright.config.ts)
// serialises compilation on a single process; parallel workers slamming
// it concurrently can stall request handling long enough to trip
// Playwright's 30-second test timeout. Each test is fast on its own, so
// running serial costs us nothing meaningful.
test.describe.configure({ mode: "serial" })

test.describe("Coupon R0 (100%-off) bypasses PayFast", () => {
  test("apply 100%-off coupon then complete-coupon-comp flips booking to Payment Complete", async ({
    page,
  }) => {
    // ----- Arrange ------------------------------------------------------------
    const { unitId } = await getSeededIds()
    const booking = await createBookingForUnit(unitId, "In Progress")

    try {
      await signInAsSeededUser(page)
      const csrf = await readCsrfToken(page.context())
      const csrfHeaders = { [CSRF_HEADER_NAME]: csrf }

      // ----- Act --------------------------------------------------------------
      // Apply the seeded 100%-off coupon. page.request carries the auth
      // cookies set by the UI sign-in above, so this hits the route as the
      // signed-in operator. The CSRF header mirrors the cf_csrf cookie per
      // the double-submit pattern enforced in src/middleware.ts.
      const applyRes = await page.request.post("/api/coupons/apply", {
        headers: csrfHeaders,
        data: { code: SEED.couponCode, bookingId: booking.id },
      })
      expect(applyRes.status(), "apply should return 200").toBe(200)
      const applyBody = (await applyRes.json()) as {
        ok: boolean
        code: string
        originalAmount: number
        discountAmount: number
        finalAmount: number
      }
      expect(applyBody.ok).toBe(true)
      expect(applyBody.code).toBe(SEED.couponCode)
      expect(applyBody.finalAmount).toBe(0)
      expect(applyBody.discountAmount).toBe(325)

      // The booking should now show payment_amount = 0 and the coupon
      // denormalised onto the row.
      const afterApply = await readBooking(booking.id)
      expect(afterApply?.status).toBe("In Progress")
      expect(Number(afterApply?.payment_amount)).toBe(0)
      expect(afterApply?.coupon_code).toBe(SEED.couponCode)

      // Now hit the R0 comp endpoint — the moral equivalent of clicking the
      // emerald "Complete free booking" button on the Payment page when the
      // discounted total is R0.
      const compRes = await page.request.post(
        `/api/bookings/${booking.id}/complete-coupon-comp`,
        { headers: csrfHeaders, data: {} }
      )
      expect(compRes.status(), "complete-coupon-comp should return 200").toBe(200)
      const compBody = (await compRes.json()) as { ok: boolean }
      expect(compBody.ok).toBe(true)

      // ----- Assert -----------------------------------------------------------
      const final = await readBooking(booking.id)
      expect(final?.status).toBe("Payment Complete")
      // payment_type = "coupon_comp" IS the in-DB signal that PayFast was
      // bypassed. The normal PayFast path sets payment_type = "payfast";
      // self-collect sets "self_collect"; monthly_invoice sets
      // "monthly_invoice". Anything other than "coupon_comp" here means the
      // R0 invariant has broken.
      expect(final?.payment_type).toBe("coupon_comp")
      expect(Number(final?.payment_amount)).toBe(0)
      expect(final?.coupon_code).toBe(SEED.couponCode)
    } finally {
      await booking.cleanup()
    }
  })

  test("apply on an Abandoned booking resumes it to In Progress (hotfix 50c9dbe)", async ({
    page,
  }) => {
    // ----- Arrange ------------------------------------------------------------
    // Seed the booking directly as Abandoned to simulate the idle-timer
    // having flipped it before the operator returned.
    const { unitId } = await getSeededIds()
    const booking = await createBookingForUnit(unitId, "Abandoned")

    try {
      await signInAsSeededUser(page)
      const csrf = await readCsrfToken(page.context())

      // ----- Act --------------------------------------------------------------
      const applyRes = await page.request.post("/api/coupons/apply", {
        headers: { [CSRF_HEADER_NAME]: csrf },
        data: { code: SEED.couponCode, bookingId: booking.id },
      })

      // ----- Assert -----------------------------------------------------------
      // Pre-hotfix, this returned 409 with "Coupon can only be applied while
      // the booking is in progress". Post-hotfix, it returns 200 AND the
      // booking is flipped back to "In Progress" so the operator can carry
      // on without manually un-abandoning.
      expect(applyRes.status(), "apply on Abandoned should now succeed").toBe(200)
      const body = (await applyRes.json()) as { ok: boolean }
      expect(body.ok).toBe(true)

      const after = await readBooking(booking.id)
      expect(
        after?.status,
        "apply on Abandoned should flip status back to In Progress"
      ).toBe("In Progress")
      expect(after?.coupon_code).toBe(SEED.couponCode)
      expect(Number(after?.payment_amount)).toBe(0)
    } finally {
      await booking.cleanup()
    }
  })
})
