import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import {
  requireSystemAdminWithCaller,
  isAuthorizedCronCall,
  type CallerInfo,
} from "@/lib/api-auth"
import { writeAuditLog, getCallerIp, SYSTEM_ACTOR_ID } from "@/lib/audit-log"
import { apiError } from "@/lib/api-response"

// =============================================================================
// POST /api/admin/privacy/retention-sweep
//
// POPIA §14 — information must not be retained longer than necessary for
// the purpose it was collected for. This endpoint anonymises INCOMPLETE
// bookings (Abandoned OR Discarded) older than RETENTION_INCOMPLETE_DAYS.
// The CareFirst T&Cs state a general 12-month retention, but an incomplete
// booking never completed the original purpose (consultation) so its
// retention clock is tighter.
//
// Scope: Abandoned AND Discarded bookings (both reached the patient-details
// step — so they carry PII — but never resulted in a consultation). A
// Discarded booking is the operator explicitly walking away; an Abandoned
// one is the flow being left open. Privacy-wise they're identical: PII with
// no completed purpose, so both age out on the same clock.
//
// Completed bookings ("Payment Complete" / "Successful") are out of scope
// here because they're covered by medical-records retention rules (HPCSA) —
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

// Abandoned + Discarded bookings share this clock — both carry PII with no
// completed consultation. (Renamed from RETENTION_ABANDONED_DAYS when the
// sweep was extended to Discarded; value unchanged.)
const RETENTION_INCOMPLETE_DAYS = 30

/** Statuses this sweep anonymises — incomplete bookings that carry PII but
 *  never completed the consultation purpose. Completed bookings are governed
 *  by HPCSA medical-records retention, not this policy. */
const SWEEPABLE_STATUSES = ["Abandoned", "Discarded"] as const

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
  // Auth: cron-secret header bypasses session auth so the 15-min VPS
  // crontab can run the retention sweep. Synthesize a system caller for
  // the audit-log entry.
  let caller: CallerInfo
  if (isAuthorizedCronCall(request)) {
    caller = {
      id: SYSTEM_ACTOR_ID,
      authUserId: SYSTEM_ACTOR_ID,
      role: "system_admin",
      unitIds: [],
      name: "Cron",
    }
  } else {
    const result = await requireSystemAdminWithCaller()
    if (result.denied) return result.denied
    caller = result.caller
  }

  let admin
  try {
    admin = getSupabaseAdmin()
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Server misconfigured", 500)
  }

  const cutoff = new Date(
    Date.now() - RETENTION_INCOMPLETE_DAYS * 24 * 60 * 60 * 1000
  ).toISOString()

  // Find candidates — incomplete (Abandoned/Discarded) bookings older than
  // the cutoff, not already erased. Limit to 500 per sweep to keep the
  // transaction small; subsequent sweeps will catch the rest.
  const { data: candidates, error: findErr } = await admin
    .from("bookings")
    .select("id")
    .in("status", SWEEPABLE_STATUSES)
    .lt("created_at", cutoff)
    .is("erased_at", null)
    .limit(500)

  if (findErr) {
    return apiError(`Database error: ${findErr.message}`, 500)
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
    erased_reason: `Retention sweep (${RETENTION_INCOMPLETE_DAYS}d incomplete-booking policy: abandoned/discarded)`,
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
    return apiError(`Database error during sweep: ${updErr.message}`, 500)
  }

  // Awaited (rather than fire-and-forget) because retention-sweep is the
  // slow path of a 15-min cron — on serverless/standalone Next.js the
  // response can return before a fire-and-forget audit write completes,
  // and the audit entry vanishes. This audit row is the POPIA evidence
  // trail for the anonymisation, so dropping it is unacceptable.
  await writeAuditLog({
    actorId: caller.id,
    actorName: caller.name,
    actorRole: caller.role,
    action: "update",
    entityType: "user",
    entityId: caller.id,
    entityName: `POPIA retention sweep (${count} booking(s) anonymised)`,
    changes: {
      "Policy": { new: `${RETENTION_INCOMPLETE_DAYS}d incomplete-booking retention (abandoned/discarded)` },
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
