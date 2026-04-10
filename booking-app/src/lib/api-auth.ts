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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CallerInfo {
  id: string           // public.users.id
  authUserId: string   // auth.users.id
  role: "system_admin" | "unit_manager" | "user"
  unitIds: string[]    // units the caller is assigned to (via user_units)
  name: string         // "First Last" for audit logging
}

// ---------------------------------------------------------------------------
// requireSystemAdmin
// ---------------------------------------------------------------------------

/**
 * Asserts that the caller is signed in AND has role = "system_admin" AND
 * status = "Active". Returns null on success (proceed with the request) or a
 * NextResponse to return immediately on failure.
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

// ---------------------------------------------------------------------------
// requireSystemAdminWithCaller
// ---------------------------------------------------------------------------

/**
 * Same as requireSystemAdmin() but returns CallerInfo on success so the
 * route has access to the caller's id/name/role for audit logging.
 */
export async function requireSystemAdminWithCaller(): Promise<
  { caller: CallerInfo; denied?: never } | { caller?: never; denied: NextResponse }
> {
  const sb = await getSupabaseServer()
  const {
    data: { user: authUser },
  } = await sb.auth.getUser()

  if (!authUser) {
    return { denied: NextResponse.json({ error: "Unauthenticated" }, { status: 401 }) }
  }

  const { data: callerRow, error } = await sb
    .from("users")
    .select("id, first_names, surname, role, status")
    .eq("auth_user_id", authUser.id)
    .single()

  if (error || !callerRow) {
    return { denied: NextResponse.json({ error: "Caller not provisioned" }, { status: 403 }) }
  }
  if (callerRow.status !== "Active") {
    return { denied: NextResponse.json({ error: "Caller account disabled" }, { status: 403 }) }
  }
  if (callerRow.role !== "system_admin") {
    return { denied: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }

  return {
    caller: {
      id: callerRow.id,
      authUserId: authUser.id,
      role: "system_admin",
      unitIds: [],
      name: `${callerRow.first_names} ${callerRow.surname}`.trim(),
    },
  }
}

// ---------------------------------------------------------------------------
// requireAdminOrManager
// ---------------------------------------------------------------------------

/**
 * Asserts that the caller is signed in AND has role = "system_admin" or
 * "unit_manager" AND status = "Active". Returns the caller's info (including
 * their assigned unit IDs) so the route can do unit-scoping checks.
 *
 * Returns either:
 *   { caller: CallerInfo }              — success, proceed
 *   { caller: null, denied: NextResponse } — failure, return the response
 *
 * Usage:
 *   const { caller, denied } = await requireAdminOrManager()
 *   if (denied) return denied
 *   // caller.role, caller.unitIds are now available for scoping
 */
export async function requireAdminOrManager(): Promise<
  { caller: CallerInfo; denied?: never } | { caller?: never; denied: NextResponse }
> {
  const sb = await getSupabaseServer()
  const {
    data: { user: authUser },
  } = await sb.auth.getUser()

  if (!authUser) {
    return { denied: NextResponse.json({ error: "Unauthenticated" }, { status: 401 }) }
  }

  const { data: callerRow, error } = await sb
    .from("users")
    .select("id, first_names, surname, role, status")
    .eq("auth_user_id", authUser.id)
    .single()

  if (error || !callerRow) {
    return { denied: NextResponse.json({ error: "Caller not provisioned" }, { status: 403 }) }
  }
  if (callerRow.status !== "Active") {
    return { denied: NextResponse.json({ error: "Caller account disabled" }, { status: 403 }) }
  }
  if (callerRow.role !== "system_admin" && callerRow.role !== "unit_manager") {
    return { denied: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }

  // Fetch the caller's unit assignments for scoping checks.
  const { data: unitRows } = await sb
    .from("user_units")
    .select("unit_id")
    .eq("user_id", callerRow.id)

  const unitIds = (unitRows ?? []).map((r) => r.unit_id as string)

  return {
    caller: {
      id: callerRow.id,
      authUserId: authUser.id,
      role: callerRow.role as "system_admin" | "unit_manager",
      unitIds,
      name: `${callerRow.first_names} ${callerRow.surname}`.trim(),
    },
  }
}

// ---------------------------------------------------------------------------
// Unit-scoping helper
// ---------------------------------------------------------------------------

/**
 * Check whether a target user shares at least one unit with the caller.
 * system_admin always passes. unit_manager must share at least one unit.
 *
 * Uses the service-role admin client to bypass RLS (the caller may not be
 * able to read user_units for the target user under the current policies).
 */
export async function callerCanAccessUser(
  caller: CallerInfo,
  targetUserId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: { from: (table: string) => any }
): Promise<boolean> {
  if (caller.role === "system_admin") return true

  const { data: targetUnits } = await admin
    .from("user_units")
    .select("unit_id")
    .eq("user_id", targetUserId)

  if (!targetUnits || targetUnits.length === 0) return false

  const targetUnitIds = new Set(targetUnits.map((r: { unit_id: string }) => r.unit_id))
  return caller.unitIds.some((uid) => targetUnitIds.has(uid))
}
