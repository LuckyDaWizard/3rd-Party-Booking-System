// =============================================================================
// incidents.ts
//
// Server-side helper for the `incidents` table — automatic upstream-failure
// detection. Failure sites (Start Consult, PayFast ITN, reconcile) call
// recordIncident() and the helper either opens a new incident or updates
// the existing open one for the same signature.
//
// sweepStaleIncidents() auto-resolves any open incident with no new failures
// in the last 30 minutes. Called lazily from the list endpoint so we don't
// need a cron.
//
// IMPORTANT: server-only. Never import from "use client" components.
// =============================================================================

import { getSupabaseAdmin } from "@/lib/supabase-admin"

/** Maximum length we store of the upstream's raw response body. */
const RAW_SAMPLE_MAX = 1000

/** How long an open incident can sit with no new failures before auto-resolve. */
export const STALE_INCIDENT_MS = 30 * 60 * 1000

export interface RecordIncidentInput {
  /**
   * Deduplication key. Same signature → same open incident.
   * Format: "<source>:<endpoint>:<status-or-class>"
   * Examples: "carefirst:start-consultation:502", "payfast:notify:invalid-signature"
   */
  signature: string
  /** "carefirst" | "payfast" | "internal" — broad classification for the listing. */
  source: string
  /** "handoff" | "payment" | "database" — what kind of operation failed. */
  category: string
  /** Human-readable title shown in the incident listing. */
  title: string
  /** Last verbatim error message we saw. */
  errorMsg: string
  /** HTTP status code if applicable. */
  httpStatus?: number
  /** Truncated raw response body from the upstream (for debugging). */
  rawSample?: string
  /** Booking that was affected by this failure, if any. */
  bookingId?: string
}

export interface IncidentRow {
  id: string
  signature: string
  source: string
  category: string
  title: string
  http_status: number | null
  error_msg: string
  raw_sample: string | null
  status: "open" | "resolved"
  first_seen_at: string
  last_seen_at: string
  resolved_at: string | null
  failure_count: number
  affected_booking_ids: string[]
  created_at: string
}

/**
 * Record an upstream failure as an incident. If an open incident already
 * exists for the same signature, it's updated; otherwise a new one is opened.
 *
 * Fire-and-forget — incident-write failures must never break the primary
 * operation. Returns the incident id on success, null on failure.
 */
export async function recordIncident(
  input: RecordIncidentInput
): Promise<string | null> {
  try {
    const admin = getSupabaseAdmin()
    const rawSample = input.rawSample
      ? String(input.rawSample).slice(0, RAW_SAMPLE_MAX)
      : null

    // Single round-trip merge-or-create via the record_incident RPC
    // (migration 039). Previously this function did 2-3 sequential calls:
    // SELECT existing → INSERT or UPDATE → retry SELECT+UPDATE on race.
    // The RPC does INSERT ... ON CONFLICT (signature) WHERE status='open'
    // DO UPDATE, returning the resulting id. The partial unique index
    // makes the conflict target safe across concurrent inserts during
    // an outage — the exact scenario this function is hottest in.
    const { data: id, error: rpcErr } = await admin.rpc("record_incident", {
      p_signature: input.signature,
      p_source: input.source,
      p_category: input.category,
      p_title: input.title,
      p_http_status: input.httpStatus ?? null,
      p_error_msg: input.errorMsg,
      p_raw_sample: rawSample,
      p_booking_id: input.bookingId ?? null,
    })

    if (rpcErr) {
      console.error("[recordIncident] rpc failed:", rpcErr.message)
      return null
    }
    return (id as string | null) ?? null
  } catch (err) {
    console.error("[recordIncident] threw:", err)
    return null
  }
}

/**
 * Auto-resolve open incidents whose last_seen_at is older than the stale
 * threshold. Returns the count of resolved incidents.
 *
 * Designed to be called lazily from the list endpoint — keeps the table
 * tidy without needing a separate cron job.
 */
export async function sweepStaleIncidents(): Promise<number> {
  try {
    const admin = getSupabaseAdmin()
    const cutoff = new Date(Date.now() - STALE_INCIDENT_MS).toISOString()
    const now = new Date().toISOString()

    const { data, error } = await admin
      .from("incidents")
      .update({ status: "resolved", resolved_at: now })
      .eq("status", "open")
      .lt("last_seen_at", cutoff)
      .select("id")

    if (error) {
      console.error("[sweepStaleIncidents] failed:", error.message)
      return 0
    }
    return (data ?? []).length
  } catch (err) {
    console.error("[sweepStaleIncidents] threw:", err)
    return 0
  }
}

/**
 * Build a stable signature string from the parts that should deduplicate.
 * Use this so failure sites don't ad-hoc their signature format.
 */
export function buildSignature(parts: {
  source: string
  endpoint: string
  statusOrClass: string | number
}): string {
  return `${parts.source}:${parts.endpoint}:${parts.statusOrClass}`
}
