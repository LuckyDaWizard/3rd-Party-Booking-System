/* eslint-disable no-console */
// =============================================================================
// tests/_helpers/admin.ts
//
// Service-role Supabase admin client for Playwright tests. Loads env from
// .env.local at the cwd (booking-app/) so tests can run without exporting
// vars in the shell first.
//
// Don't import from @/lib/* in test files — Playwright doesn't have the
// Next.js path-alias resolver in the test context. That's why this module
// exists separately from the production supabase-admin.ts.
// =============================================================================

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Minimal .env.local parser that runs once. Only handles plain KEY=VALUE
 * lines — no quoting tricks, no interpolation. Enough for the keys we
 * read (Supabase URL + service role).
 *
 * Idempotent — already-set env vars are not overwritten.
 */
function loadEnvLocal(): void {
  try {
    const p = join(process.cwd(), ".env.local")
    const txt = readFileSync(p, "utf8")
    for (const rawLine of txt.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith("#")) continue
      const eq = line.indexOf("=")
      if (eq < 0) continue
      const key = line.slice(0, eq).trim()
      const value = line.slice(eq + 1).trim()
      if (!key || process.env[key] !== undefined) continue
      process.env[key] = value
    }
  } catch {
    // .env.local missing — fall through and let the explicit env check
    // below surface the right error.
  }
}

let cached: SupabaseClient | null = null

/**
 * Returns a cached service-role Supabase client. First call loads env vars
 * from .env.local; subsequent calls reuse the same instance.
 *
 * Throws if NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY are
 * missing from both the shell env and .env.local.
 */
export function getAdmin(): SupabaseClient {
  if (cached) return cached
  loadEnvLocal()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const sr = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !sr) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env. " +
        "Set them in booking-app/.env.local."
    )
  }
  cached = createClient(url, sr, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return cached
}
