/* eslint-disable no-console */
// =============================================================================
// tests/_setup/global-teardown.ts
//
// Wired into playwright.config.ts via `globalTeardown`. Runs ONCE after
// every spec file has completed (success OR failure).
//
// Stops the CareFirst SSO mock server AND the PayFast mock server that
// globalSetup booted. The Supabase seed is intentionally NOT cleaned up —
// it's idempotent and stays around to make subsequent runs fast (no re-seed
// when PLAYWRIGHT_SEED isn't set).
// =============================================================================

import { stopCareFirstMockServer } from "./carefirst-mock-server"
import { stopPayfastMockServer } from "./payfast-mock-server"

export default async function globalTeardown() {
  // Run both stops to completion even if one rejects so a single misbehaving
  // mock doesn't strand the other listening on its port (would EADDRINUSE the
  // next run). Promise.allSettled gives both a chance.
  await Promise.allSettled([
    stopCareFirstMockServer(),
    stopPayfastMockServer(),
  ])
}
