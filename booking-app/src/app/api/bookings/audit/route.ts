import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireAuthenticated } from "@/lib/api-auth"
import { writeAuditLog, getCallerIp, bookingRef } from "@/lib/audit-log"

// =============================================================================
// POST /api/bookings/audit
//
// Thin server endpoint the client-side booking-store calls after a successful
// Supabase mutation to record an audit-log row. The client already has the
// diff (it just sent the update), so it submits a sanitised payload here.
//
// The server is the source of truth for actor identity (read from the session)
// — the client cannot spoof who did the action. The action type is whitelisted
// and the booking is verified to exist and (for non-admins) to be inside one
// of the caller's units.
//
// Body:
//   bookingId    — uuid (required)
//   action       — "create" | "update" | "delete" (whitelisted)
//   entityName   — optional human-readable label
//   changes      — optional per-field { old, new } diff
//
// Auth: any active user (system_admin / unit_manager / user).
// =============================================================================

const ALLOWED_ACTIONS = new Set(["create", "update", "delete"])

interface Body {
  bookingId?: string
  action?: string
  entityName?: string
  changes?: Record<string, { old?: unknown; new?: unknown }>
}

export async function POST(request: Request) {
  const { caller, denied } = await requireAuthenticated()
  if (denied) return denied

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const bookingId = typeof body.bookingId === "string" ? body.bookingId.trim() : ""
  const action = typeof body.action === "string" ? body.action : ""
  if (!bookingId) {
    return NextResponse.json({ error: "Missing bookingId" }, { status: 400 })
  }
  if (!ALLOWED_ACTIONS.has(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  }

  let admin
  try {
    admin = getSupabaseAdmin()
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server misconfigured" },
      { status: 500 }
    )
  }

  // Verify the booking exists and is in the caller's scope.
  const { data: booking, error: loadErr } = await admin
    .from("bookings")
    .select("id, unit_id, first_names, surname")
    .eq("id", bookingId)
    .single()

  if (loadErr || !booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 })
  }

  // Non-admins may only audit bookings in their assigned units.
  if (caller.role !== "system_admin") {
    if (!booking.unit_id || !caller.unitIds.includes(booking.unit_id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  const ref = bookingRef(bookingId)
  const fallbackName =
    [booking.first_names, booking.surname].filter(Boolean).join(" ") ||
    "Unknown patient"
  // Always prefix with the short ref so audit rows for different bookings of
  // the same patient can be told apart. If the client supplied an entityName,
  // we still prefix it (the client-side fallback in booking-store doesn't know
  // the patient name reliably at create time).
  const clientName =
    typeof body.entityName === "string" && body.entityName.trim().length > 0
      ? body.entityName.slice(0, 200)
      : `Booking for ${fallbackName}`
  const entityName = clientName.startsWith(`[${ref}]`)
    ? clientName
    : `[${ref}] ${clientName}`

  writeAuditLog({
    actorId: caller.id,
    actorName: caller.name,
    actorRole: caller.role,
    action: action as "create" | "update" | "delete",
    entityType: "booking",
    entityId: bookingId,
    entityName,
    changes: body.changes,
    ipAddress: getCallerIp(request),
  })

  return NextResponse.json({ ok: true })
}
