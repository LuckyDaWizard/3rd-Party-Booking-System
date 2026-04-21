import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireSystemAdminWithCaller } from "@/lib/api-auth"
import { writeAuditLog, getCallerIp } from "@/lib/audit-log"

// =============================================================================
// POST /api/admin/privacy/retention-sweep
//
// POPIA §14 — information must not be retained longer than necessary for
// the purpose it was collected for. This endpoint anonymises abandoned
// bookings older than RETENTION_ABANDONED_DAYS. The CareFirst T&Cs state
// a general 12-month retention, but abandoned bookings never completed
// the original purpose (consultation) so their retention clock is tighter.
//
// Scope: only Abandoned bookings with no completed payment. Completed
// bookings ("Payment Complete" / "Successful") are out of scope here
// because they're covered by medical-records retention rules (HPCSA) —
// those should be handled by a separate medical-records cleanup process
// that runs on a multi-year schedule, not this one.
//
// Body: {} (no args)
//
// Returns:
//   { ok: true, anonymisedCount: number, cutoff: string, generatedAt: string }
//
// Auth: system_admin only. Can be invoked manually or by a scheduler
// (pg_cron, external cron, or manually by an admin once a day).
//
// The Patient History page can also auto-trigger this on mount for
// system admins — it's cheap enough that running once per dashboard
// visit is fine (covers a small team with no scheduler).
// =============================================================================

const RETENTION_ABANDONED_DAYS = 30

/** Columns cleared during retention anonymisation. Mirrors the erasure
 *  endpoint's set so both code paths produce consistent tombstones. */
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

  let admin
  try {
    admin = getSupabaseAdmin()
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server misconfigured" },
      { status: 500 }
    )
  }

  const cutoff = new Date(
    Date.now() - RETENTION_ABANDONED_DAYS * 24 * 60 * 60 * 1000
  ).toISOString()

  // Find candidates — abandoned bookings older than the cutoff, not
  // already erased. Limit to 500 per sweep to keep the transaction
  // small; subsequent sweeps will catch the rest.
  const { data: candidates, error: findErr } = await admin
    .from("bookings")
    .select("id")
    .eq("status", "Abandoned")
    .lt("created_at", cutoff)
    .is("erased_at", null)
    .limit(500)

  if (findErr) {
    return NextResponse.json(
      { error: `Database error: ${findErr.message}` },
      { status: 500 }
    )
  }

  const count = candidates?.length ?? 0
  if (count === 0) {
    return NextResponse.json({
      ok: true,
      anonymisedCount: 0,
      cutoff,
      generatedAt: new Date().toISOString(),
    })
  }

  const patch: Record<string, unknown> = {
    erased_at: new Date().toISOString(),
    erased_reason: `Retention sweep (${RETENTION_ABANDONED_DAYS}d abandoned-booking policy)`,
  }
  for (const col of PII_COLUMNS_TO_CLEAR) {
    patch[col] = null
  }

  const ids = candidates!.map((r) => r.id)
  const { error: updErr } = await admin
    .from("bookings")
    .update(patch)
    .in("id", ids)

  if (updErr) {
    return NextResponse.json(
      { error: `Database error during sweep: ${updErr.message}` },
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
    entityName: `POPIA retention sweep (${count} booking(s) anonymised)`,
    changes: {
      "Policy": { new: `${RETENTION_ABANDONED_DAYS}d abandoned-booking retention` },
      "Cutoff": { new: cutoff },
      "Bookings Anonymised": { new: String(count) },
    },
    ipAddress: getCallerIp(request),
  })

  return NextResponse.json({
    ok: true,
    anonymisedCount: count,
    cutoff,
    generatedAt: new Date().toISOString(),
  })
}
