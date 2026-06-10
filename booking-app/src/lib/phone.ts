// =============================================================================
// phone.ts
//
// Single source of truth for contact-number country codes + E.164 validation.
//
// This is the keystone module for the E.164 standardization effort. Both client
// components (input fields, dedup .eq("contact_number", ...) queries) and server
// routes (canonical storage, validation at the route boundary) import it, so it
// MUST stay framework-agnostic: pure TypeScript, no React, no next/server, no
// Supabase. It runs unchanged in the browser and in Node.
//
// E.164 rule: a phone number is stored as "+<dial><national>", where <dial> is
// the country's calling code (e.g. "+27") and <national> is the subscriber
// number with NO leading trunk "0". Example: SA local "082 123 4567" becomes
// "+27821234567".
//
// `nationalLengths` is an ARRAY because several countries permit more than one
// national-number length (e.g. NA allows 8 or 9 digits, GB allows 9 or 10).
// =============================================================================

export interface CountryCode {
  /** ISO-2 country code, e.g. "ZA". */
  code: string
  /** "+CC" dial / calling code, e.g. "+27". */
  dial: string
  /**
   * Allowed digit counts for the national number (after the dial code and
   * after any trunk "0" is stripped). Multiple entries = variable-length.
   */
  nationalLengths: number[]
}

/**
 * The canonical country table. ZA is first because it is the default.
 */
export const COUNTRY_CODES: CountryCode[] = [
  { code: "ZA", dial: "+27", nationalLengths: [9] },
  { code: "BW", dial: "+267", nationalLengths: [8] },
  { code: "MZ", dial: "+258", nationalLengths: [9] },
  { code: "NA", dial: "+264", nationalLengths: [8, 9] },
  { code: "ZW", dial: "+263", nationalLengths: [9] },
  { code: "SZ", dial: "+268", nationalLengths: [8] },
  { code: "LS", dial: "+266", nationalLengths: [8] },
  { code: "NG", dial: "+234", nationalLengths: [10] },
  { code: "KE", dial: "+254", nationalLengths: [9] },
  { code: "GH", dial: "+233", nationalLengths: [9] },
  { code: "GB", dial: "+44", nationalLengths: [9, 10] },
  { code: "US", dial: "+1", nationalLengths: [10] },
]

/**
 * Sanitize keystrokes for an input field: keep only digits and a single leading
 * "+", stripping any other "+", spaces, dashes, and parens. Mirrors the legacy
 * formatSaPhone behavior. Use in onChange handlers.
 */
export function formatPhoneInput(raw: string): string {
  if (!raw) return ""
  // Only allow digits and a single leading +
  return raw.replace(/[^0-9+]/g, "").replace(/(?!^)\+/g, "")
}

/**
 * Look up a country entry by ISO-2 code. Returns undefined if unknown.
 */
function findCountry(countryCode: string): CountryCode | undefined {
  return COUNTRY_CODES.find((c) => c.code === countryCode)
}

/**
 * Derive the national number (digits after the country code / trunk 0) from a
 * cleaned input, accepting three shapes:
 *   - starts with the country's dial  → national = everything after the dial
 *   - starts with a single leading 0  → national = everything after the 0
 *   - otherwise                       → treat the whole thing as the national
 * Returns null when the result is not all digits.
 */
function deriveNational(country: CountryCode, cleaned: string): string | null {
  let national: string
  if (cleaned.startsWith(country.dial)) {
    national = cleaned.slice(country.dial.length)
  } else if (cleaned.startsWith("0")) {
    national = cleaned.slice(1)
  } else {
    national = cleaned
  }
  if (!/^[0-9]+$/.test(national)) return null
  return national
}

/**
 * Strict per-country validation.
 *
 * - Unknown country code → { valid: false, error: "Unknown country" }.
 * - Empty / just the dial code / just "+" → { valid: false } (no error;
 *   represents "not yet filled in", matching the legacy +27 === {valid:false}).
 * - National number must be all digits with a length in nationalLengths.
 */
export function validatePhone(
  countryCode: string,
  raw: string
): { valid: boolean; error?: string } {
  const country = findCountry(countryCode)
  if (!country) return { valid: false, error: "Unknown country" }

  const cleaned = (raw ?? "").replace(/[\s-]/g, "")

  // "Not yet filled in" states: empty, just "+", or just the dial code.
  if (!cleaned || cleaned === "+" || cleaned === country.dial) {
    return { valid: false }
  }

  const national = deriveNational(country, cleaned)
  if (national === null) return { valid: false, error: "Invalid contact number" }

  if (!country.nationalLengths.includes(national.length)) {
    const lengths = country.nationalLengths.join(" or ")
    return {
      valid: false,
      error: `Number must be ${lengths} digits after ${country.dial}`,
    }
  }

  return { valid: true }
}

/**
 * Return the canonical "+<dial><national>" E.164 string, or null if the input
 * is invalid for that country. This is what server routes store and what the
 * client uses before the dedup .eq("contact_number", ...) query.
 *
 * Examples (ZA):
 *   normalizeToE164("ZA", "0821234567")     === "+27821234567"
 *   normalizeToE164("ZA", "+27 82 123 4567") === "+27821234567"
 *   normalizeToE164("ZA", "821234567")      === "+27821234567"
 *   normalizeToE164("ZA", "123")            === null
 */
export function normalizeToE164(countryCode: string, raw: string): string | null {
  const { valid } = validatePhone(countryCode, raw)
  if (!valid) return null

  const country = findCountry(countryCode)
  if (!country) return null

  const cleaned = (raw ?? "").replace(/[\s-]/g, "")
  const national = deriveNational(country, cleaned)
  if (national === null) return null

  return `${country.dial}${national}`
}
