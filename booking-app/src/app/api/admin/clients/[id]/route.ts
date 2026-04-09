import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireSystemAdmin } from "@/lib/api-auth"

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
  const denied = await requireSystemAdmin()
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

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request, context: RouteContext) {
  const denied = await requireSystemAdmin()
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

  // Deleting a client is a destructive action. The legacy client-store.deleteClient
  // did not clean up related units / user_units / bookings. Preserving that
  // behavior for now — Postgres FKs may cascade or block depending on schema.
  // If this errors in practice, we will add explicit child cleanup here.
  const { error: delErr } = await admin.from("clients").delete().eq("id", id)

  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
