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

export default async function globalSetup() {
  if (process.env.PLAYWRIGHT_SEED !== "1") {
    console.log(
      "[global-setup] PLAYWRIGHT_SEED not set — skipping seed. Pass PLAYWRIGHT_SEED=1 to seed."
    )
    return
  }
  console.log("[global-setup] PLAYWRIGHT_SEED=1 — running seed...")
  await seedForCouponR0Test()
}
