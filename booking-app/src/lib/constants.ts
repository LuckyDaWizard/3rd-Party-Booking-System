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
