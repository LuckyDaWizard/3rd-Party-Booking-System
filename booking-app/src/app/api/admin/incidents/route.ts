import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireSystemAdmin } from "@/lib/api-auth"
import { sweepStaleIncidents } from "@/lib/incidents"

// =============================================================================
// GET /api/admin/incidents
//
// List incidents, newest activity first. Lazily sweeps stale open incidents
// to resolved before returning, so no cron is required.
//
// Query params:
//   status — "open" | "resolved" | "all" (default "all")
//   limit  — max rows to return (default 50, max 200)
//
// Auth: system_admin only.
// =============================================================================

export async function GET(request: Request) {
  const denied = await requireSystemAdmin()
  if (denied) return denied

  // Auto-resolve anything stale before we read.
  await sweepStaleIncidents()

  // Probe for the table once — if migration 029 hasn't been applied yet we
  // want to fail gracefully (empty list) instead of returning 500 and making
  // the IncidentsBanner look broken to admins.

  const url = new URL(request.url)
  const statusRaw = url.searchParams.get("status") ?? "all"
  const status =
    statusRaw === "open" || statusRaw === "resolved" || statusRaw === "all"
      ? statusRaw
      : "all"
  const limit = Math.min(
    200,
    Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10))
  )

  let admin
  try {
    admin = getSupabaseAdmin()
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server misconfigured" },
      { status: 500 }
    )
  }

  let query = admin
    .from("incidents")
    .select("*")
    .order("last_seen_at", { ascending: false })
    .limit(limit)

  if (status !== "all") {
    query = query.eq("status", status)
  }

  const { data, error } = await query

  if (error) {
    // Table missing (migration not applied) — degrade to empty list so the
    // banner stays hidden rather than rendering a 500 to admins.
    if (/relation .*incidents.* does not exist|Could not find the table/.test(error.message)) {
      console.warn(
        "[incidents] table missing — apply supabase/migrations/029_incidents.sql"
      )
      return NextResponse.json({ data: [], openCount: 0 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    data: data ?? [],
    openCount: (data ?? []).filter((r) => r.status === "open").length,
  })
}
