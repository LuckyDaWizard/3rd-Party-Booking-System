import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireSystemAdmin } from "@/lib/api-auth"

// =============================================================================
// GET /api/admin/incidents/[id]
//
// Detail for a single incident — used by /reports/incidents/[id]. Returns the
// incident row plus a side-loaded list of the most recent affected bookings
// (id, ref, patient name, status) so the detail page can link to them.
//
// Auth: system_admin only.
// =============================================================================

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_request: Request, context: RouteContext) {
  const denied = await requireSystemAdmin()
  if (denied) return denied

  const { id } = await context.params
  if (!id) {
    return NextResponse.json({ error: "Missing incident id" }, { status: 400 })
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

  const { data: incident, error } = await admin
    .from("incidents")
    .select("*")
    .eq("id", id)
    .single()

  if (error || !incident) {
    return NextResponse.json({ error: "Incident not found" }, { status: 404 })
  }

  // Fetch the affected bookings for context — patient names + current status.
  // Cap at 20 to keep the response small; affected_booking_ids can grow long.
  const bookingIds = ((incident.affected_booking_ids as string[]) ?? []).slice(
    0,
    20
  )

  let affectedBookings: Array<{
    id: string
    ref: string
    patientName: string
    status: string | null
  }> = []

  if (bookingIds.length > 0) {
    const { data: rows } = await admin
      .from("bookings")
      .select("id, first_names, surname, status")
      .in("id", bookingIds)

    affectedBookings = (rows ?? []).map((r) => {
      const name =
        [r.first_names, r.surname].filter(Boolean).join(" ") || "Unknown patient"
      return {
        id: r.id as string,
        ref: (r.id as string).slice(0, 8).toUpperCase(),
        patientName: name,
        status: (r.status as string) ?? null,
      }
    })
  }

  return NextResponse.json({
    incident,
    affectedBookings,
    affectedBookingsTotal: (incident.affected_booking_ids as string[]).length,
  })
}
