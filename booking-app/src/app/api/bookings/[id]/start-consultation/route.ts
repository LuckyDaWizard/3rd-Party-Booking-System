import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireAdminOrManager } from "@/lib/api-auth"
import { writeAuditLog, getCallerIp } from "@/lib/audit-log"
import { recordBookingValidator } from "@/lib/booking-validator"
import {
  buildSsoPayload,
  callSsoAutoRegister,
  getCareFirstConfig,
  type BookingForHandoff,
} from "@/lib/carefirst"

// =============================================================================
// POST /api/bookings/[id]/start-consultation
//
// Hand off a paid booking to the CareFirst Patient application for the
// virtual consultation. On success, returns a redirect URL that the caller
// should open in a new tab.
//
// Auth: system_admin (any booking) OR unit_manager (bookings in their units).
// The caller's PIN has already been verified client-side via the PIN modal
// before this route is invoked — same pattern as manual payment confirmation.
//
// Checks:
//   1. Session + role guard.
//   2. Booking exists.
//   3. Booking status is "Payment Complete" (idempotent for "Successful").
//   4. Unit scoping for unit_manager.
//
// On success (CareFirst returned 2xx):
//   - Store external_reference_id + handoff_redirect_url on the booking
//   - Set handoff_status = "sent", handed_off_at = now, status = "Successful"
//   - Return { ok: true, redirectUrl } to the client
//   - Audit log the handoff
//
// On failure (CareFirst returned non-2xx or network error):
//   - Booking stays at "Payment Complete" so the nurse can retry
//   - Set handoff_status = "failed", handoff_error_reason = <msg>,
//     handoff_attempt_count = handoff_attempt_count + 1
//   - Return 502 with the error message
//   - Audit log the failure
// =============================================================================

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: Request, context: RouteContext) {
  const { caller, denied } = await requireAdminOrManager()
  if (denied) return denied

  const { id } = await context.params
  if (!id) {
    return NextResponse.json({ error: "Missing booking id" }, { status: 400 })
  }

  let config
  try {
    config = getCareFirstConfig()
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server misconfigured" },
      { status: 500 }
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

  // Load the full booking needed for the CareFirst payload.
  const { data: booking, error: loadErr } = await admin
    .from("bookings")
    .select(
      [
        "id",
        "status",
        "unit_id",
        "email_address",
        "contact_number",
        "id_number",
        "id_type",
        "title",
        "first_names",
        "surname",
        "date_of_birth",
        "country_code",
        "nationality",
        "gender",
        "address",
        "suburb",
        "city",
        "province",
        "country",
        "postal_code",
        "booking_type",
        "scheduled_at",
        "handoff_redirect_url",
        "handoff_attempt_count",
      ].join(", ")
    )
    .eq("id", id)
    .single<
      BookingForHandoff & {
        status: string
        unit_id: string | null
        handoff_redirect_url: string | null
        handoff_attempt_count: number | null
      }
    >()

  if (loadErr || !booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 })
  }

  // Unit scoping.
  if (caller.role === "unit_manager") {
    if (!booking.unit_id) {
      return NextResponse.json(
        { error: "Forbidden — booking is not assigned to a unit" },
        { status: 403 }
      )
    }
    if (!caller.unitIds.includes(booking.unit_id)) {
      return NextResponse.json(
        { error: "Forbidden — booking is not in your assigned units" },
        { status: 403 }
      )
    }
  }

  // Idempotency: if the booking is already "Successful" and we have a stored
  // redirect URL, return it. This handles the case where the nurse clicks
  // Start Consult twice on a booking that was already handed off.
  if (booking.status === "Successful") {
    if (booking.handoff_redirect_url) {
      return NextResponse.json({
        ok: true,
        alreadyHandedOff: true,
        redirectUrl: booking.handoff_redirect_url,
      })
    }
    return NextResponse.json(
      {
        error:
          "Booking is already marked as Successful but no redirect URL is stored. Contact support.",
      },
      { status: 409 }
    )
  }

  // Must be paid before we hand off.
  if (booking.status !== "Payment Complete") {
    return NextResponse.json(
      {
        error: `Cannot start consultation — booking status is "${booking.status}". Payment must be complete first.`,
      },
      { status: 409 }
    )
  }

  // Required fields for CareFirst.
  const missing: string[] = []
  if (!booking.email_address) missing.push("email address")
  if (!booking.contact_number) missing.push("contact number")
  if (!booking.id_number) missing.push("ID number")
  if (!booking.first_names) missing.push("first names")
  if (!booking.surname) missing.push("surname")
  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: `Cannot start consultation — missing required patient data: ${missing.join(", ")}.`,
      },
      { status: 400 }
    )
  }

  const attemptCount = (booking.handoff_attempt_count ?? 0) + 1
  const attemptTime = new Date().toISOString()

  // Build payload + call CareFirst.
  const payload = buildSsoPayload(config, booking)
  const result = await callSsoAutoRegister(config, payload)

  const patientName =
    [booking.first_names, booking.surname].filter(Boolean).join(" ") ||
    "Unknown patient"

  if (!result.ok) {
    // Log CareFirst's raw response server-side so we can diagnose
    // "HTTP 500" / "HTTP 502" failures where extractErrorMessage couldn't
    // parse a useful reason out of their response body. This goes to the
    // container's stderr — visible via `docker logs` on the VPS or in
    // the dev server output locally.
    console.error("[start-consultation] CareFirst handoff failed", {
      bookingId: id,
      statusCode: result.statusCode,
      error: result.error,
      rawResponse: result.rawResponse,
      payloadSnapshot: {
        // PII-safe snapshot: enough to pattern-match the cause without
        // dumping the full booking row to logs.
        firstName: booking.first_names,
        idType: booking.id_type,
        nationality: booking.nationality,
        gender: booking.gender,
        country: booking.country,
        province: booking.province,
      },
    })

    // Record the failed attempt. Booking stays at "Payment Complete" so the
    // nurse can retry.
    await admin
      .from("bookings")
      .update({
        handoff_status: "failed",
        handoff_error_reason: result.error ?? "Unknown error",
        handoff_attempt_count: attemptCount,
        last_handoff_attempt_at: attemptTime,
      })
      .eq("id", id)

    writeAuditLog({
      actorId: caller.id,
      actorName: caller.name,
      actorRole: caller.role,
      action: "update",
      entityType: "user",
      entityId: id,
      entityName: `Start Consult (FAILED): ${patientName}`,
      changes: {
        "Handoff Status": { new: "failed" },
        "Error": { new: result.error ?? "Unknown" },
        "Attempt": { new: String(attemptCount) },
      },
      ipAddress: getCallerIp(request),
    })

    return NextResponse.json(
      {
        ok: false,
        error:
          result.error ?? "Failed to hand off to CareFirst Patient. Please try again.",
      },
      { status: 502 }
    )
  }

  // Success — mark the booking handed off and status "Successful".
  const { error: updErr } = await admin
    .from("bookings")
    .update({
      status: "Successful",
      handoff_status: "sent",
      handed_off_at: attemptTime,
      last_handoff_attempt_at: attemptTime,
      handoff_attempt_count: attemptCount,
      handoff_error_reason: null,
      handoff_redirect_url: result.redirectUrl ?? null,
      external_reference_id: result.externalReferenceId ?? null,
    })
    .eq("id", id)

  if (updErr) {
    // Bad edge case: CareFirst registered the patient but our DB update
    // failed. Don't show an error to the nurse (they can still start the
    // consult via the redirect URL) but log loudly.
    console.error(
      "[start-consultation] CareFirst succeeded but DB update failed:",
      updErr
    )
  }

  // Snapshot the operator who handed off to CareFirst — best-effort.
  await recordBookingValidator(admin, id, caller)

  writeAuditLog({
    actorId: caller.id,
    actorName: caller.name,
    actorRole: caller.role,
    action: "update",
    entityType: "user",
    entityId: id,
    entityName: `Start Consult: ${patientName}`,
    changes: {
      "Status": { old: "Payment Complete", new: "Successful" },
      "Handoff Status": { new: "sent" },
      "External Reference": { new: result.externalReferenceId ?? "none" },
      "Attempt": { new: String(attemptCount) },
    },
    ipAddress: getCallerIp(request),
  })

  return NextResponse.json({
    ok: true,
    redirectUrl: result.redirectUrl ?? null,
  })
}
