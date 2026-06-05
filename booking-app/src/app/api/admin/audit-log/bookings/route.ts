import { NextResponse } from "next/server"
import { getSupabaseAdmin, unwrapEmbed } from "@/lib/supabase-admin"
import { requireSystemAdmin } from "@/lib/api-auth"
import { apiError } from "@/lib/api-response"

// =============================================================================
// GET /api/admin/audit-log/bookings
//
// Returns audit log entries grouped by booking. One object per booking with a
// chronological list of events plus the booking's current client + unit + status
// for context. Used by the Bookings tab of the audit log page.
//
// Query params:
//   page       — page number (default 1)
//   pageSize   — bookings per page (default 10, max 50)
//   search     — case-insensitive match on patient name / entity_name.
//
// Auth: system_admin only.
//
// Scaling note: groups in memory after fetching up to 5 000 booking audit rows.
// That covers ~1 000 bookings (5 events each on average) which is more than
// fine for current volumes. If we ever outgrow it, push the grouping into a
// Postgres RPC.
// =============================================================================

const MAX_AUDIT_ROWS_SCANNED = 5000

interface AuditRow {
  id: string
  created_at: string
  actor_id: string
  actor_name: string
  actor_role: string
  action: string
  entity_type: string
  entity_id: string
  entity_name: string | null
  changes: Record<string, { old?: unknown; new?: unknown }> | null
  ip_address: string | null
}

interface BookingRow {
  id: string
  status: string | null
  first_names: string | null
  surname: string | null
  unit_id: string | null
}

export async function GET(request: Request) {
  const denied = await requireSystemAdmin()
  if (denied) return denied

  const url = new URL(request.url)
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10))
  const pageSize = Math.min(
    50,
    Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "10", 10))
  )

  // Sanitise search — same rules as the parent audit-log route.
  const searchRaw = url.searchParams.get("search")
  let search: string | null = null
  if (searchRaw) {
    const cleaned = searchRaw
      .replace(/[,()%_*.]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60)
    if (cleaned.length > 0) search = cleaned.toLowerCase()
  }

  let admin
  try {
    admin = getSupabaseAdmin()
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Server misconfigured", 500)
  }

  // Step 1: pull every booking audit row up to the scan cap, newest first.
  const { data: auditData, error: auditErr } = await admin
    .from("audit_log")
    .select("*")
    .eq("entity_type", "booking")
    .order("created_at", { ascending: false })
    .limit(MAX_AUDIT_ROWS_SCANNED)

  if (auditErr) {
    return apiError(auditErr.message, 500)
  }

  const rows = (auditData ?? []) as AuditRow[]

  // Step 2: group rows by booking_id (= entity_id). Map preserves insertion
  // order, which is newest-event-first because the query is sorted that way.
  const byBooking = new Map<string, AuditRow[]>()
  for (const row of rows) {
    const existing = byBooking.get(row.entity_id)
    if (existing) existing.push(row)
    else byBooking.set(row.entity_id, [row])
  }

  // Step 3: load booking + unit + client context for these booking IDs in
  // a single round-trip via nested embeds. Previously this was 3 sequential
  // round-trips (bookings → units → clients). With the nested embed,
  // PostgREST resolves the whole chain server-side.
  const allBookingIds = Array.from(byBooking.keys())

  // Embed cardinality: bookings.unit_id is nullable, so PostgREST may
  // return units as either an object or singleton-array. Same one-step
  // deeper for clients. We normalise both with unwrapEmbed.
  type EmbeddedClient = { client_name: string | null }
  type EmbeddedUnit = {
    unit_name: string | null
    client_id: string | null
    clients: EmbeddedClient | EmbeddedClient[] | null
  }
  type EmbeddedBookingRow = BookingRow & {
    units: EmbeddedUnit | EmbeddedUnit[] | null
  }

  // Early-return when there are no booking IDs to avoid the
  // ["__none__"] sentinel + an unnecessary round-trip.
  const bookingMap = new Map<string, EmbeddedBookingRow>()
  if (allBookingIds.length > 0) {
    const { data: bookingRows } = await admin
      .from("bookings")
      .select(
        "id, status, first_names, surname, unit_id, units(unit_name, client_id, clients(client_name))"
      )
      .in("id", allBookingIds)
    for (const b of (bookingRows ?? []) as EmbeddedBookingRow[]) {
      bookingMap.set(b.id, b)
    }
  }

  // Step 4: build the grouped objects.
  const groups = allBookingIds.map((bookingId) => {
    const events = byBooking.get(bookingId)!
    const booking = bookingMap.get(bookingId)
    const unit = unwrapEmbed<EmbeddedUnit>(booking?.units ?? null)
    const client = unwrapEmbed<EmbeddedClient>(unit?.clients ?? null)

    const patientName =
      booking
        ? [booking.first_names, booking.surname].filter(Boolean).join(" ")
        : ""

    return {
      bookingId,
      ref: bookingId.slice(0, 8).toUpperCase(),
      patientName: patientName || "Unknown patient",
      clientName: client?.client_name ?? null,
      unitName: unit?.unit_name ?? null,
      currentStatus: booking?.status ?? "Unknown",
      firstEventAt: events[events.length - 1].created_at,
      lastEventAt: events[0].created_at,
      eventCount: events.length,
      events: events.map((e) => ({
        id: e.id,
        createdAt: e.created_at,
        actorName: e.actor_name,
        actorRole: e.actor_role,
        action: e.action,
        entityName: e.entity_name,
        changes: e.changes,
        ipAddress: e.ip_address,
      })),
    }
  })

  // Step 5: filter by search across patient name, client, unit, ref, or any
  // event's entity_name / actor_name. Case-insensitive substring match.
  const filtered = search
    ? groups.filter((g) => {
        const haystack = [
          g.patientName,
          g.clientName ?? "",
          g.unitName ?? "",
          g.ref,
          ...g.events.map((e) => e.entityName ?? ""),
          ...g.events.map((e) => e.actorName),
        ]
          .join(" ")
          .toLowerCase()
        return haystack.includes(search)
      })
    : groups

  // Already sorted (Map keeps insertion order = newest event first because the
  // audit query was newest-first), so no extra sort needed.

  const total = filtered.length
  const from = (page - 1) * pageSize
  const paged = filtered.slice(from, from + pageSize)

  return NextResponse.json({
    data: paged,
    total,
    page,
    pageSize,
  })
}
