import { getSupabaseAdmin } from "@/lib/supabase-admin"
import {
  requireSystemAdminWithCaller,
  isAuthorizedCronCall,
  type CallerInfo,
} from "@/lib/api-auth"
import { apiError } from "@/lib/api-response"
import {
  writeAuditLog,
  getCallerIp,
  SYSTEM_ACTOR_ID,
} from "@/lib/audit-log"
import { NextResponse } from "next/server"

// =============================================================================
// POST /api/admin/cleanup/sweep
//
// Periodic housekeeping — deletes old rows from tables where retained data
// has no operational value and may carry a privacy footprint. Intended to
// be hit by an external 15-min cron (Sprint 2 #7) alongside
// /api/payfast/reconcile and /api/admin/incidents (which triggers its own
// incident sweep on every GET).
//
// Auth: system_admin only.
// Method: POST so it can't be triggered by a stray browser preload.
// Body: optional { "dryRun": true } — counts rows without deleting,
//       useful for first verification + monitoring.
//
// Retention policies (deliberately conservative):
//
//   pin_reset_tokens
//     - Delete: rows with `used_at IS NOT NULL` (consumed; can never be
//       used again).
//     - Delete: rows with `expires_at < now() - 7 days` (long-expired and
//       no longer have any audit value — the PIN-reset audit log entry
//       captures the event itself).
//
//   auth_attempts
//     - Delete: rows older than 90 days. Brute-force detection only looks
//       at the last 15 min, so anything past 90 days is pure overhead +
//       a needless retention of a (PIN, IP) pair.
//
//   incidents
//     - Delete: rows where `status = 'resolved'` AND `last_seen_at < now()
//       - 90 days`. Open incidents are always retained. Recently-resolved
//       incidents (< 90 days) are kept for trending on the /reports
//       Incidents tab.
//
// Each table delete runs independently — a failure on one doesn't block
// the others. Counts are returned for observability + audit-log entry.
// =============================================================================

interface Body {
  dryRun?: boolean
}

interface SweepCounts {
  pin_reset_tokens: number
  auth_attempts: number
  incidents: number
}

interface SweepErrors {
  pin_reset_tokens?: string
  auth_attempts?: string
  incidents?: string
}

const DAY_MS = 24 * 60 * 60 * 1000

export async function POST(request: Request) {
  // Auth: cron-secret header bypasses session auth. Synthesize a system
  // caller so the audit log still has a recognisable actor for cron-driven
  // sweeps.
  let caller: CallerInfo
  if (isAuthorizedCronCall(request)) {
    caller = {
      id: SYSTEM_ACTOR_ID,
      authUserId: SYSTEM_ACTOR_ID,
      role: "system_admin",
      unitIds: [],
      name: "Cron",
    }
  } else {
    const result = await requireSystemAdminWithCaller()
    if (result.denied) return result.denied
    caller = result.caller
  }

  let body: Body = {}
  try {
    body = (await request.json()) as Body
  } catch {
    // Body is optional — empty / non-JSON is fine, just default dryRun=false.
  }
  const dryRun = Boolean(body.dryRun)

  let admin
  try {
    admin = getSupabaseAdmin()
  } catch (err) {
    return apiError(
      err instanceof Error ? err.message : "Server misconfigured",
      500
    )
  }

  const now = Date.now()
  const sevenDaysAgo = new Date(now - 7 * DAY_MS).toISOString()
  const ninetyDaysAgo = new Date(now - 90 * DAY_MS).toISOString()

  const counts: SweepCounts = {
    pin_reset_tokens: 0,
    auth_attempts: 0,
    incidents: 0,
  }
  const errors: SweepErrors = {}

  // ---------------------------------------------------------------------------
  // 1. pin_reset_tokens — consumed OR long-expired.
  //
  // Two passes (used + expired) because Supabase's filter chain doesn't
  // do OR cleanly across different operators. Doing two narrow deletes
  // is also easier to reason about than one .or() string.
  // ---------------------------------------------------------------------------
  if (dryRun) {
    const { count: usedCount } = await admin
      .from("pin_reset_tokens")
      .select("id", { count: "exact", head: true })
      .not("used_at", "is", null)
    const { count: expiredCount } = await admin
      .from("pin_reset_tokens")
      .select("id", { count: "exact", head: true })
      .is("used_at", null)
      .lt("expires_at", sevenDaysAgo)
    counts.pin_reset_tokens = (usedCount ?? 0) + (expiredCount ?? 0)
  } else {
    try {
      // count via Prefer: count=exact header — avoids transferring the
      // deleted-row UUIDs over the wire just to call .length on them.
      const { count: usedCount, error: usedErr } = await admin
        .from("pin_reset_tokens")
        .delete({ count: "exact" })
        .not("used_at", "is", null)
      if (usedErr) throw usedErr
      counts.pin_reset_tokens += usedCount ?? 0

      const { count: expiredCount, error: expiredErr } = await admin
        .from("pin_reset_tokens")
        .delete({ count: "exact" })
        .is("used_at", null)
        .lt("expires_at", sevenDaysAgo)
      if (expiredErr) throw expiredErr
      counts.pin_reset_tokens += expiredCount ?? 0
    } catch (err) {
      errors.pin_reset_tokens =
        err instanceof Error ? err.message : "unknown error"
      console.error("[cleanup/sweep] pin_reset_tokens failed:", err)
    }
  }

  // ---------------------------------------------------------------------------
  // 2. auth_attempts — older than 90 days.
  // ---------------------------------------------------------------------------
  if (dryRun) {
    const { count } = await admin
      .from("auth_attempts")
      .select("id", { count: "exact", head: true })
      .lt("attempted_at", ninetyDaysAgo)
    counts.auth_attempts = count ?? 0
  } else {
    try {
      const { count, error } = await admin
        .from("auth_attempts")
        .delete({ count: "exact" })
        .lt("attempted_at", ninetyDaysAgo)
      if (error) throw error
      counts.auth_attempts = count ?? 0
    } catch (err) {
      errors.auth_attempts =
        err instanceof Error ? err.message : "unknown error"
      console.error("[cleanup/sweep] auth_attempts failed:", err)
    }
  }

  // ---------------------------------------------------------------------------
  // 3. incidents — resolved AND last seen > 90 days ago.
  // ---------------------------------------------------------------------------
  if (dryRun) {
    const { count } = await admin
      .from("incidents")
      .select("id", { count: "exact", head: true })
      .eq("status", "resolved")
      .lt("last_seen_at", ninetyDaysAgo)
    counts.incidents = count ?? 0
  } else {
    try {
      const { count, error } = await admin
        .from("incidents")
        .delete({ count: "exact" })
        .eq("status", "resolved")
        .lt("last_seen_at", ninetyDaysAgo)
      if (error) throw error
      counts.incidents = count ?? 0
    } catch (err) {
      errors.incidents =
        err instanceof Error ? err.message : "unknown error"
      console.error("[cleanup/sweep] incidents failed:", err)
    }
  }

  // ---------------------------------------------------------------------------
  // Audit log — record the sweep so an operator can confirm it ran on
  // schedule. Skip the audit write for dry runs (no state change).
  // ---------------------------------------------------------------------------
  if (!dryRun) {
    const total =
      counts.pin_reset_tokens + counts.auth_attempts + counts.incidents
    // entity_id must be a valid UUID (NOT NULL uuid column on audit_log).
    // Use SYSTEM_ACTOR_ID — the canonical zero-UUID for system-originated
    // entities that don't tie to a specific user/client/unit/booking row.
    // Awaited (rather than fire-and-forget) because cleanup-sweep is the
    // slow path of a 15-min cron — on serverless/standalone Next.js the
    // response can return before a fire-and-forget audit write completes,
    // and the audit entry vanishes. The await adds maybe 50ms to a route
    // that already takes seconds; not measurable.
    await writeAuditLog({
      actorId: caller.id || SYSTEM_ACTOR_ID,
      actorName: caller.name || "System",
      actorRole: caller.role,
      action: "delete",
      entityType: "system",
      entityId: SYSTEM_ACTOR_ID,
      entityName: `Cleanup sweep (${total} rows removed)`,
      changes: {
        "pin_reset_tokens": { new: String(counts.pin_reset_tokens) },
        "auth_attempts": { new: String(counts.auth_attempts) },
        "incidents": { new: String(counts.incidents) },
        ...(Object.keys(errors).length > 0
          ? { "Errors": { new: JSON.stringify(errors) } }
          : {}),
      },
      ipAddress: getCallerIp(request),
    })
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    swept: counts,
    ...(Object.keys(errors).length > 0 ? { errors } : {}),
  })
}
