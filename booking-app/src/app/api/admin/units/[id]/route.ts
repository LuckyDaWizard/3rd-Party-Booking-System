import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireSystemAdminWithCaller } from "@/lib/api-auth"
import { writeAuditLog, getCallerIp } from "@/lib/audit-log"

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
  collectPaymentAtUnit?: boolean
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
  const { caller, denied: patchDenied } = await requireSystemAdminWithCaller()
  if (patchDenied) return patchDenied

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

  // Load current row for audit diff.
  const { data: current } = await admin
    .from("units")
    .select("unit_name, client_id, contact_person_name, contact_person_surname, email, province, status, collect_payment_at_unit")
    .eq("id", id)
    .single()

  const dbUpdates: Record<string, unknown> = {}
  if (body.unitName !== undefined) dbUpdates.unit_name = body.unitName
  if (body.clientId !== undefined) dbUpdates.client_id = body.clientId
  if (body.contactPersonName !== undefined) dbUpdates.contact_person_name = body.contactPersonName
  if (body.contactPersonSurname !== undefined) dbUpdates.contact_person_surname = body.contactPersonSurname
  if (body.email !== undefined) dbUpdates.email = body.email
  if (body.province !== undefined) dbUpdates.province = normalizeProvince(body.province)
  if (body.status !== undefined) dbUpdates.status = body.status
  if (body.collectPaymentAtUnit !== undefined) dbUpdates.collect_payment_at_unit = body.collectPaymentAtUnit

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

  // Audit log.
  const changes: Record<string, { old?: unknown; new?: unknown }> = {}
  if (body.unitName !== undefined && body.unitName !== current?.unit_name)
    changes["Unit Name"] = { old: current?.unit_name, new: body.unitName }
  if (body.clientId !== undefined && body.clientId !== current?.client_id)
    changes["Client"] = { old: current?.client_id, new: body.clientId }
  if (body.contactPersonName !== undefined && body.contactPersonName !== current?.contact_person_name)
    changes["Contact Person Name"] = { old: current?.contact_person_name, new: body.contactPersonName }
  if (body.contactPersonSurname !== undefined && body.contactPersonSurname !== current?.contact_person_surname)
    changes["Contact Person Surname"] = { old: current?.contact_person_surname, new: body.contactPersonSurname }
  if (body.email !== undefined && body.email !== current?.email)
    changes["Email"] = { old: current?.email, new: body.email }
  if (body.province !== undefined && normalizeProvince(body.province) !== current?.province)
    changes["Province"] = { old: current?.province, new: normalizeProvince(body.province) }
  if (body.status !== undefined && body.status !== current?.status)
    changes["Status"] = { old: current?.status, new: body.status }
  if (body.collectPaymentAtUnit !== undefined && body.collectPaymentAtUnit !== current?.collect_payment_at_unit)
    changes["Collect Payment At Unit"] = { old: current?.collect_payment_at_unit ?? false, new: body.collectPaymentAtUnit }

  if (Object.keys(changes).length > 0) {
    const action = changes["Status"] && Object.keys(changes).length === 1 ? "toggle_status" as const : "update" as const
    writeAuditLog({
      actorId: caller.id,
      actorName: caller.name,
      actorRole: caller.role,
      action,
      entityType: "unit",
      entityId: id,
      entityName: current?.unit_name ?? body.unitName,
      changes,
      ipAddress: getCallerIp(request),
    })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request, context: RouteContext) {
  const { caller, denied: delDenied } = await requireSystemAdminWithCaller()
  if (delDenied) return delDenied

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

  // Load name before deletion for audit log.
  const { data: delTarget } = await admin
    .from("units")
    .select("unit_name")
    .eq("id", id)
    .single()

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

  writeAuditLog({
    actorId: caller.id,
    actorName: caller.name,
    actorRole: caller.role,
    action: "delete",
    entityType: "unit",
    entityId: id,
    entityName: delTarget?.unit_name,
    ipAddress: getCallerIp(request),
  })

  return NextResponse.json({ ok: true })
}
