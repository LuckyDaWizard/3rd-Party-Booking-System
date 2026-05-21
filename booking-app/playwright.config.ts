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

export default defineConfig({
  testDir: "./tests",
  // No globalSetup — kept intentionally minimal. Add when we have auth /
  // seeded data needs.
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
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
