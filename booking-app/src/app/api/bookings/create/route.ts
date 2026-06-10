import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireAuthenticated } from "@/lib/api-auth"
import { createRateLimiter } from "@/lib/rate-limit"
import { writeAuditLog, getCallerIp, bookingRef } from "@/lib/audit-log"
import { apiError } from "@/lib/api-response"
import { normalizeToE164 } from "@/lib/phone"

// Per-user rate limit on booking creation. A legitimate operator starts one
// booking at a time; 10/min leaves room for honest retries on flaky networks
// but stops a compromised session (or a runaway client loop) from spamming
// inserts. Matches the shape used by /api/payfast/initiate (audit #19).
const createRateLimit = createRateLimiter({
  max: 10,
  windowMs: 60 * 1000,
})

// =============================================================================
// POST /api/bookings/create  (D20)
//
// Server-authority booking create. Replaces the direct browser → Supabase
// insert that the booking store used to run (booking-store.tsx createBooking).
// Moving it server-side gives us: per-user rate limiting, database-backed
// idempotency, central audit logging, and server-forced status — none of
// which a client-side double-click guard (D19) could provide. A production
// duplicate-booking incident (Lucky Mokoena, 2026/06/01 14:14) motivated D19;
// D20 closes the underlying gap.
//
// AUTH: any authenticated, Active user (system_admin / unit_manager / user).
// Non-admins are unit-scoped — they may only create bookings for a unit they
// belong to. system_admin bypasses unit scoping.
//
// CSRF: state-changing POST. CSRF is enforced by the proxy (src/proxy.ts)
// double-submit cookie check for every protected method on non-exempt paths;
// /api/bookings/* is NOT in CSRF_EXEMPT_PATHS, so the proxy auto-covers this
// route. The Frontend MUST send the `x-csrf-token` header (read from the
// csrf cookie) — the same way it calls /api/coupons/apply and
// /api/payfast/reconcile. This handler does NOT re-validate CSRF; by the time
// it runs the proxy has already passed it.
//
// REQUEST
//   POST /api/bookings/create
//   Content-Type: application/json
//   x-csrf-token: <csrf cookie value>          (required, enforced by proxy)
//   X-Idempotency-Key: <uuid>                  (optional, recommended)
//   Body: the booking field object the store builds via mapBookingToDb(),
//         MINUS server-controlled fields. snake_case DB-column keys (see
//         WRITABLE_COLUMNS) — this is the exact shape the store sends.
//         `unit_id` is required. `status`, `current_step`, `id`, timestamps,
//         payment fields, and audit fields are ignored if sent (status +
//         current_step are server-forced) — never trusted from the client.
//
// RESPONSE
//   200 { ok: true, bookingId: string, idempotent?: boolean }
//   400 / 401 / 403 / 429 / 500 → apiError shape { error: string }
//
// IDEMPOTENCY
//   If X-Idempotency-Key is present we (1) pre-check for an existing row with
//   that key and short-circuit on a hit, and (2) catch the 23505 unique
//   violation from the partial unique index (migration 040) on a concurrent
//   same-key insert, re-SELECTing and returning the winner. Without the
//   header, every call inserts a new row (legacy behaviour).
// =============================================================================

// Whitelist of client-writable booking columns (snake_case DB column names —
// the exact shape the booking store sends via mapBookingToDb()). This mirrors
// mapBookingToDb()'s output in booking-store.tsx, MINUS `status` and
// `current_step` (both server-forced — never trusted from the client; status
// mirrors the RLS INSERT policy from migration 016). Any key not in this set
// is silently dropped, so a client cannot smuggle in `id`, timestamps,
// payment_*, coupon_*, or audit columns. `unit_id` is in the set but the
// authoritative validated value is re-applied after the loop.
const WRITABLE_COLUMNS: ReadonlySet<string> = new Set([
  "search_type",
  "first_names",
  "surname",
  "id_type",
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
  "script_to_another_email",
  "additional_email",
  "payment_type",
  "blood_pressure",
  "glucose",
  "temperature",
  "oxygen_saturation",
  "urine_dipstick",
  "heart_rate",
  "additional_comments",
  "terms_accepted",
  "terms_accepted_at",
  "consent_accepted_at",
  "unit_id",
])

export async function POST(request: Request) {
  // 1. Auth.
  const { caller, denied } = await requireAuthenticated()
  if (denied) return denied

  // 2. Rate limit — keyed by user id (per-account, not per-IP) so operators
  //    behind a shared NAT don't share a bucket.
  const limit = createRateLimit(caller.id)
  if (!limit.allowed) {
    return apiError(
      `Too many booking attempts. Please retry in ${limit.retryAfterSeconds}s.`,
      429,
      { headers: { "retry-after": String(limit.retryAfterSeconds) } }
    )
  }

  // 3. Parse body.
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return apiError("Invalid JSON body", 400)
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return apiError("Request body must be a JSON object", 400)
  }

  // 4. Resolve + validate unit_id. Reject creates with no unit — mirrors the
  //    create-booking page's existing block. A null unit would also bypass the
  //    non-admin unit-scoping check below, so we require it for everyone.
  const unitId = body.unit_id
  if (typeof unitId !== "string" || unitId.trim() === "") {
    return apiError("unit_id is required", 400)
  }

  // Non-admins may only create bookings for a unit they belong to. system_admin
  // bypasses. Mirrors the RLS unit-scoping in migration 016 (service role
  // bypasses RLS, so we enforce it in code).
  if (caller.role !== "system_admin" && !caller.unitIds.includes(unitId)) {
    return apiError("Forbidden — unit is not in your assigned units", 403)
  }

  let admin
  try {
    admin = getSupabaseAdmin()
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Server misconfigured", 500)
  }

  // 5. Idempotency pre-check. If the caller minted a key for this submit
  //    attempt and we already have a row for it, return that row WITHOUT
  //    inserting. The header is optional; an empty/whitespace value is
  //    treated as absent.
  const rawIdempotencyKey = request.headers.get("x-idempotency-key")
  const idempotencyKey =
    rawIdempotencyKey && rawIdempotencyKey.trim() !== ""
      ? rawIdempotencyKey.trim()
      : null

  if (idempotencyKey) {
    // Caller-scoped: an idempotency key only ever resolves to THIS caller's
    // booking. The partial unique index stays global (a key is unique system-
    // wide), but the lookup is scoped so a crafted/replayed X-Idempotency-Key
    // from another session can never resolve to — or leak the existence of —
    // someone else's booking (Code Review: IDOR-shaped edge).
    const { data: existing } = await admin
      .from("bookings")
      .select("id")
      .eq("idempotency_key", idempotencyKey)
      .eq("created_by", caller.id)
      .maybeSingle()
    if (existing?.id) {
      return NextResponse.json({
        ok: true,
        bookingId: existing.id as string,
        idempotent: true,
      })
    }
  }

  // 6. Abandon the caller's prior In-Progress booking (logic moved out of the
  //    store). Each operator works one booking at a time; starting a new one
  //    means the previous draft is being walked away from. The conditional
  //    .eq("status", "In Progress") makes this a no-op if it already advanced.
  //    The release_coupon_on_abandon BEFORE-UPDATE trigger fires here — it's
  //    SECURITY DEFINER (migration 037) so the service-role UPDATE is fine.
  //
  //    Scope: bookings created BY this caller (created_by, migration 040). This
  //    faithfully preserves the pre-D20 behaviour — the store abandoned only the
  //    operator's OWN previous draft (its client-side activeBookingId). Scoping
  //    by unit instead would clobber a different operator's in-progress draft on
  //    a shared unit. An operator has at most one In-Progress draft at a time
  //    (the flow is one-at-a-time), so this normally touches exactly that row.
  await admin
    .from("bookings")
    .update({ status: "Abandoned" })
    .eq("created_by", caller.id)
    .eq("status", "In Progress")

  // 7. Build the insert row: whitelisted client columns + server-forced
  //    status/current_step + idempotency key. `status` is ALWAYS "In Progress"
  //    regardless of what the client sent (mirrors migration 016 RLS).
  //    `current_step` is forced to "search" — the store strips it from the
  //    body and rebuilds its local row with "search", so the create step is
  //    always the search step; pinning it here keeps client + server aligned.
  const insertRow: Record<string, unknown> = {}
  for (const column of WRITABLE_COLUMNS) {
    if (body[column] !== undefined) insertRow[column] = body[column]
  }
  insertRow.status = "In Progress"
  insertRow.current_step = "search"
  insertRow.unit_id = unitId // authoritative — already validated above
  insertRow.created_by = caller.id // ownership — scopes future abandon-prior
  if (idempotencyKey) insertRow.idempotency_key = idempotencyKey

  // 7b. Server-authority contact-number normalization. Numbers are PII that
  //     flow to CareFirst on handoff, so the server is the authority on their
  //     canonical E.164 form. If a contact number is present and non-empty,
  //     normalize it to "+<dial><national>" against the row's country (default
  //     ZA) and REJECT 400 when it's present-but-invalid. Empty/absent stays
  //     allowed (the field is optional at intake).
  const rawContact = insertRow.contact_number
  if (typeof rawContact === "string" && rawContact.trim() !== "") {
    const countryCode =
      typeof insertRow.country_code === "string" && insertRow.country_code.trim() !== ""
        ? insertRow.country_code
        : "ZA"
    const normalized = normalizeToE164(countryCode, rawContact)
    if (normalized === null) {
      return apiError("Invalid contact number for the selected country", 400)
    }
    insertRow.contact_number = normalized
  }

  const { data: inserted, error: insertErr } = await admin
    .from("bookings")
    .insert(insertRow)
    .select("id")
    .single()

  if (insertErr) {
    // 8. Concurrent same-key insert: the partial unique index (migration 040)
    //    raised a unique violation. The other request won the race; re-SELECT
    //    by key and return its id so both callers resolve to one booking.
    if (insertErr.code === "23505" && idempotencyKey) {
      const { data: winner } = await admin
        .from("bookings")
        .select("id")
        .eq("idempotency_key", idempotencyKey)
        .eq("created_by", caller.id)
        .maybeSingle()
      if (winner?.id) {
        return NextResponse.json({
          ok: true,
          bookingId: winner.id as string,
          idempotent: true,
        })
      }
      // Fell through (key vanished?) — surface as a generic failure.
    }
    console.error("Error creating booking:", insertErr)
    return apiError("Couldn't start a new booking. Please try again.", 500)
  }

  const bookingId = inserted.id as string

  // 9. Audit the create. Actor is the real caller. AWAITED (not fire-and-
  //    forget): central audit logging is a stated goal of D20, and on a fast/
  //    edge runtime the function can be torn down after the response flushes,
  //    dropping a fire-and-forget insert (cf. Sprint F N7). writeAuditLog never
  //    throws (internal try/catch), so awaiting can't fail the create — it just
  //    guarantees the row lands. One insert on an already-DB-bound path. Never
  //    logs full PII: short bookingRef + patient name only.
  const firstNames =
    typeof body.first_names === "string" ? body.first_names : ""
  const surname = typeof body.surname === "string" ? body.surname : ""
  const patientName = [firstNames, surname].filter(Boolean).join(" ").trim()

  await writeAuditLog({
    actorId: caller.id,
    actorName: caller.name,
    actorRole: caller.role,
    action: "create",
    entityType: "booking",
    entityId: bookingId,
    entityName: patientName
      ? `[${bookingRef(bookingId)}] Booking for ${patientName}`
      : `[${bookingRef(bookingId)}] Booking (no patient info yet)`,
    changes: {
      Status: { new: "In Progress" },
    },
    ipAddress: getCallerIp(request),
  })

  // 10. Done. A fresh insert is never idempotent (the idempotent:true cases
  //     all return earlier).
  return NextResponse.json({ ok: true, bookingId })
}
