import { test, expect, request as playwrightRequest } from "@playwright/test"
import { readdirSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"

// =============================================================================
// /api/admin/* auth-coverage test (Sprint 3 #11 / audit #7)
//
// Walks src/app/api/admin/ for every route.ts file and hits the resolved URL
// without any auth cookies. Every endpoint must respond with 401 or 403 —
// 200 / 204 would mean a route is missing its auth guard, which is exactly
// the silent failure mode the audit flagged.
//
// The check is intentionally lightweight (no test users, no DB seeding) so
// it stays green even when the rest of the test environment isn't fully
// wired. It only catches the "forgot to add auth" case; role-/unit-scope
// regressions need richer fixtures we don't have yet.
// =============================================================================

const ROUTE_ROOT = "src/app/api/admin"

/** Recursively find every route.ts under the admin tree. */
function findRoutes(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const s = statSync(p)
    if (s.isDirectory()) out.push(...findRoutes(p))
    else if (name === "route.ts") out.push(p)
  }
  return out
}

/**
 * Map a route.ts file path to the URL it serves, substituting `[param]`
 * segments with a deterministic UUID so the test always hits the same URL.
 * E.g. src/app/api/admin/clients/[id]/route.ts → /api/admin/clients/<uuid>.
 */
function fileToUrl(file: string): string {
  // Stable arbitrary UUID — never collides with real data, but is parseable
  // by any handler that does UUID validation before the auth check.
  const STUB = "00000000-0000-0000-0000-000000000000"
  const rel = relative("src/app", file).replace(/\\/g, "/").replace(/\/route\.ts$/, "")
  return (
    "/" +
    rel
      .split("/")
      .map((seg) => (seg.startsWith("[") && seg.endsWith("]") ? STUB : seg))
      .join("/")
  )
}

const ROUTE_FILES = findRoutes(ROUTE_ROOT)
const ROUTES = ROUTE_FILES.map((f) => ({
  file: f.split(sep).join("/"),
  url: fileToUrl(f),
})).sort((a, b) => a.url.localeCompare(b.url))

test.describe("/api/admin/* requires authentication", () => {
  // Sanity check that the walker actually found routes — protects against the
  // test silently passing if directory layout ever changes.
  test("discovers admin route files", () => {
    expect(ROUTES.length).toBeGreaterThan(15)
  })

  for (const { url, file } of ROUTES) {
    test(`unauthenticated request to ${url} is rejected (${file})`, async () => {
      // Brand-new context — explicitly no Supabase auth cookie.
      const ctx = await playwrightRequest.newContext()

      // Hit the endpoint with every method that might carry meaning. The
      // middleware default-deny fires regardless of method; the role check
      // inside the handler matches the audit's failure mode.
      const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const
      const observedStatuses: number[] = []
      for (const method of methods) {
        const res = await ctx.fetch(url, { method, failOnStatusCode: false })
        // 401 (no auth) or 403 (auth but wrong role) are both acceptable —
        // the test only fails if a 2xx slips through, indicating the endpoint
        // executed without any auth check.
        observedStatuses.push(res.status())
      }

      await ctx.dispose()

      const allowed = new Set([
        401, // unauthenticated
        403, // forbidden
        405, // method not allowed — also fine, the handler refuses early
      ])
      for (const status of observedStatuses) {
        expect(allowed.has(status), `expected 401/403/405, got ${status} for ${url}`).toBe(
          true
        )
      }
    })
  }
})
