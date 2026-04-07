// =============================================================================
// supabase.ts
//
// BROWSER (client-side) Supabase client for Next.js App Router.
//
// Uses @supabase/ssr's createBrowserClient so that the auth session is stored
// in cookies (readable by the server) instead of localStorage. This is the
// foundation that lets API routes and server components see auth.uid() and
// enforce RLS based on the signed-in user.
//
// IMPORTANT: import this only from "use client" components. For server-side
// access (API routes, server components) use src/lib/supabase-server.ts.
//
// We keep the file path/name `supabase.ts` and the named export `supabase`
// so that existing imports across the codebase continue to work without any
// edits.
// =============================================================================

import { createBrowserClient } from "@supabase/ssr"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY)

/**
 * Synthetic email scheme: PIN -> email used as the Supabase Auth identifier.
 * Mirrors src/lib/supabase-admin.ts so client and server agree.
 */
export function pinToEmail(pin: string): string {
  return `pin-${pin}@carefirst.local`
}
