/* eslint-disable no-console */
// =============================================================================
// tests/_setup/global-teardown.ts
//
// Wired into playwright.config.ts via `globalTeardown`. Runs ONCE after
// every spec file has completed (success OR failure).
//
// Currently only one responsibility: stop the CareFirst SSO mock server
// that globalSetup booted. The Supabase seed is intentionally NOT cleaned
// up — it's idempotent and stays around to make subsequent runs fast (no
// re-seed when PLAYWRIGHT_SEED isn't set).
// =============================================================================

import { stopCareFirstMockServer } from "./carefirst-mock-server"

export default async function globalTeardown() {
  await stopCareFirstMockServer()
}
