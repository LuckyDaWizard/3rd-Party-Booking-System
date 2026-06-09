// =============================================================================
// tests/_helpers/auth.ts
//
// Auth helpers shared across all Playwright specs:
//  - CSRF cookie/header constants (kept in sync with src/lib/csrf.ts)
//  - readCsrfToken() — read the cf_csrf cookie from a browser context
//  - signInAsSeededUser() — drive the real /sign-in UI to populate session
//
// Hard-coded constants rather than imported from @/lib/csrf because the
// Playwright test context doesn't have the Next.js path-alias resolver.
// If src/lib/csrf.ts ever changes the cookie or header name, update here.
// =============================================================================

import { expect, type BrowserContext, type Page } from "@playwright/test"
import { SEED } from "../_setup/seed"

/** Must match src/lib/csrf.ts CSRF_COOKIE_NAME. */
export const CSRF_COOKIE_NAME = "cf_csrf"
/** Must match src/lib/csrf.ts CSRF_HEADER_NAME. */
export const CSRF_HEADER_NAME = "x-csrf-token"

/**
 * Reads the CSRF cookie value out of a Playwright browser context.
 *
 * The dashboard's proxy (src/proxy.ts, formerly middleware) enforces the
 * double-submit cookie CSRF pattern: every state-changing API call must
 * include `x-csrf-token` matching `cf_csrf`. The browser app reads it via
 * document.cookie; tests pluck it from the context and pass it through on
 * `page.request` calls.
 */
export async function readCsrfToken(context: BrowserContext): Promise<string> {
  const cookies = await context.cookies()
  const csrf = cookies.find((c) => c.name === CSRF_COOKIE_NAME)
  if (!csrf || !csrf.value) {
    throw new Error(
      `CSRF cookie (${CSRF_COOKIE_NAME}) not present — proxy should have set it on /sign-in.`
    )
  }
  return csrf.value
}

/**
 * Drives the real /sign-in UI to populate session + CSRF cookies. After
 * resolution, the page is at /home with a valid Supabase auth session and
 * a cf_csrf cookie ready to read.
 *
 * Uses the seeded Playwright Tester PIN. Relies on input-otp's pointer-down
 * focus delegation — if we ever swap the library, change `.click()` to
 * `.locator('input').focus()`.
 */
export async function signInAsSeededUser(page: Page): Promise<void> {
  await page.goto("/sign-in")
  await expect(page.getByTestId("sign-in-heading")).toBeVisible()
  const otp = page.getByTestId("sign-in-pin-input")
  await otp.click()
  await page.keyboard.type(SEED.user.pin)
  const submit = page.getByTestId("sign-in-submit")
  await expect(submit).toBeEnabled()
  await submit.click()
  await page.waitForURL(/\/home(\?|$)/, { timeout: 15_000 })
}
