import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireSystemAdmin } from "@/lib/api-auth"

// =============================================================================
// PATCH /api/admin/units/[id]  — update a unit
// DELETE /api/admin/units/[id] — delete a unit
//
// PATCH body: any subset of
//   {
//     unitName, clientId, contactPersonName, contactPersonSurname,
//     email, province, status
//   }
//
// Auth: system_admin only.
// =============================================================================

interface UpdateUnitBody {
  unitName?: string
  clientId?: string
  contactPersonName?: string
  contactPersonSurname?: string
  email?: string
  province?: string
  status?: "Active" | "Disabled"
}

interface RouteContext {
  params: Promise<{ id: string }>
}

const VALID_PROVINCES = [
  "Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal",
  "Limpopo", "Mpumalanga", "North West", "Northern Cape", "Western Cape",
]

function normalizeProvince(input: string | undefined): string | undefined {
  if (input === undefined) return undefined
  const match = VALID_PROVINCES.find((p) => p.toLowerCase() === input.toLowerCase())
  return match ?? input
}

export async function PATCH(request: Request, context: RouteContext) {
  const denied = await requireSystemAdmin()
  if (denied) return denied

  const { id } = await context.params
  if (!id) {
    return NextResponse.json({ error: "Missing unit id" }, { status: 400 })
  }

  let body: UpdateUnitBody
  try {
    body = (await request.json()) as UpdateUnitBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
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

  const dbUpdates: Record<string, unknown> = {}
  if (body.unitName !== undefined) dbUpdates.unit_name = body.unitName
  if (body.clientId !== undefined) dbUpdates.client_id = body.clientId
  if (body.contactPersonName !== undefined) dbUpdates.contact_person_name = body.contactPersonName
  if (body.contactPersonSurname !== undefined) dbUpdates.contact_person_surname = body.contactPersonSurname
  if (body.email !== undefined) dbUpdates.email = body.email
  if (body.province !== undefined) dbUpdates.province = normalizeProvince(body.province)
  if (body.status !== undefined) dbUpdates.status = body.status

  if (Object.keys(dbUpdates).length === 0) {
    return NextResponse.json({ ok: true })
  }

  const { error: updErr } = await admin
    .from("units")
    .update(dbUpdates)
    .eq("id", id)

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request, context: RouteContext) {
  const denied = await requireSystemAdmin()
  if (denied) return denied

  const { id } = await context.params
  if (!id) {
    return NextResponse.json({ error: "Missing unit id" }, { status: 400 })
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

  // Clear user_units assignments first to avoid FK constraint errors.
  const { error: juncErr } = await admin
    .from("user_units")
    .delete()
    .eq("unit_id", id)
  if (juncErr) {
    console.warn(`Failed to clear user_units for unit ${id}:`, juncErr.message)
  }

  const { error: delErr } = await admin.from("units").delete().eq("id", id)
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
