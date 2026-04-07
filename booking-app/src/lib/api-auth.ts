// =============================================================================
// api-auth.ts
//
// Server-side auth guards for API routes. These read the caller's Supabase
// Auth session from cookies (via supabase-server.ts) and verify role/status
// against public.users.
//
// Use these at the top of any API route handler that should be admin-only.
//
// IMPORTANT: server-only. Never import from "use client" components.
// =============================================================================

import { NextResponse } from "next/server"
import { getSupabaseServer } from "./supabase-server"

/**
 * Asserts that the caller is signed in AND has role = "system_admin" AND
 * status = "Active". Returns null on success (proceed with the request) or a
 * NextResponse to return immediately on failure.
 *
 * Usage:
 *   export async function POST(req: Request) {
 *     const denied = await requireSystemAdmin()
 *     if (denied) return denied
 *     // ...rest of handler
 *   }
 */
export async function requireSystemAdmin(): Promise<NextResponse | null> {
  const sb = await getSupabaseServer()
  const {
    data: { user: caller },
  } = await sb.auth.getUser()

  if (!caller) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  }

  const { data: callerRow, error } = await sb
    .from("users")
    .select("role, status")
    .eq("auth_user_id", caller.id)
    .single()

  if (error || !callerRow) {
    return NextResponse.json({ error: "Caller not provisioned" }, { status: 403 })
  }
  if (callerRow.status !== "Active") {
    return NextResponse.json({ error: "Caller account disabled" }, { status: 403 })
  }
  if (callerRow.role !== "system_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  return null
}
