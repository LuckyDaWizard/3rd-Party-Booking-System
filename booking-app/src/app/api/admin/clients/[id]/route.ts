import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireSystemAdminWithCaller } from "@/lib/api-auth"
import { writeAuditLog, getCallerIp } from "@/lib/audit-log"

// =============================================================================
// PATCH /api/admin/clients/[id]  — update a client
// DELETE /api/admin/clients/[id] — delete a client
//
// PATCH body: any subset of
//   {
//     clientName, contactPersonName, contactPersonSurname,
//     email, contactNumber, status
//   }
//
// Auth: system_admin only.
// =============================================================================

interface UpdateClientBody {
  clientName?: string
  contactPersonName?: string
  contactPersonSurname?: string
  email?: string
  contactNumber?: string
  status?: "Active" | "Disabled"
}

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function PATCH(request: Request, context: RouteContext) {
  const { caller, denied } = await requireSystemAdminWithCaller()
  if (denied) return denied

  const { id } = await context.params
  if (!id) {
    return NextResponse.json({ error: "Missing client id" }, { status: 400 })
  }

  let body: UpdateClientBody
  try {
    body = (await request.json()) as UpdateClientBody
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
    .from("clients")
    .select("client_name, contact_person_name, contact_person_surname, email, contact_number, status")
    .eq("id", id)
    .single()

  const dbUpdates: Record<string, unknown> = {}
  if (body.clientName !== undefined) dbUpdates.client_name = body.clientName
  if (body.contactPersonName !== undefined) dbUpdates.contact_person_name = body.contactPersonName
  if (body.contactPersonSurname !== undefined) dbUpdates.contact_person_surname = body.contactPersonSurname
  if (body.email !== undefined) dbUpdates.email = body.email
  if (body.contactNumber !== undefined) dbUpdates.contact_number = body.contactNumber
  if (body.status !== undefined) dbUpdates.status = body.status

  if (Object.keys(dbUpdates).length === 0) {
    return NextResponse.json({ ok: true })
  }

  const { error: updErr } = await admin
    .from("clients")
    .update(dbUpdates)
    .eq("id", id)

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  // Audit log.
  const changes: Record<string, { old?: unknown; new?: unknown }> = {}
  if (body.clientName !== undefined && body.clientName !== current?.client_name)
    changes["Client Name"] = { old: current?.client_name, new: body.clientName }
  if (body.contactPersonName !== undefined && body.contactPersonName !== current?.contact_person_name)
    changes["Contact Person Name"] = { old: current?.contact_person_name, new: body.contactPersonName }
  if (body.contactPersonSurname !== undefined && body.contactPersonSurname !== current?.contact_person_surname)
    changes["Contact Person Surname"] = { old: current?.contact_person_surname, new: body.contactPersonSurname }
  if (body.email !== undefined && body.email !== current?.email)
    changes["Email"] = { old: current?.email, new: body.email }
  if (body.contactNumber !== undefined && body.contactNumber !== current?.contact_number)
    changes["Contact Number"] = { old: current?.contact_number, new: body.contactNumber }
  if (body.status !== undefined && body.status !== current?.status)
    changes["Status"] = { old: current?.status, new: body.status }

  if (Object.keys(changes).length > 0) {
    const action = changes["Status"] && Object.keys(changes).length === 1 ? "toggle_status" as const : "update" as const
    writeAuditLog({
      actorId: caller.id,
      actorName: caller.name,
      actorRole: caller.role,
      action,
      entityType: "client",
      entityId: id,
      entityName: current?.client_name ?? body.clientName,
      changes,
      ipAddress: getCallerIp(request),
    })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request, context: RouteContext) {
  const { caller, denied } = await requireSystemAdminWithCaller()
  if (denied) return denied

  const { id } = await context.params
  if (!id) {
    return NextResponse.json({ error: "Missing client id" }, { status: 400 })
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
    .from("clients")
    .select("client_name")
    .eq("id", id)
    .single()

  const { error: delErr } = await admin.from("clients").delete().eq("id", id)

  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 })
  }

  writeAuditLog({
    actorId: caller.id,
    actorName: caller.name,
    actorRole: caller.role,
    action: "delete",
    entityType: "client",
    entityId: id,
    entityName: delTarget?.client_name,
    ipAddress: getCallerIp(request),
  })

  return NextResponse.json({ ok: true })
}
