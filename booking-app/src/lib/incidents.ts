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
    const now = new Date().toISOString()

    const { data: existing } = await admin
      .from("incidents")
      .select("id, failure_count, affected_booking_ids")
      .eq("signature", input.signature)
      .eq("status", "open")
      .maybeSingle()

    if (existing) {
      const existingIds = (existing.affected_booking_ids as string[]) ?? []
      const merged = input.bookingId
        ? Array.from(new Set([...existingIds, input.bookingId]))
        : existingIds

      const { error: updErr } = await admin
        .from("incidents")
        .update({
          last_seen_at: now,
          failure_count: (existing.failure_count as number) + 1,
          error_msg: input.errorMsg,
          raw_sample: rawSample,
          http_status: input.httpStatus ?? null,
          affected_booking_ids: merged,
        })
        .eq("id", existing.id)

      if (updErr) {
        console.error("[recordIncident] update failed:", updErr.message)
        return null
      }
      return existing.id as string
    }

    const { data: inserted, error: insErr } = await admin
      .from("incidents")
      .insert({
        signature: input.signature,
        source: input.source,
        category: input.category,
        title: input.title,
        http_status: input.httpStatus ?? null,
        error_msg: input.errorMsg,
        raw_sample: rawSample,
        affected_booking_ids: input.bookingId ? [input.bookingId] : [],
      })
      .select("id")
      .single()

    if (insErr || !inserted) {
      // Race: another concurrent failure may have just opened the same
      // signature. Fall back to update.
      const { data: retryExisting } = await admin
        .from("incidents")
        .select("id, failure_count, affected_booking_ids")
        .eq("signature", input.signature)
        .eq("status", "open")
        .maybeSingle()

      if (retryExisting) {
        const existingIds = (retryExisting.affected_booking_ids as string[]) ?? []
        const merged = input.bookingId
          ? Array.from(new Set([...existingIds, input.bookingId]))
          : existingIds

        await admin
          .from("incidents")
          .update({
            last_seen_at: now,
            failure_count: (retryExisting.failure_count as number) + 1,
            error_msg: input.errorMsg,
            raw_sample: rawSample,
            http_status: input.httpStatus ?? null,
            affected_booking_ids: merged,
          })
          .eq("id", retryExisting.id)
        return retryExisting.id as string
      }

      console.error(
        "[recordIncident] insert failed:",
        insErr?.message ?? "unknown"
      )
      return null
    }

    return inserted.id as string
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
