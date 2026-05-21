import { test, expect } from "@playwright/test"

// =============================================================================
// /sign-in smoke test (audit #30)
//
// Anonymous public route — no test users / seeded data needed. Just confirms:
//   - The page renders without erroring
//   - The critical UI elements (heading, OTP input, submit button, Forgot PIN
//     link, support footer) are present
//   - Submit is disabled until the full PIN length is entered
//
// First test in the suite — establishes the runner works end-to-end. Add more
// happy-path coverage (sign in with real test creds → home → create booking)
// once a deterministic test-user seeding strategy is in place.
// =============================================================================

test.describe("/sign-in", () => {
  test("renders and gates submit until PIN is entered", async ({ page }) => {
    await page.goto("/sign-in")

    // Heading + subtitle establish the page rendered.
    await expect(page.getByTestId("sign-in-heading")).toHaveText(
      "Enter your access pin"
    )
    await expect(page.getByTestId("sign-in-subtitle")).toBeVisible()

    // The OTP input wrapper is present.
    await expect(page.getByTestId("sign-in-pin-input")).toBeVisible()

    // Submit is disabled with an empty PIN.
    const submit = page.getByTestId("sign-in-submit")
    await expect(submit).toBeDisabled()

    // Forgot-PIN escape hatch is visible and points at the reset flow.
    const forgot = page.getByTestId("forgot-pin-link")
    await expect(forgot).toBeVisible()
    await expect(forgot).toHaveAttribute("href", "/forgot-pin")

    // Support contact footer.
    await expect(page.getByTestId("sign-in-support")).toBeVisible()
  })

  test("the Forgot PIN link navigates to /forgot-pin", async ({ page }) => {
    await page.goto("/sign-in")
    await page.getByTestId("forgot-pin-link").click()
    await expect(page).toHaveURL(/\/forgot-pin$/)
  })
})
