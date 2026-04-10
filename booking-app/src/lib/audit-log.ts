// =============================================================================
// audit-log.ts
//
// Server-side helper for writing audit log entries. Fire-and-forget: audit
// failures are logged to console but never block the primary operation.
//
// IMPORTANT: server-only. Never import from "use client" components.
// =============================================================================

import { getSupabaseAdmin } from "@/lib/supabase-admin"

export interface AuditEntry {
  actorId: string
  actorName: string
  actorRole: string
  action: "create" | "update" | "delete" | "reset_pin" | "toggle_status"
  entityType: "user" | "client" | "unit"
  entityId: string
  entityName?: string
  changes?: Record<string, { old?: unknown; new?: unknown }>
  ipAddress?: string | null
}

/**
 * Write an audit log entry. Fire-and-forget — never throws.
 */
export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    const admin = getSupabaseAdmin()
    await admin.from("audit_log").insert({
      actor_id: entry.actorId,
      actor_name: entry.actorName,
      actor_role: entry.actorRole,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId,
      entity_name: entry.entityName ?? null,
      changes: entry.changes ?? null,
      ip_address: entry.ipAddress ?? null,
    })
  } catch (err) {
    console.error("Failed to write audit log:", err)
  }
}

/**
 * Extract client IP from request headers (behind Traefik/Docker proxy).
 */
export function getCallerIp(request: Request): string | null {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null
  )
}
