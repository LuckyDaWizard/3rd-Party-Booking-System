import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireAdminOrManager } from "@/lib/api-auth"
import { writeAuditLog, getCallerIp, bookingRef } from "@/lib/audit-log"
import { recordIncident, buildSignature } from "@/lib/incidents"
import { recordBookingValidator } from "@/lib/booking-validator"
import {
  buildSsoPayload,
  callSsoAutoRegister,
  getCareFirstConfig,
  type BookingForHandoff,
} from "@/lib/carefirst"
import { sendConsultLinkEmail } from "@/lib/email"
import { apiError } from "@/lib/api-response"
import { transitionStatus } from "@/lib/booking-state-machine"

type DeliveryMode = "device" | "email"

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
    return apiError("Missing booking id", 400)
  }

  // Optional body: { deliveryMode: "device" | "email" }
  // Defaults to "device" — backward-compatible with callers that don't
  // send a body. "email" routes the CareFirst redirect URL to the patient
  // by email instead of opening it in a new tab on the operator's device.
  let deliveryMode: DeliveryMode = "device"
  try {
    const body = await request.clone().json().catch(() => null)
    if (body && (body.deliveryMode === "email" || body.deliveryMode === "device")) {
      deliveryMode = body.deliveryMode
    }
  } catch {
    // No body / unparseable — keep the default.
  }

  let config
  try {
    config = getCareFirstConfig()
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Server misconfigured", 500)
  }

  let admin
  try {
    admin = getSupabaseAdmin()
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Server misconfigured", 500)
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
    return apiError("Booking not found", 404)
  }

  // Unit scoping.
  if (caller.role === "unit_manager") {
    if (!booking.unit_id) {
      return apiError("Forbidden — booking is not assigned to a unit", 403)
    }
    if (!caller.unitIds.includes(booking.unit_id)) {
      return apiError("Forbidden — booking is not in your assigned units", 403)
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
    return apiError("Booking is already marked as Successful but no redirect URL is stored. Contact support.", 409)
  }

  // Must be paid before we hand off.
  if (booking.status !== "Payment Complete") {
    return apiError(
      `Cannot start consultation — booking status is "${booking.status}". Payment must be complete first.`,
      409
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
    return apiError(
      `Cannot start consultation — missing required patient data: ${missing.join(", ")}.`,
      400
    )
  }

  const attemptCount = (booking.handoff_attempt_count ?? 0) + 1
  const attemptTime = new Date().toISOString()

  // Acquire the handoff lock BEFORE calling CareFirst (audit #8 follow-up:
  // prevents concurrent Start Consult clicks from each calling CareFirst
  // and creating duplicate SSO sessions on their side). The conditional
  // UPDATE matches only when the booking is still "Payment Complete" AND
  // no other request has handoff_status = "in_progress". A "failed" or
  // NULL value is fine — legitimate retries are still allowed. A "sent"
  // value would mean status is "Successful" which the .eq() also filters
  // out, so we don't have to spell it out.
  const { data: lockRows, error: lockErr } = await admin
    .from("bookings")
    .update({
      handoff_status: "in_progress",
      handoff_attempt_count: attemptCount,
      last_handoff_attempt_at: attemptTime,
    })
    .eq("id", id)
    .eq("status", "Payment Complete")
    .or("handoff_status.is.null,handoff_status.eq.failed")
    .select("id")

  if (lockErr) {
    return apiError(
      `Failed to acquire handoff lock: ${lockErr.message}`,
      500
    )
  }
  if (!lockRows || lockRows.length === 0) {
    // Either: (a) another Start Consult click for this booking is already
    // in flight, or (b) the booking has moved past Payment Complete since
    // the read above. Both are race conditions; the 409 tells the operator
    // to refresh and re-check.
    return apiError(
      "Another start-consult attempt is already in progress for this booking, or its status has changed. Please refresh and retry.",
      409
    )
  }

  // Build payload + call CareFirst — we now hold the lock.
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
    // PII redaction (audit #2): the previous version of this log dumped
    // the patient's first name + ID type + nationality + gender + country
    // + province into stderr to help spot patterns in CareFirst rejection
    // logic. That data is patient PII under POPIA and operational logs
    // are not patient-record-grade storage. The full booking context lives
    // in the `audit_log` table (written below via writeAuditLog), which
    // has proper service-role RLS protection.
    //
    // Operational diagnostics here are limited to: short booking
    // reference, CareFirst's own statusCode + error + rawResponse (none
    // of which contain our PII — they're CareFirst's own response body).
    console.error("[start-consultation] CareFirst handoff failed", {
      ref: bookingRef(id),
      statusCode: result.statusCode,
      error: result.error,
      rawResponse: result.rawResponse,
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
      entityType: "booking",
      entityId: id,
      entityName: `[${bookingRef(id)}] Start Consult (FAILED): ${patientName}`,
      changes: {
        "Handoff Status": { new: "failed" },
        "Error": { new: result.error ?? "Unknown" },
        "HTTP Status": { new: result.statusCode ? String(result.statusCode) : "n/a" },
        "Raw Response": {
          new: result.rawResponse
            ? String(result.rawResponse).slice(0, 500)
            : "(none)",
        },
        "Attempt": { new: String(attemptCount) },
      },
      ipAddress: getCallerIp(request),
    })

    // Record / update incident so the /reports Incidents listing surfaces
    // recurring upstream failures without anyone digging through audit log.
    // Signature dedupes by HTTP status (or "network" for transport failures)
    // so each distinct failure class gets its own incident.
    const failureClass = result.statusCode ?? "network"
    recordIncident({
      signature: buildSignature({
        source: "carefirst",
        endpoint: "start-consultation",
        statusOrClass: failureClass,
      }),
      source: "carefirst",
      category: "handoff",
      title:
        typeof failureClass === "number"
          ? `CareFirst Start Consult returning HTTP ${failureClass}`
          : "CareFirst Start Consult — network failure",
      errorMsg: result.error ?? "Unknown error",
      httpStatus: result.statusCode,
      rawSample: result.rawResponse
        ? typeof result.rawResponse === "string"
          ? result.rawResponse
          : JSON.stringify(result.rawResponse)
        : undefined,
      bookingId: id,
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
  // Conditional transition from Payment Complete (audit #8). If a stale /
  // concurrent writer changed the status while we were calling CareFirst,
  // the UPDATE matches 0 rows and we log loudly — the nurse can still use
  // the redirect URL we received, so this isn't user-fatal.
  const transitionResult = await transitionStatus(
    admin,
    id,
    "Payment Complete",
    "Successful",
    {
      handoff_status: "sent",
      handed_off_at: attemptTime,
      last_handoff_attempt_at: attemptTime,
      handoff_attempt_count: attemptCount,
      handoff_error_reason: null,
      handoff_redirect_url: result.redirectUrl ?? null,
      external_reference_id: result.externalReferenceId ?? null,
    }
  )

  if (!transitionResult.ok) {
    // Bad edge case: CareFirst registered the patient but our DB update
    // failed or got out-of-order. Don't show an error to the nurse (they
    // can still start the consult via the redirect URL) but log loudly.
    console.error(
      "[start-consultation] CareFirst succeeded but state transition failed:",
      transitionResult.reason,
      transitionResult.reason === "db-error" ? transitionResult.error : undefined
    )
  }

  // Snapshot the operator who handed off to CareFirst — best-effort,
  // fire-and-forget. Helper swallows its own errors; the response runs the
  // email-send + audit-log work in parallel below.
  void recordBookingValidator(admin, id, caller)

  // If the operator asked us to email the link, do that now. The handoff
  // itself has already succeeded — the booking is marked Successful no
  // matter what happens here. Email failure is a soft-fail surfaced to
  // the operator so they can fall back to opening the link on-device.
  let emailSent: boolean | null = null
  let emailError: string | null = null
  if (deliveryMode === "email") {
    if (!result.redirectUrl) {
      emailSent = false
      emailError = "CareFirst did not return a redirect URL; nothing to email."
    } else if (!booking.email_address) {
      emailSent = false
      emailError = "Booking has no email address on file."
    } else {
      const sendResult = await sendConsultLinkEmail({
        to: booking.email_address,
        firstName: booking.first_names ?? "there",
        consultUrl: result.redirectUrl,
      })
      emailSent = sendResult.sent
      if (!sendResult.sent) {
        emailError = sendResult.error ?? "Email delivery failed."
      }
    }
  }

  writeAuditLog({
    actorId: caller.id,
    actorName: caller.name,
    actorRole: caller.role,
    action: "update",
    entityType: "booking",
    entityId: id,
    entityName: `[${bookingRef(id)}] Start Consult (${deliveryMode === "email" ? "Email" : "Device"}): ${patientName}`,
    changes: {
      "Status": { old: "Payment Complete", new: "Successful" },
      "Handoff Status": { new: "sent" },
      "Delivery": { new: deliveryMode },
      "External Reference": { new: result.externalReferenceId ?? "none" },
      "Attempt": { new: String(attemptCount) },
      ...(deliveryMode === "email"
        ? { "Email Sent": { new: emailSent ? "yes" : `no (${emailError})` } }
        : {}),
    },
    ipAddress: getCallerIp(request),
  })

  return NextResponse.json({
    ok: true,
    redirectUrl: result.redirectUrl ?? null,
    deliveryMode,
    emailSent,
    emailError,
  })
}
