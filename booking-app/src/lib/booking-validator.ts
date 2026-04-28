import type { SupabaseClient } from "@supabase/supabase-js"
import type { CallerInfo } from "@/lib/api-auth"

// =============================================================================
// recordBookingValidator
//
// Snapshots the operator who handled a booking onto the booking row, so the
// patient-history Excel export can attribute each booking to a facilitator.
//
// Called from every endpoint that can transition a booking towards or into
// "Payment Complete" / "Successful":
//   - /api/payfast/initiate          (operator clicked Pay with PayFast)
//   - /api/payfast/send-link         (operator emailed the patient a link)
//   - /api/bookings/[id]/mark-self-collect    (self-collect Confirm & Continue)
//   - /api/bookings/[id]/complete-payment     (manual supervisor confirmation)
//   - /api/bookings/[id]/start-consultation   (Start Consult handoff)
//
// Latest-write-wins: every touch updates the columns. The export shows the
// most recent operator who validated the booking.
//
// Best-effort: errors are swallowed (logged) so a snapshot failure cannot
// block the actual booking flow.
// =============================================================================

export async function recordBookingValidator(
  admin: SupabaseClient,
  bookingId: string,
  caller: CallerInfo
): Promise<void> {
  try {
    // Email isn't on CallerInfo — look it up. One-row, indexed query.
    const { data: row } = await admin
      .from("users")
      .select("email")
      .eq("id", caller.id)
      .single()
    const email = (row as { email: string | null } | null)?.email ?? null

    await admin
      .from("bookings")
      .update({
        validated_by_user_id: caller.id,
        validated_by_name: caller.name,
        validated_by_email: email,
      })
      .eq("id", bookingId)
  } catch (err) {
    console.warn(
      `[booking-validator] failed to snapshot validator for booking ${bookingId}:`,
      err
    )
  }
}
