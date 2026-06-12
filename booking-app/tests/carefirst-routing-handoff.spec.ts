/* eslint-disable no-console */
// =============================================================================
// carefirst-routing-handoff.spec.ts — per-client CareFirst SSO routing (B1)
// exercised end-to-end through /api/bookings/[id]/start-consultation against
// the local CareFirst mock.
//
// WHAT THIS GUARDS
// ----------------
// start-consultation embeds units(client_id, clients(carefirst_client_code,
// carefirst_plan_code, carefirst_api_domain)) and resolves the CareFirst config
// via getCareFirstConfigForClient() BEFORE acquiring the handoff lock. This
// spec proves the resolved config actually reaches CareFirst by asserting the
// `clientCode` in the payload the mock receives:
//
//   1. MAPPED client (carefirst_client_code set + the per-client API key wired
//      into webServer.env) → the SSO payload carries THAT client's clientCode,
//      not the env default.
//   2. UN-MAPPED client (no carefirst_client_code) → the payload carries the
//      env-default clientCode (CAREFIRST_CLIENT_CODE from webServer.env).
//   3. PARTIALLY-mapped client (code set, but NO per-client key in env) →
//      fail-closed: start-consultation returns the 500 "not fully configured"
//      error and the booking STAYS at "Payment Complete" (recoverable).
//
// INFRASTRUCTURE REUSE
// --------------------
// Same CareFirst mock + booking-ID-filter pattern as coupon-r0-happy-path.spec.
// The mock records every auto-register POST; we filter by uniqueReference
// (=== booking.id) so this spec only sees its own calls even though the mock's
// received array is shared across workers. See tests/_setup/carefirst-mock-server.ts.
//
// PER-CLIENT KEY WIRING
// ---------------------
// playwright.config.ts webServer.env sets CAREFIRST_API_KEY__PWMAPPED. The
// MAPPED test below creates an ad-hoc client whose carefirst_client_code is
// exactly "PWMAPPED" so getCareFirstConfigForClient() finds that key. MAPPED_CODE
// here MUST match the env key suffix in playwright.config.ts. This only takes
// effect when Playwright spawns the dev server (reuseExistingServer bypasses
// webServer.env) — same caveat as the existing D10 SSO test; the mapped + the
// fail-closed test surface a D12-style actionable error when the mock sees no
// call for the booking.
//
// PREREQUISITE: migration 042 (clients.carefirst_* columns) must be applied to
// the dev Supabase, or the ad-hoc client insert with those columns fails. See
// the note returned to the orchestrator.
//
// HOW TO RUN (let Playwright spawn the dev server so webServer.env applies):
//     cd booking-app
//     # ensure no `npm run dev` is already running
//     PLAYWRIGHT_SEED=1 npx playwright test carefirst-routing-handoff --project=chromium --workers=1
// =============================================================================

import { test, expect } from "@playwright/test"
import crypto from "node:crypto"

import { getAdmin } from "./_helpers/admin"
import {
  CSRF_HEADER_NAME,
  readCsrfToken,
  signInAsSeededUser,
} from "./_helpers/auth"
import { getSeededUserId, readBooking } from "./_helpers/fixtures"

// Must match the env key suffix CAREFIRST_API_KEY__PWMAPPED in playwright.config.ts.
const MAPPED_CODE = "PWMAPPED"

// Env-default clientCode the dev server boots with (playwright.config.ts
// webServer.env: CAREFIRST_CLIENT_CODE ?? "PLAYWRIGHT-CLIENT"). The un-mapped
// case must resolve to this. We read the same fallback the config uses so the
// two stay in sync if the shell overrides it.
const ENV_DEFAULT_CODE = process.env.CAREFIRST_CLIENT_CODE ?? "PLAYWRIGHT-CLIENT"

const MOCK_PORT = Number(process.env.CAREFIRST_MOCK_PORT ?? 4747)
const MOCK_URL = `http://localhost:${MOCK_PORT}`

interface MockRecordedRequest {
  method: string
  path: string
  headers: Record<string, string>
  body: unknown
  receivedAt: string
}

async function getMockReceivedForBooking(
  bookingId: string
): Promise<MockRecordedRequest[]> {
  const res = await fetch(`${MOCK_URL}/__received`)
  if (!res.ok) {
    throw new Error(
      `Failed to read CareFirst mock state: ${res.status}. Is the mock running on port ${MOCK_PORT}? (See playwright.config.ts.)`
    )
  }
  const all = (await res.json()) as MockRecordedRequest[]
  return all.filter((r) => {
    const body = r.body
    if (!body || typeof body !== "object") return false
    return (body as { uniqueReference?: string }).uniqueReference === bookingId
  })
}

async function resetMockMode(): Promise<void> {
  await fetch(`${MOCK_URL}/__mode`, { method: "DELETE" })
}

// ----- Ad-hoc client + unit + booking fixture --------------------------------
//
// We can't reuse the seeded client (it's intentionally un-mapped so the other
// handoff specs use the env default). Each test here builds its own client with
// the routing fields it needs, a unit under it, and a Payment-Complete booking
// ready for Start Consult — all via service-role, torn down in finally.

interface RoutingFixture {
  bookingId: string
  couponCode: string
  patientEmail: string
  cleanup: () => Promise<void>
}

async function createRoutedBooking(opts: {
  carefirstClientCode: string | null
}): Promise<RoutingFixture> {
  const admin = getAdmin()
  const suffix = crypto.randomBytes(4).toString("hex")
  const patientEmail = `routed.${suffix}@example.test`

  // 1. Client with the requested routing config. carefirst_api_domain stays
  //    null so the resolver falls back to the env default (the mock URL) —
  //    we're asserting clientCode routing, not domain routing.
  const { data: client, error: cErr } = await admin
    .from("clients")
    .insert({
      client_name: `Playwright Routing ${suffix}`,
      email: `routing.${suffix}@example.test`,
      contact_number: "+27000000000",
      status: "Active",
      allow_coupons: true,
      collect_payment_at_unit: false,
      bill_monthly: false,
      skip_patient_metrics: false,
      nurse_verification: false,
      carefirst_client_code: opts.carefirstClientCode,
    })
    .select("id")
    .single()
  if (cErr || !client) {
    throw new Error(
      `[routing-fixture] Failed to create client: ${cErr?.message}. ` +
        "If this mentions carefirst_client_code, apply migration 042 first."
    )
  }
  const clientId = (client as { id: string }).id

  // 2. Unit under that client.
  const { data: unit, error: uErr } = await admin
    .from("units")
    .insert({
      unit_name: `Playwright Routing Unit ${suffix}`,
      client_id: clientId,
      status: "Active",
    })
    .select("id")
    .single()
  if (uErr || !unit) {
    await admin.from("clients").delete().eq("id", clientId)
    throw new Error(`[routing-fixture] Failed to create unit: ${uErr?.message}`)
  }
  const unitId = (unit as { id: string }).id

  // 3. A 100%-off coupon scoped to this client so we can reach Payment Complete
  //    via the R0 comp path (no PayFast, deterministic). created_by = seeded
  //    system_admin user.
  const createdBy = await getSeededUserId()
  const couponCode = `ROUTE-${suffix.toUpperCase()}`
  const { data: coupon, error: cpErr } = await admin
    .from("coupons")
    .insert({
      code: couponCode,
      description: "Playwright routing fixture — 100% off.",
      discount_type: "percentage",
      discount_value: 100,
      client_id: clientId,
      status: "active",
      created_by: createdBy,
    })
    .select("id")
    .single()
  if (cpErr || !coupon) {
    await admin.from("units").delete().eq("id", unitId)
    await admin.from("clients").delete().eq("id", clientId)
    throw new Error(`[routing-fixture] Failed to create coupon: ${cpErr?.message}`)
  }
  const couponId = (coupon as { id: string }).id

  // 4. Booking under the unit (canonical patient fixture).
  const { data: booking, error: bErr } = await admin
    .from("bookings")
    .insert({
      unit_id: unitId,
      status: "In Progress",
      current_step: "payment",
      first_names: "Playwright",
      surname: "Patient",
      id_type: "SA ID",
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
      country_code: "+27",
      contact_number: "0710000000",
      email_address: patientEmail,
      payment_amount: 325.0,
      original_amount: 325.0,
    })
    .select("id")
    .single()
  if (bErr || !booking) {
    await admin.from("coupons").delete().eq("id", couponId)
    await admin.from("units").delete().eq("id", unitId)
    await admin.from("clients").delete().eq("id", clientId)
    throw new Error(`[routing-fixture] Failed to create booking: ${bErr?.message}`)
  }
  const bookingId = (booking as { id: string }).id

  return {
    bookingId,
    couponCode,
    patientEmail,
    async cleanup() {
      // Order: booking (coupon_uses cascades) → coupon → unit → client.
      await admin.from("bookings").delete().eq("id", bookingId)
      await admin.from("coupons").delete().eq("id", couponId)
      await admin.from("units").delete().eq("id", unitId)
      await admin.from("clients").delete().eq("id", clientId)
    },
  }
}

/** Walk a fixture booking to Payment Complete via apply + complete-coupon-comp. */
async function reachPaymentComplete(
  page: import("@playwright/test").Page,
  csrfHeaders: Record<string, string>,
  bookingId: string,
  couponCode: string
): Promise<void> {
  const applyRes = await page.request.post("/api/coupons/apply", {
    headers: csrfHeaders,
    data: { code: couponCode, bookingId },
  })
  expect(applyRes.status(), "coupon apply should return 200").toBe(200)
  const compRes = await page.request.post(
    `/api/bookings/${bookingId}/complete-coupon-comp`,
    { headers: csrfHeaders, data: {} }
  )
  expect(compRes.status(), "complete-coupon-comp should return 200").toBe(200)
  expect((await readBooking(bookingId))?.status).toBe("Payment Complete")
}

test.describe.configure({ mode: "serial" })

test.describe("CareFirst per-client routing — handoff (B1)", () => {
  test.beforeEach(async () => {
    await resetMockMode()
  })

  // ---------------------------------------------------------------------------
  // 1. MAPPED client → payload carries that client's clientCode.
  // ---------------------------------------------------------------------------
  test("mapped client routes the SSO payload to its own carefirst_client_code", async ({
    page,
  }) => {
    // ----- Arrange ------------------------------------------------------------
    const fixture = await createRoutedBooking({ carefirstClientCode: MAPPED_CODE })

    try {
      await signInAsSeededUser(page)
      const csrf = await readCsrfToken(page.context())
      const csrfHeaders = { [CSRF_HEADER_NAME]: csrf }

      await reachPaymentComplete(
        page,
        csrfHeaders,
        fixture.bookingId,
        fixture.couponCode
      )

      // ----- Act --------------------------------------------------------------
      const startRes = await page.request.post(
        `/api/bookings/${fixture.bookingId}/start-consultation`,
        { headers: csrfHeaders, data: {} }
      )

      // ----- Assert -----------------------------------------------------------
      expect(
        startRes.status(),
        "mapped-client Start Consult should succeed (200) — the per-client key is wired in webServer.env"
      ).toBe(200)

      const received = await getMockReceivedForBooking(fixture.bookingId)
      if (received.length === 0) {
        throw new Error(
          "CareFirst mock received no requests for this booking. Most likely " +
            "`npm run dev` was already running when Playwright started, so " +
            "reuseExistingServer skipped webServer.env (CAREFIRST_API_DOMAIN " +
            "+ CAREFIRST_API_KEY__PWMAPPED). Stop your dev server and let " +
            "Playwright spawn its own. See tests/_setup/carefirst-mock-server.ts."
        )
      }
      expect(received.length).toBe(1)
      const sentBody = received[0].body as { clientCode: string }
      // Load-bearing: the resolver picked the CLIENT'S code, not the env default.
      expect(sentBody.clientCode).toBe(MAPPED_CODE)
      expect(sentBody.clientCode).not.toBe(ENV_DEFAULT_CODE)
    } finally {
      await resetMockMode()
      await fixture.cleanup()
    }
  })

  // ---------------------------------------------------------------------------
  // 2. UN-MAPPED client → payload carries the env-default clientCode.
  // ---------------------------------------------------------------------------
  test("un-mapped client routes the SSO payload to the env-default clientCode", async ({
    page,
  }) => {
    // ----- Arrange ------------------------------------------------------------
    const fixture = await createRoutedBooking({ carefirstClientCode: null })

    try {
      await signInAsSeededUser(page)
      const csrf = await readCsrfToken(page.context())
      const csrfHeaders = { [CSRF_HEADER_NAME]: csrf }

      await reachPaymentComplete(
        page,
        csrfHeaders,
        fixture.bookingId,
        fixture.couponCode
      )

      // ----- Act --------------------------------------------------------------
      const startRes = await page.request.post(
        `/api/bookings/${fixture.bookingId}/start-consultation`,
        { headers: csrfHeaders, data: {} }
      )

      // ----- Assert -----------------------------------------------------------
      expect(startRes.status(), "un-mapped Start Consult should succeed (200)").toBe(200)

      const received = await getMockReceivedForBooking(fixture.bookingId)
      if (received.length === 0) {
        throw new Error(
          "CareFirst mock received no requests — most likely a reused dev " +
            "server bypassed webServer.env. See the mapped test's note."
        )
      }
      expect(received.length).toBe(1)
      const sentBody = received[0].body as { clientCode: string }
      // The env-default clientCode (CAREFIRST_CLIENT_CODE from webServer.env).
      expect(sentBody.clientCode).toBe(ENV_DEFAULT_CODE)
      expect(sentBody.clientCode).not.toBe(MAPPED_CODE)
    } finally {
      await resetMockMode()
      await fixture.cleanup()
    }
  })

  // ---------------------------------------------------------------------------
  // 3. PARTIALLY-mapped client (code set, key absent) → fail-closed.
  //
  // The mapped code "NOKEYCODE" has NO CAREFIRST_API_KEY__NOKEYCODE in env, so
  // getCareFirstConfigForClient() throws BEFORE the handoff lock. The route
  // fail-closes to a 500 and the booking stays at Payment Complete. CareFirst
  // is never called (the throw happens before callSsoAutoRegister).
  // ---------------------------------------------------------------------------
  test("partially-mapped client (no per-client key) fails closed; booking stays Payment Complete", async ({
    page,
  }) => {
    // ----- Arrange ------------------------------------------------------------
    const fixture = await createRoutedBooking({ carefirstClientCode: "NOKEYCODE" })

    try {
      await signInAsSeededUser(page)
      const csrf = await readCsrfToken(page.context())
      const csrfHeaders = { [CSRF_HEADER_NAME]: csrf }

      await reachPaymentComplete(
        page,
        csrfHeaders,
        fixture.bookingId,
        fixture.couponCode
      )

      // ----- Act --------------------------------------------------------------
      const startRes = await page.request.post(
        `/api/bookings/${fixture.bookingId}/start-consultation`,
        { headers: csrfHeaders, data: {} }
      )

      // ----- Assert -----------------------------------------------------------
      // Fail-closed: 500, never flips the booking to Successful, never calls
      // CareFirst. The patient-routing-integrity guard in action.
      expect(
        startRes.status(),
        "partially-mapped client must fail closed with 500"
      ).toBe(500)
      const body = (await startRes.json()) as { error?: string }
      expect(body.error ?? "").toMatch(/not fully configured/i)

      // Booking preserved at Payment Complete (recoverable once the key is set).
      const final = await readBooking(fixture.bookingId)
      expect(final?.status).toBe("Payment Complete")
      expect(final?.handoff_redirect_url).toBeFalsy()

      // The config throw happens BEFORE the CareFirst call — mock saw nothing.
      const received = await getMockReceivedForBooking(fixture.bookingId)
      expect(
        received.length,
        "fail-closed config error must short-circuit before calling CareFirst"
      ).toBe(0)
    } finally {
      await resetMockMode()
      await fixture.cleanup()
    }
  })
})
