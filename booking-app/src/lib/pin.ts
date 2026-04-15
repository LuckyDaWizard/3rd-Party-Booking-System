// =============================================================================
// pin.ts
//
// Server-side PIN generation using cryptographically secure randomness.
// `Math.random()` is predictable (Mersenne Twister-based, not CSPRNG) and
// must never be used to generate credentials.
//
// IMPORTANT: server-only. The `crypto` module is Node's built-in.
// Never import from "use client" components — use an API route instead.
// =============================================================================

import crypto from "crypto"
import { PIN_LENGTH } from "./constants"

/**
 * Generate a cryptographically secure random PIN of PIN_LENGTH digits.
 * Zero-padded to ensure leading zeros are preserved (e.g. "042917").
 *
 * Uses `crypto.randomInt()` which reads from the OS CSPRNG
 * (/dev/urandom on Linux, BCryptGenRandom on Windows).
 */
export function generateSecurePin(): string {
  const max = 10 ** PIN_LENGTH // 1_000_000 for a 6-digit PIN
  const n = crypto.randomInt(0, max)
  return String(n).padStart(PIN_LENGTH, "0")
}
