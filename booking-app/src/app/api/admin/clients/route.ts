import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireSystemAdminWithCaller } from "@/lib/api-auth"
import { writeAuditLog, getCallerIp } from "@/lib/audit-log"

// =============================================================================
// POST /api/admin/clients
//
// Create a new client. Optionally creates a first unit if `initialUnitName`
// is provided (matches the legacy client-store addClient pattern).
//
// Body:
//   {
//     clientName: string
//     contactPersonName?: string
//     contactPersonSurname?: string
//     email?: string
//     contactNumber?: string
//     initialUnitName?: string | null  // null / "-" / omitted → no unit created
//   }
//
// Returns:
//   { id: string }   the new clients.id
//
// Auth: system_admin only. Required because under Phase 5 RLS, the
// authenticated role has no INSERT policy on public.clients — all writes go
// through this route using the service-role client.
// =============================================================================

interface CreateClientBody {
  clientName: string
  contactPersonName?: string
  contactPersonSurname?: string
  email?: string
  contactNumber?: string
  initialUnitName?: string | null
}

export async function POST(request: Request) {
  const { caller, denied } = await requireSystemAdminWithCaller()
  if (denied) return denied

  let body: CreateClientBody
  try {
    body = (await request.json()) as CreateClientBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!body.clientName?.trim()) {
    return NextResponse.json({ error: "clientName is required" }, { status: 400 })
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

  const { data: insertData, error: insertErr } = await admin
    .from("clients")
    .insert({
      client_name: body.clientName,
      contact_person_name: body.contactPersonName ?? null,
      contact_person_surname: body.contactPersonSurname ?? null,
      email: body.email ?? null,
      contact_number: body.contactNumber ?? null,
      status: "Active",
    })
    .select("id")
    .single()

  if (insertErr || !insertData) {
    return NextResponse.json(
      { error: `Failed to create client: ${insertErr?.message ?? "unknown"}` },
      { status: 500 }
    )
  }

  const clientId = insertData.id

  // Optionally create the initial unit. The legacy client-store.addClient
  // would insert a unit if the caller passed a non-"-" unit name.
  if (body.initialUnitName && body.initialUnitName.trim() && body.initialUnitName !== "-") {
    const { error: unitErr } = await admin.from("units").insert({
      client_id: clientId,
      unit_name: body.initialUnitName,
      status: "Active",
    })
    if (unitErr) {
      // Best-effort rollback so we don't leak a half-created client.
      await admin.from("clients").delete().eq("id", clientId)
      return NextResponse.json(
        { error: `Failed to create initial unit: ${unitErr.message}` },
        { status: 500 }
      )
    }
  }

  // Audit log.
  writeAuditLog({
    actorId: caller.id,
    actorName: caller.name,
    actorRole: caller.role,
    action: "create",
    entityType: "client",
    entityId: clientId,
    entityName: body.clientName,
    changes: {
      "Client Name": { new: body.clientName },
      ...(body.initialUnitName && body.initialUnitName !== "-"
        ? { "Initial Unit": { new: body.initialUnitName } }
        : {}),
    },
    ipAddress: getCallerIp(request),
  })

  return NextResponse.json({ id: clientId }, { status: 201 })
}
