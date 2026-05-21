// =============================================================================
// booking-state-machine.ts
//
// Canonical model for booking.status transitions (audit #8 / Sprint 3 #12).
// Before this, the rules for which transitions are allowed lived in eight
// different files and there was no single place to assert that, say, a
// Successful booking can't go back to In Progress.
//
// The state machine:
//
//   In Progress ─┬─→ Payment Complete   (PayFast ITN / reconcile / manual /
//                │                       monthly-invoice / self-collect)
//                ├─→ Discarded          (operator discard action)
//                └─→ Abandoned          (navigate away / browser close /
//                                        new booking implicitly abandons)
//
//   Payment Complete ──→ Successful    (Start Consult handoff)
//
//   Abandoned ──→ In Progress           (resume from patient-history)
//
//   Discarded   — terminal, no outgoing transitions
//   Successful  — terminal, no outgoing transitions
//
// Concurrency note: the validator below is necessary but NOT sufficient on
// its own — two concurrent writers reading the same "In Progress" row could
// both pass validation and both transition to "Payment Complete". The
// `transitionStatus()` helper combines validation with a conditional UPDATE
// that filters on the expected current status, so PostgreSQL settles the
// race (the second writer's UPDATE matches 0 rows and the caller sees a
// "conflict" result).
//
// IMPORTANT: server-only. Import from API route handlers or supabase-admin
// callers. The client-side booking-store also uses the type + validator but
// not the helper (it doesn't have access to the admin client).
// =============================================================================

export type BookingStatus =
  | "In Progress"
  | "Payment Complete"
  | "Successful"
  | "Discarded"
  | "Abandoned"

/**
 * Allowed transitions, keyed by current status. Empty array = terminal
 * (Successful and Discarded — once there, no further status changes).
 *
 * Intentionally readonly to discourage runtime mutation that would silently
 * unlock disallowed transitions.
 */
export const TRANSITIONS: Readonly<Record<BookingStatus, readonly BookingStatus[]>> = {
  "In Progress": ["Payment Complete", "Discarded", "Abandoned"],
  "Payment Complete": ["Successful"],
  // Abandoned bookings can be either resumed (→ In Progress, normal flow)
  // or recovered directly to Payment Complete (admin path, used when a
  // PayFast payment is verified after the booking was abandoned — e.g.
  // user closed the success page before ITN arrived).
  "Abandoned": ["In Progress", "Payment Complete"],
  "Discarded": [],
  "Successful": [],
} as const

/** Statuses with no outgoing transitions. Useful for UI gating. */
export const TERMINAL_STATUSES: ReadonlySet<BookingStatus> = new Set([
  "Discarded",
  "Successful",
])

/**
 * Returns TRUE iff `from → to` is a permitted transition in the state
 * machine above. Returns FALSE for any disallowed pair, including
 * self-transitions (status → same status — not useful and usually a bug).
 */
export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return TRANSITIONS[from].includes(to)
}

/**
 * Like `canTransition` but throws on failure. Use when the calling code
 * shouldn't reach this point with an invalid transition — e.g. inside an
 * API route that's already validated the request shape.
 */
export function assertTransition(
  from: BookingStatus,
  to: BookingStatus
): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to)
  }
}

/**
 * Thrown by `assertTransition` and `transitionStatus` when a caller asks
 * for a transition the state machine doesn't permit. API route callers
 * catch this and translate to a 409 Conflict response.
 */
export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: BookingStatus,
    public readonly to: BookingStatus
  ) {
    super(`Cannot transition booking from "${from}" to "${to}".`)
    this.name = "InvalidTransitionError"
  }
}

// ---------------------------------------------------------------------------
// transitionStatus — combined validation + conditional update
// ---------------------------------------------------------------------------

/**
 * Result of a transition attempt:
 *   - ok: true                      — the row was updated to `to`
 *   - ok: false, reason: "conflict" — the row's current status didn't match
 *                                     `expectedFrom` (concurrent writer or
 *                                     stale read), no update happened
 *   - ok: false, reason: "not-found" — no row with that id
 *   - ok: false, reason: "db-error" — Supabase returned an error; details
 *                                     in `error`
 */
export type TransitionResult =
  | { ok: true }
  | { ok: false; reason: "conflict" | "not-found" | "db-error"; error?: unknown }

// Narrow Supabase-client surface so this module doesn't depend on the
// full @supabase/supabase-js type chain. PostgrestFilterBuilder is a
// thenable (PromiseLike) rather than a real Promise, so we type the
// terminal chain element as PromiseLike — that matches both real Supabase
// clients and stand-in test doubles.
type SupabaseLike = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any
}

/**
 * Validate `expectedFrom → to`, then perform a conditional UPDATE that
 * only matches when the row's current status is still `expectedFrom`.
 * PostgreSQL settles the race between concurrent writers: the second one
 * sees 0 rows updated and gets `ok: false, reason: "conflict"`.
 *
 * Extra columns to set in the same UPDATE (e.g. paid_at, completed_at) can
 * be passed via `extraColumns`.
 */
export async function transitionStatus(
  client: SupabaseLike,
  bookingId: string,
  expectedFrom: BookingStatus,
  to: BookingStatus,
  extraColumns: Record<string, unknown> = {}
): Promise<TransitionResult> {
  assertTransition(expectedFrom, to)

  const { data, error } = await client
    .from("bookings")
    .update({ ...extraColumns, status: to })
    .eq("id", bookingId)
    .eq("status", expectedFrom)
    .select("id")

  if (error) {
    return { ok: false, reason: "db-error", error }
  }
  const rows = (data as { id: string }[] | null) ?? []
  if (rows.length === 0) {
    // Could be either: the booking doesn't exist, OR its status has moved on
    // since the caller last read it. From the caller's perspective both
    // produce the same outcome (no transition happened) and the safe
    // response is the same — a 409 Conflict. Callers that need to
    // distinguish can read the row separately.
    return { ok: false, reason: "conflict" }
  }
  return { ok: true }
}
