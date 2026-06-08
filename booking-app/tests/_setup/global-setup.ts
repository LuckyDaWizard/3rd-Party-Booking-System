/* eslint-disable no-console */
// =============================================================================
// tests/_setup/global-setup.ts
//
// Wired into playwright.config.ts via `globalSetup`. Runs ONCE before any
// spec file. Gated on PLAYWRIGHT_SEED=1 so the (small) Supabase round-trip
// only happens when the operator explicitly opts in.
//
// Why gated:
//   - The seed talks to the live dev Supabase using the service role key.
//     We don't want CI runs or first-time clones to surprise-write rows.
//   - `npx playwright test` should stay green even when PLAYWRIGHT_SEED is
//     unset, as long as the seed has been run at least once. This makes
//     the test self-contained on day 1 (with seeding) and fast on day 2+
//     (without).
// =============================================================================

import { seedForCouponR0Test } from "./seed"
import { startCareFirstMockServer } from "./carefirst-mock-server"

export default async function globalSetup() {
  // 1. Seed Supabase fixtures (gated). Independent of the mock server below.
  if (process.env.PLAYWRIGHT_SEED !== "1") {
    console.log(
      "[global-setup] PLAYWRIGHT_SEED not set — skipping seed. Pass PLAYWRIGHT_SEED=1 to seed."
    )
  } else {
    console.log("[global-setup] PLAYWRIGHT_SEED=1 — running seed...")
    await seedForCouponR0Test()
  }

  // 2. Start the CareFirst SSO mock server. The dev server (started by
  // Playwright's webServer block) reads CAREFIRST_API_DOMAIN from its env;
  // playwright.config.ts pins that to http://localhost:4747 so the
  // production callSsoAutoRegister() fetch lands on this mock instead of
  // a real CareFirst endpoint. The mock is ALWAYS started — tests that
  // don't exercise Start Consult just leave it idle (no DB writes, no
  // side effects).
  //
  // The API key the mock validates must match what the dev server sends
  // as x-api-key. We pull it from process.env so it tracks whatever
  // playwright.config.ts injected.
  await startCareFirstMockServer({
    apiKey: process.env.CAREFIRST_API_KEY ?? "playwright-mock-key",
  })
}
