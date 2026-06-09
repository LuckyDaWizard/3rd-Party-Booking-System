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
    .select(
      "status, payment_amount, payment_type, coupon_id, coupon_code, handoff_status, handoff_redirect_url, external_reference_id, email_address"
    )
    .eq("id", bookingId)
    .single()
  return data as {
    status: string
    payment_amount: number
    payment_type: string | null
    coupon_id: string | null
    coupon_code: string | null
    handoff_status: string | null
    handoff_redirect_url: string | null
    external_reference_id: string | null
    email_address: string | null
  } | null
}

// ----- Helpers: drive the CareFirst SSO mock server --------------------------
//
// The mock is spawned by tests/_setup/global-setup.ts on a fixed port
// (CAREFIRST_MOCK_PORT in playwright.config.ts; default 4747). It exposes
// two introspection routes used here:
//   - GET    /__received → JSON array of all requests it has seen
//   - DELETE /__received → reset that array
// The dev server's CAREFIRST_API_DOMAIN env is pinned to the same port so
// any server-side fetch() to CareFirst's auto-register endpoint lands on
// the mock. See booking-app/tests/_setup/carefirst-mock-server.ts.

const MOCK_PORT = Number(process.env.CAREFIRST_MOCK_PORT ?? 4747)
const MOCK_URL = `http://localhost:${MOCK_PORT}`

interface MockRecordedRequest {
  method: string
  path: string
  headers: Record<string, string>
  body: unknown
  receivedAt: string
}

async function clearMockReceived(): Promise<void> {
  const res = await fetch(`${MOCK_URL}/__received`, { method: "DELETE" })
  if (!res.ok) {
    throw new Error(
      `Failed to clear CareFirst mock state: ${res.status}. Is the mock running on port ${MOCK_PORT}? (See playwright.config.ts.)`
    )
  }
}

async function getMockReceived(): Promise<MockRecordedRequest[]> {
  const res = await fetch(`${MOCK_URL}/__received`)
  if (!res.ok) {
    throw new Error(
      `Failed to read CareFirst mock state: ${res.status}. Is the mock running on port ${MOCK_PORT}?`
    )
  }
  return (await res.json()) as MockRecordedRequest[]
}

/**
 * Filter mock-received requests down to those whose `uniqueReference` matches
 * the given booking ID. This is the cross-spec / cross-worker safe way to
 * query the mock — the `received` array in the mock is module-level and
 * shared across all Playwright workers, so when a second spec adds Start
 * Consult coverage, a bare `getMockReceived()` would race against the other
 * worker's clear / append cycle.
 *
 * Since every Start Consult call sends `uniqueReference = booking.id`, and
 * every test creates its own booking with its own UUID, filtering by booking
 * ID gives each test a per-test view of the mock without needing any
 * test-correlation plumbing on the production side.
 */
async function getMockReceivedForBooking(
  bookingId: string
): Promise<MockRecordedRequest[]> {
  const all = await getMockReceived()
  return all.filter((r) => {
    const body = r.body as { uniqueReference?: string } | null
    return body?.uniqueReference === bookingId
  })
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
// The dashboard's proxy enforces double-submit cookie CSRF (see
// src/proxy.ts + src/lib/csrf.ts): every state-changing API call
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
      // the double-submit pattern enforced in src/proxy.ts.
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

  // ---------------------------------------------------------------------------
  // D10: R0 coupon → Start Consult → CareFirst handoff → Successful
  //
  // Extends the R0 happy path past Payment Complete and through Start Consult.
  // The CareFirst call from /api/bookings/[id]/start-consultation is a
  // server-side fetch() that page.route() cannot intercept; tests/_setup/
  // carefirst-mock-server.ts stands up a local HTTP server on a fixed port
  // and playwright.config.ts pins CAREFIRST_API_DOMAIN at it, so the
  // production code hits the mock instead of real CareFirst.
  //
  // Guards:
  //   - booking ends at status = "Successful"
  //   - handoff_redirect_url + external_reference_id populated
  //   - mock received exactly one POST with the expected payload shape
  //     (clientCode from env, uniqueReference = booking.id, user.email
  //     matches booking.email_address)
  //
  // Out of scope (separate test scenarios; flagged as follow-ups):
  //   - CareFirst returns 502 → friendly "service unavailable"
  //   - CareFirst times out (5s AbortSignal) → friendly "didn't respond" message
  //   - Start Consult on already-Successful booking → cached redirect, no
  //     second outbound call (idempotency)
  // ---------------------------------------------------------------------------
  test("R0 coupon → Start Consult → handoff to CareFirst → Successful", async ({
    page,
  }) => {
    // ----- Arrange ------------------------------------------------------------
    const { unitId } = await getSeededIds()
    const booking = await createBookingForUnit(unitId, "In Progress")

    // Reset mock state so this test's assertions don't see noise from a
    // previous run / test in the same worker.
    await clearMockReceived()

    try {
      await signInAsSeededUser(page)
      const csrf = await readCsrfToken(page.context())
      const csrfHeaders = { [CSRF_HEADER_NAME]: csrf }

      // Walk through apply + complete-coupon-comp to get the booking to
      // Payment Complete — this is the prerequisite Start Consult enforces
      // server-side (booking.status === "Payment Complete" or "Successful").
      const applyRes = await page.request.post("/api/coupons/apply", {
        headers: csrfHeaders,
        data: { code: SEED.couponCode, bookingId: booking.id },
      })
      expect(applyRes.status(), "coupon apply should return 200").toBe(200)

      const compRes = await page.request.post(
        `/api/bookings/${booking.id}/complete-coupon-comp`,
        { headers: csrfHeaders, data: {} }
      )
      expect(compRes.status(), "complete-coupon-comp should return 200").toBe(200)

      const beforeStartConsult = await readBooking(booking.id)
      expect(beforeStartConsult?.status).toBe("Payment Complete")
      const patientEmail = beforeStartConsult?.email_address ?? ""

      // ----- Act --------------------------------------------------------------
      // Default deliveryMode is "device" — keep that so we don't drag the
      // nodemailer transport into scope. The handoff itself is what we're
      // asserting; email delivery is a separate concern.
      const startRes = await page.request.post(
        `/api/bookings/${booking.id}/start-consultation`,
        { headers: csrfHeaders, data: {} }
      )

      // ----- Assert -----------------------------------------------------------
      expect(
        startRes.status(),
        "start-consultation should return 200 on the happy path"
      ).toBe(200)
      const startBody = (await startRes.json()) as {
        ok: boolean
        redirectUrl: string | null
      }
      expect(startBody.ok).toBe(true)
      expect(startBody.redirectUrl).toBeTruthy()
      expect(startBody.redirectUrl).toContain(booking.id)

      // Booking row: Successful, handoff fields populated.
      const final = await readBooking(booking.id)
      expect(final?.status).toBe("Successful")
      expect(final?.handoff_status).toBe("sent")
      expect(final?.handoff_redirect_url).toBeTruthy()
      expect(final?.handoff_redirect_url).toContain(booking.id)
      expect(final?.external_reference_id).toBeTruthy()

      // Mock side: exactly one POST with the expected shape, filtered to
      // this test's booking so we're safe against cross-spec / cross-worker
      // sharing of the mock's `received` array (D11).
      const received = await getMockReceivedForBooking(booking.id)
      if (received.length === 0) {
        // D12: most common cause of "expected 1, got 0" here is that a dev
        // server was already running before Playwright launched, and
        // `reuseExistingServer: true` (the local default) silently bypassed
        // the `webServer.env` overrides. The reused dev server still uses
        // its .env.local CAREFIRST_API_DOMAIN, which means the SSO call
        // went to real CareFirst staging instead of our mock. Surface the
        // likely fix in the error message rather than a bare "expected
        // 1, got 0".
        throw new Error(
          "CareFirst mock received no requests for this booking. " +
            "Most likely cause: `npm run dev` was already running when " +
            "Playwright started, and `reuseExistingServer: true` skipped " +
            "the webServer.env overrides. Stop your local dev server and " +
            "let Playwright spawn its own (or set CAREFIRST_API_DOMAIN=" +
            `http://localhost:${MOCK_PORT} in your shell before starting ` +
            "`npm run dev`). See tests/_setup/carefirst-mock-server.ts " +
            "header for details."
        )
      }
      expect(
        received.length,
        "mock should have received exactly one auto-register call for this booking"
      ).toBe(1)
      const call = received[0]
      expect(call.method).toBe("POST")
      expect(call.path).toBe("/api/external/client-sso/auto-register")
      // x-api-key gets injected by the production callSsoAutoRegister().
      // The mock now does a presence check only (any non-empty value
      // passes — see carefirst-mock-server.ts for why), so just confirm
      // SOME non-empty key reached CareFirst. We don't pin the exact
      // value because Next.js dev's env-loading order can override the
      // value we tried to inject via webServer.env.
      expect(call.headers["x-api-key"]).toBeTruthy()
      expect(call.headers["x-api-key"]?.length).toBeGreaterThan(0)

      const sentBody = call.body as {
        clientCode: string
        planCode: string | null
        uniqueReference: string
        user: {
          email: string
          idNumber: string
          userProfile: { firstName: string; surname: string }
        }
      }
      // clientCode + planCode: presence check only. Pinning exact values
      // is fragile because Next.js dev's env-loading order can let
      // .env.local override the test values injected via webServer.env.
      // The invariant we actually care about — "the production code
      // resolved SOME clientCode + planCode and sent them" — is covered
      // by the truthy check.
      expect(sentBody.clientCode).toBeTruthy()
      // planCode can legitimately be null in the contract; just confirm
      // the field was sent (not undefined / missing).
      expect("planCode" in sentBody).toBe(true)
      // The strict, fixture-derived invariants:
      expect(sentBody.uniqueReference).toBe(booking.id)
      expect(sentBody.user.email).toBe(patientEmail)
      // Canonical Luhn-valid SA ID from createBookingForUnit fixture.
      expect(sentBody.user.idNumber).toBe("8701015800084")
      expect(sentBody.user.userProfile.firstName).toBe("Playwright")
      expect(sentBody.user.userProfile.surname).toBe("Patient")
    } finally {
      await booking.cleanup()
    }
  })
})
