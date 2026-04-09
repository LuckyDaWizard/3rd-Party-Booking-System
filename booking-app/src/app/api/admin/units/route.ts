import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireSystemAdmin } from "@/lib/api-auth"

// =============================================================================
// POST /api/admin/units
//
// Create a new unit under a client. Optionally auto-assigns the caller to the
// new unit via user_units (matches the legacy unit-store addUnit behavior).
//
// Body:
//   {
//     unitName: string
//     clientId: string
//     contactPersonName?: string
//     contactPersonSurname?: string
//     email?: string
//     province?: string
//     assignToUserId?: string | null   // optional; if set, inserts user_units row
//   }
//
// Returns:
//   { id: string }   the new units.id
//
// Auth: system_admin only.
// =============================================================================

interface CreateUnitBody {
  unitName: string
  clientId: string
  contactPersonName?: string
  contactPersonSurname?: string
  email?: string
  province?: string
  assignToUserId?: string | null
}

const VALID_PROVINCES = [
  "Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal",
  "Limpopo", "Mpumalanga", "North West", "Northern Cape", "Western Cape",
]

function normalizeProvince(input: string | undefined): string | null {
  if (!input) return null
  const match = VALID_PROVINCES.find((p) => p.toLowerCase() === input.toLowerCase())
  return match ?? input
}

export async function POST(request: Request) {
  const denied = await requireSystemAdmin()
  if (denied) return denied

  let body: CreateUnitBody
  try {
    body = (await request.json()) as CreateUnitBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!body.unitName?.trim()) {
    return NextResponse.json({ error: "unitName is required" }, { status: 400 })
  }
  if (!body.clientId?.trim()) {
    return NextResponse.json({ error: "clientId is required" }, { status: 400 })
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
    .from("units")
    .insert({
      client_id: body.clientId,
      unit_name: body.unitName,
      contact_person_name: body.contactPersonName ?? null,
      contact_person_surname: body.contactPersonSurname ?? null,
      email: body.email ?? null,
      province: normalizeProvince(body.province),
      status: "Active",
    })
    .select("id")
    .single()

  if (insertErr || !insertData) {
    return NextResponse.json(
      { error: `Failed to create unit: ${insertErr?.message ?? "unknown"}` },
      { status: 500 }
    )
  }

  const unitId = insertData.id

  // Optionally assign a user to the new unit (legacy behavior: the creating
  // user is auto-assigned so they immediately have access to it).
  if (body.assignToUserId) {
    const { error: assignErr } = await admin.from("user_units").insert({
      user_id: body.assignToUserId,
      unit_id: unitId,
    })
    if (assignErr) {
      // Non-fatal — the unit exists, we just couldn't auto-assign. Log and
      // return success so the admin UI reflects the unit creation.
      console.warn(
        `Unit ${unitId} created but failed to auto-assign user ${body.assignToUserId}:`,
        assignErr.message
      )
    }
  }

  return NextResponse.json({ id: unitId }, { status: 201 })
}
