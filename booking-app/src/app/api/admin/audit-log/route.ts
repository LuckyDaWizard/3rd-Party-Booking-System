import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireSystemAdmin } from "@/lib/api-auth"

// =============================================================================
// GET /api/admin/audit-log
//
// Read audit log entries with pagination and filtering.
//
// Query params (all optional):
//   page       — page number (default 1)
//   pageSize   — items per page (default 25, max 100)
//   entityType — filter: "user" | "client" | "unit"
//   action     — filter: "create" | "update" | "delete" | "reset_pin" | "toggle_status"
//   search     — text search on actor_name or entity_name (case-insensitive)
//
// Auth: system_admin only.
// =============================================================================

export async function GET(request: Request) {
  const denied = await requireSystemAdmin()
  if (denied) return denied

  const url = new URL(request.url)
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10))
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "25", 10)))
  const entityType = url.searchParams.get("entityType")
  const action = url.searchParams.get("action")
  const search = url.searchParams.get("search")

  let admin
  try {
    admin = getSupabaseAdmin()
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server misconfigured" },
      { status: 500 }
    )
  }

  // Build the query.
  let query = admin
    .from("audit_log")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })

  if (entityType) {
    query = query.eq("entity_type", entityType)
  }
  if (action) {
    query = query.eq("action", action)
  }
  if (search) {
    query = query.or(`actor_name.ilike.%${search}%,entity_name.ilike.%${search}%`)
  }

  // Pagination.
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  query = query.range(from, to)

  const { data, error, count } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    data: (data ?? []).map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      actorName: row.actor_name,
      actorRole: row.actor_role,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      entityName: row.entity_name,
      changes: row.changes,
      ipAddress: row.ip_address,
    })),
    total: count ?? 0,
    page,
    pageSize,
  })
}
