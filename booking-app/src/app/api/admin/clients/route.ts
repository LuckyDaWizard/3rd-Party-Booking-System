import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireSystemAdminWithCaller } from "@/lib/api-auth"
import { writeAuditLog, getCallerIp } from "@/lib/audit-log"
import { apiError } from "@/lib/api-response"
import { normalizeToE164 } from "@/lib/phone"
import { deriveCountryFromNumber } from "@/lib/phone-server"
import { isValidClientCode } from "@/lib/client-code"

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
  /** Hex like '#3ea3db', or null to leave the system default. */
  accentColor?: string | null
  /** 3–5 uppercase alnum, or null/empty to leave unset. */
  clientCode?: string | null
}

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

function normaliseAccent(raw: string | null | undefined): string | null {
  if (raw === undefined || raw === null || raw === "") return null
  if (!HEX_RE.test(raw)) {
    throw new Error(`Invalid accent colour: ${raw}`)
  }
  return raw.toLowerCase()
}

export async function POST(request: Request) {
  const { caller, denied } = await requireSystemAdminWithCaller()
  if (denied) return denied

  let body: CreateClientBody
  try {
    body = (await request.json()) as CreateClientBody
  } catch {
    return apiError("Invalid JSON body", 400)
  }

  if (!body.clientName?.trim()) {
    return apiError("clientName is required", 400)
  }

  let accentColor: string | null
  try {
    accentColor = normaliseAccent(body.accentColor)
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Invalid accent colour", 400)
  }

  // Client code: uppercase-trim, validate when present. null/empty → unset
  // (the column is nullable). Uniqueness is enforced by the partial unique
  // index — a collision surfaces as a 23505 on insert, caught below.
  let clientCode: string | null = null
  if (body.clientCode !== undefined && body.clientCode !== null && body.clientCode.trim() !== "") {
    const normalized = body.clientCode.trim().toUpperCase()
    if (!isValidClientCode(normalized)) {
      return apiError("Client code must be 3–5 uppercase letters/numbers", 400)
    }
    clientCode = normalized
  }

  // Server-authority contact-number normalization. The clients table has no
  // country_code column, so derive the country from the number itself, then
  // normalize to canonical E.164. Present-but-invalid → 400; empty/absent
  // stays allowed (the field is optional).
  let normalizedContact: string | null = body.contactNumber ?? null
  if (typeof body.contactNumber === "string" && body.contactNumber.trim() !== "") {
    const normalized = normalizeToE164(
      deriveCountryFromNumber(body.contactNumber),
      body.contactNumber
    )
    if (normalized === null) {
      return apiError("Invalid contact number", 400)
    }
    normalizedContact = normalized
  }

  let admin
  try {
    admin = getSupabaseAdmin()
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Server misconfigured", 500)
  }

  const { data: insertData, error: insertErr } = await admin
    .from("clients")
    .insert({
      client_name: body.clientName,
      contact_person_name: body.contactPersonName ?? null,
      contact_person_surname: body.contactPersonSurname ?? null,
      email: body.email ?? null,
      contact_number: normalizedContact,
      status: "Active",
      accent_color: accentColor,
      client_code: clientCode,
    })
    .select("id")
    .single()

  if (insertErr || !insertData) {
    // Partial unique index (migration 041) on client_code → 409 with a clear
    // message rather than a generic 500.
    if (insertErr?.code === "23505") {
      return apiError("That client code is already in use", 409)
    }
    return apiError(`Failed to create client: ${insertErr?.message ?? "unknown"}`, 500)
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
      return apiError(`Failed to create initial unit: ${unitErr.message}`, 500)
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
      ...(clientCode ? { "Client Code": { new: clientCode } } : {}),
      ...(body.initialUnitName && body.initialUnitName !== "-"
        ? { "Initial Unit": { new: body.initialUnitName } }
        : {}),
    },
    ipAddress: getCallerIp(request),
  })

  return NextResponse.json({ id: clientId }, { status: 201 })
}
