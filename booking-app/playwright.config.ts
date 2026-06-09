import { defineConfig, devices } from "@playwright/test"

// =============================================================================
// Playwright config — smoke-test runner for the dashboard (audit #30).
//
// The audit recommended starting with a single happy-path smoke test of the
// booking flow when the team had bandwidth. This config sets up the runner;
// authored tests live in ./tests/.
//
// Conventions:
//   - Tests assume the dev server is running on localhost:3000. If it isn't,
//     Playwright will start it via the webServer block below.
//   - Only Chromium for now (smaller download, faster CI). Add Firefox /
//     WebKit projects when cross-browser coverage matters.
//   - HTML reporter writes to playwright-report/ — gitignored.
//   - Test artifacts (videos, traces) only captured on failure to keep the
//     happy-path runs quick.
// =============================================================================

const PORT = Number(process.env.PORT ?? 3000)
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`

// CareFirst SSO mock server (backlog D10). Boots in globalSetup, dies in
// globalTeardown. The dev server's CAREFIRST_API_DOMAIN is pinned to the
// mock's URL via webServer.env below so server-side fetch() lands on the
// mock instead of a real CareFirst endpoint. Port 4747 was picked because
// it's well outside common dev-tool ranges; if it collides with something
// on your box, set CAREFIRST_MOCK_PORT in your shell AND update the value
// here in lockstep (they must match — there's no shared discovery channel
// between globalSetup and webServer, since webServer.command runs in a
// child process before globalSetup completes).
const CAREFIRST_MOCK_PORT = Number(process.env.CAREFIRST_MOCK_PORT ?? 4747)
const CAREFIRST_MOCK_API_KEY = process.env.CAREFIRST_API_KEY ?? "playwright-mock-key"

// PayFast mock server (D17 / C1). Same fixed-port pattern as the CareFirst
// mock — must match payfast-mock-server.ts's default of 4748. The dev server
// reads PAYFAST_VALIDATE_URL_OVERRIDE / PAYFAST_API_BASE_OVERRIDE from its
// env to redirect the ITN server-confirmation POST and the Transaction
// History GET at this mock instead of real PayFast endpoints. Merchant
// credentials (PAYFAST_MERCHANT_ID/KEY/PASSPHRASE) are already in .env.local
// — we don't override them here.
const PAYFAST_MOCK_PORT = Number(process.env.PAYFAST_MOCK_PORT ?? 4748)

export default defineConfig({
  testDir: "./tests",
  // globalSetup seeds Supabase fixtures (gated on PLAYWRIGHT_SEED=1, B3) and
  // ALWAYS boots the CareFirst SSO mock server on CAREFIRST_MOCK_PORT (D10).
  // globalTeardown stops the mock — Supabase seed is left in place across
  // runs (idempotent).
  globalSetup: "./tests/_setup/global-setup.ts",
  globalTeardown: "./tests/_setup/global-teardown.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "html",

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Auto-start `npm run dev` if no server is listening. Skipped when the dev
  // server is already up (the harness reuses it). `reuseExistingServer` is
  // TRUE locally and FALSE on CI so failures are reproducible from scratch.
  //
  // env: overrides for the spawned Next.js process. CAREFIRST_API_DOMAIN
  // points the production callSsoAutoRegister() at the local mock; the
  // accompanying CAREFIRST_API_KEY / CLIENT_CODE / PLAN_CODE are set to
  // benign test values so getCareFirstConfig() doesn't throw on missing
  // env. These ONLY take effect when Playwright starts the dev server —
  // if you `npm run dev` separately and then run tests, your shell env
  // wins. That's fine for the existing B3 tests (they never call
  // CareFirst); the D10 SSO test below will fail loudly if the dev
  // server isn't pointed at the mock.
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      CAREFIRST_API_DOMAIN: `http://localhost:${CAREFIRST_MOCK_PORT}`,
      CAREFIRST_API_KEY: CAREFIRST_MOCK_API_KEY,
      CAREFIRST_CLIENT_CODE:
        process.env.CAREFIRST_CLIENT_CODE ?? "PLAYWRIGHT-CLIENT",
      CAREFIRST_CLIENT_PLAN_CODE:
        process.env.CAREFIRST_CLIENT_PLAN_CODE ?? "PLAYWRIGHT-PLAN",
      // PayFast mock overrides. Read at CALL TIME by getValidateUrl() and
      // getPayfastApiBase() so module-load order doesn't bypass them. Same
      // caveat as the CareFirst block: only takes effect when Playwright
      // starts the dev server — if you `npm run dev` separately, your shell
      // env wins and PayFast calls hit real sandbox / production URLs.
      PAYFAST_VALIDATE_URL_OVERRIDE: `http://localhost:${PAYFAST_MOCK_PORT}/eng/query/validate`,
      PAYFAST_API_BASE_OVERRIDE: `http://localhost:${PAYFAST_MOCK_PORT}`,
    },
  },
})
