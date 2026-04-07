// =============================================================================
// supabase-server.ts
//
// SERVER-SIDE Supabase client (anon key, RLS enforced) that reads/writes the
// auth session via Next.js cookies. Use this from API routes and server
// components when you need to act AS the signed-in user (not as the admin).
//
// For admin operations that bypass RLS, use src/lib/supabase-admin.ts instead.
//
// IMPORTANT: never import this from client components — it depends on
// next/headers which is server-only.
// =============================================================================

import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/**
 * Build a request-scoped Supabase server client. Must be called per request
 * (not cached at module level) because next/headers cookies() is request-scoped.
 */
export async function getSupabaseServer() {
  const cookieStore = await cookies()

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Called from a Server Component — cookies() is read-only there.
          // Safe to ignore: any session refresh will be picked up on the next
          // request, or by middleware if/when we add one.
        }
      },
    },
  })
}
