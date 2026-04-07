import { createClient, type SupabaseClient } from "@supabase/supabase-js"

// =============================================================================
// supabase-admin.ts
//
// SERVER-ONLY Supabase client that uses the service_role key. This client
// bypasses RLS and can call auth.admin.* functions to manage Supabase Auth
// users.
//
// CRITICAL: never import this file from client components. The service role
// key must never end up in the browser bundle. Importing this from a "use
// client" file or any module reachable from one will leak the secret.
//
// Safe to import from:
//   - src/app/api/**/route.ts          (API routes — server only)
//   - src/app/**/page.tsx (server)     (server components, no "use client")
//   - scripts/*.mjs                    (one-off Node scripts)
//
// Unsafe (do NOT import here):
//   - any file with "use client" at the top
//   - src/lib/* files imported by client components
// =============================================================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

let cached: SupabaseClient | null = null

/**
 * Returns a Supabase client authenticated with the service_role key.
 * Throws if the env vars are missing — the calling API route should catch
 * this and return a 500 with a clear message rather than crashing.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached

  if (!SUPABASE_URL) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL env var")
  }
  if (!SERVICE_ROLE_KEY) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY env var. Add it to .env.local locally " +
        "and to the hosting environment for production."
    )
  }

  cached = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
  return cached
}

/**
 * Synthetic email scheme: PIN -> email used as the Supabase Auth identifier.
 * Keep this in sync with scripts/backfill-auth-users.mjs and the future
 * src/lib/auth-store.tsx PIN-based sign-in flow.
 */
export function pinToEmail(pin: string): string {
  return `pin-${pin}@carefirst.local`
}
