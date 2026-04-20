// =============================================================================
// constants.ts
//
// Shared constants used across the booking app. Import from here instead of
// hardcoding magic numbers in individual files.
// =============================================================================

/**
 * Length of the 6-digit PIN used for user authentication and manager
 * verification. Supabase Auth has a hard floor of 6 characters for
 * passwords, so this cannot be lowered.
 *
 * Used by:
 *   - Sign-in page OTP input
 *   - Create-booking nurse verification OTP
 *   - Patient-details booking verification OTP
 *   - User-management PIN reset verification
 *   - Admin API route PIN validation regex
 */
export const PIN_LENGTH = 6

/**
 * Regex that validates a PIN string. Matches exactly PIN_LENGTH digits.
 * Used by server-side API routes to validate incoming PIN values.
 */
export const PIN_REGEX = new RegExp(`^\\d{${PIN_LENGTH}}$`)

// ---------------------------------------------------------------------------
// Session idle behaviour
//
// Medical apps should enforce a short idle timeout so a nurse who walks
// away from an unlocked workstation doesn't leave patient data exposed.
// These constants drive both the inactivity tracking (SessionIdleMonitor)
// and the countdown in the warning modal.
//
// Tuning: the WARNING threshold is when we show "you will be signed out
// soon" with a countdown; the TIMEOUT threshold is when we actually call
// signOut() and bounce the user to /sign-in. The two-minute gap gives
// the user time to react and click "Stay signed in".
// ---------------------------------------------------------------------------

/** Total idle time before auto sign-out, in milliseconds. */
export const IDLE_TIMEOUT_MS = 15 * 60 * 1000 // 15 minutes

/** How long before timeout to show the warning modal, in milliseconds. */
export const IDLE_WARNING_BEFORE_TIMEOUT_MS = 2 * 60 * 1000 // 2 minutes

/** Threshold at which we first show the warning modal. */
export const IDLE_WARNING_MS = IDLE_TIMEOUT_MS - IDLE_WARNING_BEFORE_TIMEOUT_MS

/** How often the monitor re-checks the idle duration. */
export const IDLE_TICK_MS = 5 * 1000 // 5 seconds

/** Activity events that reset the idle timer. */
export const IDLE_ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
  "click",
] as const
