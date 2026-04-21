import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireSystemAdminWithCaller } from "@/lib/api-auth"
import { writeAuditLog, getCallerIp } from "@/lib/audit-log"

// =============================================================================
// POST /api/admin/privacy/erase
//
// POPIA §24 — right to erasure. A patient requests deletion of their
// personal information. A system admin verifies identity out of band,
// then calls this endpoint to anonymise every booking matching that ID
// number.
//
// Why anonymise rather than delete:
//   - HPCSA rules require medical records retention for years after a
//     consultation
//   - Financial records (payment_amount, pf_payment_id) must be kept
//     for tax/audit purposes
//   - Audit trail referential integrity
//   So the row is kept; the PII fields are set to NULL and a tombstone
//   (erased_at, erased_reason) is written. The patient is no longer
//   identifiable by the data, satisfying POPIA.
//
// Body: { idNumber: string, reason?: string }
//
// Returns:
//   { ok: true, idNumber: string, erasedCount: number, generatedAt: string }
//
// Idempotent — running it twice does nothing on the second call because
// the bookings are already anonymised.
//
// Auth: system_admin only. This is a destructive action.
// =============================================================================

interface Body {
  idNumber?: string
  reason?: string
}

/** Columns cleared during erasure. Everything a POPIA data subject could use
 *  to identify themselves. Does NOT clear: status, timestamps, payment_*
 *  (financial records), unit_id (business/billing relationship), pf_payment_id,
 *  handoff_* (external system audit trail), consent_accepted_at (preserves
 *  the record that consent WAS given at the time). */
const PII_COLUMNS_TO_CLEAR = [
  "first_names",
  "surname",
  "id_number",
  "title",
  "nationality",
  "gender",
  "date_of_birth",
  "address",
  "suburb",
  "city",
  "province",
  "country",
  "postal_code",
  "country_code",
  "contact_number",
  "email_address",
  "additional_email",
  "blood_pressure",
  "glucose",
  "temperature",
  "oxygen_saturation",
  "urine_dipstick",
  "heart_rate",
  "additional_comments",
] as const

export async function POST(request: Request) {
  const { caller, denied } = await requireSystemAdminWithCaller()
  if (denied) return denied

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const idNumber = body.idNumber?.trim()
  const reason = body.reason?.trim() || "POPIA §24 erasure request"

  if (!idNumber) {
    return NextResponse.json(
      { error: "idNumber is required" },
      { status: 400 }
    )
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

  // Find the matching bookings first. Skip any already-erased rows
  // (idempotency — running twice shouldn't count them again).
  const { data: matches, error: findErr } = await admin
    .from("bookings")
    .select("id")
    .eq("id_number", idNumber)
    .is("erased_at", null)

  if (findErr) {
    return NextResponse.json(
      { error: `Database error: ${findErr.message}` },
      { status: 500 }
    )
  }

  const matchCount = matches?.length ?? 0
  if (matchCount === 0) {
    // Audit the request even when there's nothing to erase — the regulator
    // wants to see that we responded to the request.
    writeAuditLog({
      actorId: caller.id,
      actorName: caller.name,
      actorRole: caller.role,
      action: "update",
      entityType: "user",
      entityId: caller.id,
      entityName: `POPIA erasure: ID ${idNumber} (no matches)`,
      changes: {
        "ID Number": { new: idNumber },
        "Reason": { new: reason },
        "Bookings Erased": { new: "0" },
      },
      ipAddress: getCallerIp(request),
    })
    return NextResponse.json({
      ok: true,
      idNumber,
      erasedCount: 0,
      generatedAt: new Date().toISOString(),
    })
  }

  // Build the anonymisation patch.
  const patch: Record<string, unknown> = {
    erased_at: new Date().toISOString(),
    erased_reason: reason,
  }
  for (const col of PII_COLUMNS_TO_CLEAR) {
    patch[col] = null
  }

  const { error: updErr } = await admin
    .from("bookings")
    .update(patch)
    .eq("id_number", idNumber)
    .is("erased_at", null)

  if (updErr) {
    return NextResponse.json(
      { error: `Database error during erasure: ${updErr.message}` },
      { status: 500 }
    )
  }

  writeAuditLog({
    actorId: caller.id,
    actorName: caller.name,
    actorRole: caller.role,
    action: "update",
    entityType: "user",
    entityId: caller.id,
    entityName: `POPIA erasure: ID ${idNumber}`,
    changes: {
      "ID Number": { new: idNumber },
      "Reason": { new: reason },
      "Bookings Erased": { new: String(matchCount) },
      "Columns Cleared": { new: PII_COLUMNS_TO_CLEAR.join(", ") },
    },
    ipAddress: getCallerIp(request),
  })

  return NextResponse.json({
    ok: true,
    idNumber,
    erasedCount: matchCount,
    generatedAt: new Date().toISOString(),
  })
}
