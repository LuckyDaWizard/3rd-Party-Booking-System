import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireAdminOrManager } from "@/lib/api-auth"
import {
  getPayfastConfig,
  PAYMENT_AMOUNT,
  PAYMENT_ITEM_NAME,
} from "@/lib/payfast"
import { sendPaymentLinkEmail } from "@/lib/email"
import { writeAuditLog, getCallerIp, bookingRef } from "@/lib/audit-log"
import { recordBookingValidator } from "@/lib/booking-validator"

// =============================================================================
// POST /api/payfast/send-link
//
// Generates a PayFast payment URL for a booking and emails it to the patient
// (using the email captured during the booking flow). Used when the user
// picks "Send a payment link" as the payment type.
//
// Body: { bookingId: string }
//
// Returns:
//   { ok: true, emailSent: true }   on success
//   { ok: false, error: string }    on failure
//
// Auth: system_admin or unit_manager only (staff-driven action; a `user` role
// shouldn't be able to send arbitrary payment links).
// =============================================================================

interface Body {
  bookingId?: string
}

export async function POST(request: Request) {
  const { caller, denied } = await requireAdminOrManager()
  if (denied) return denied

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const bookingId = body.bookingId?.trim()
  if (!bookingId) {
    return NextResponse.json({ error: "bookingId is required" }, { status: 400 })
  }

  let config
  try {
    config = getPayfastConfig()
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

  // Load the booking.
  const { data: booking, error: loadErr } = await admin
    .from("bookings")
    .select(
      "id, status, first_names, surname, email_address, unit_id"
    )
    .eq("id", bookingId)
    .single()

  if (loadErr || !booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 })
  }

  if (booking.status !== "In Progress") {
    return NextResponse.json(
      {
        error: `Cannot send payment link — booking status is "${booking.status}"`,
      },
      { status: 409 }
    )
  }

  if (!booking.email_address) {
    return NextResponse.json(
      {
        error:
          "Booking has no patient email address. Go back and add an email before sending a payment link.",
      },
      { status: 400 }
    )
  }

  // Unit-scoping: unit_manager can only send links for bookings in their units.
  // system_admin can send for any booking.
  if (caller.role === "unit_manager") {
    if (!booking.unit_id || !caller.unitIds.includes(booking.unit_id)) {
      return NextResponse.json(
        { error: "Forbidden — booking is not in your assigned units" },
        { status: 403 }
      )
    }
  }

  // Defence-in-depth: refuse if the booking's parent client is configured
  // to collect payment directly. Sending a PayFast link in that case would
  // risk a double-charge (unit collects in person + patient pays online).
  // Resolved via units.client_id → clients.
  if (booking.unit_id) {
    const { data: unit } = await admin
      .from("units")
      .select("client_id")
      .eq("id", booking.unit_id)
      .single()
    const clientId = (unit as { client_id: string | null } | null)?.client_id
    if (clientId) {
      const { data: client } = await admin
        .from("clients")
        .select("collect_payment_at_unit, bill_monthly")
        .eq("id", clientId)
        .single()
      const c = client as {
        collect_payment_at_unit: boolean | null
        bill_monthly: boolean | null
      } | null
      if (c?.bill_monthly) {
        return NextResponse.json(
          {
            error:
              "This client is billed monthly. No payment link applies to bookings under this client.",
          },
          { status: 400 }
        )
      }
      if (c?.collect_payment_at_unit) {
        return NextResponse.json(
          {
            error:
              "This client collects payment directly. Use the in-unit payment confirmation flow instead.",
          },
          { status: 400 }
        )
      }
    }
  }

  // Persist the payment_amount on the booking so the ITN handler can validate
  // the amount PayFast reports back (same pattern as /api/payfast/initiate).
  await admin
    .from("bookings")
    .update({ payment_amount: parseFloat(PAYMENT_AMOUNT) })
    .eq("id", bookingId)

  // Snapshot the operator who emailed the payment link — best-effort.
  await recordBookingValidator(admin, bookingId, caller)

  // Build the payment link. The link points to our /pay/[bookingId] page,
  // which renders a form that auto-posts to PayFast. We don't link directly
  // to PayFast's /eng/process because that endpoint only accepts POST (not
  // GET), and passing the signature+passphrase data via query string
  // alone doesn't work.
  const paymentUrl = `${config.appUrl}/pay/${bookingId}`

  // Send the email.
  const emailResult = await sendPaymentLinkEmail({
    to: booking.email_address,
    firstName: booking.first_names ?? "there",
    paymentUrl,
    amount: PAYMENT_AMOUNT,
    itemName: PAYMENT_ITEM_NAME,
  })

  // Audit log.
  writeAuditLog({
    actorId: caller.id,
    actorName: caller.name,
    actorRole: caller.role,
    action: "update",
    entityType: "booking",
    entityId: bookingId,
    entityName: `[${bookingRef(bookingId)}] Payment link: ${`${booking.first_names ?? ""} ${booking.surname ?? ""}`.trim() || "Unknown patient"}`,
    changes: {
      "Payment Link Email": {
        new: emailResult.sent ? booking.email_address : "FAILED",
      },
    },
    ipAddress: getCallerIp(request),
  })

  if (!emailResult.sent) {
    return NextResponse.json(
      {
        ok: false,
        error: emailResult.error ?? "Failed to send payment link email",
      },
      { status: 502 }
    )
  }

  return NextResponse.json({ ok: true, emailSent: true })
}
