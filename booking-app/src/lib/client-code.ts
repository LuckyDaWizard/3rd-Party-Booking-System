// =============================================================================
// client-code.ts
//
// Pure, framework-agnostic helpers for the per-client `client_code`.
//
// IMPORTANT: no React, no server, no DB imports — this module is imported by
// BOTH client components (Add/Manage Client wizard) and server code (admin
// routes). Keep it side-effect-free and dependency-free.
//
// A client_code is 3–5 UPPERCASE letters/digits, NO hyphen. The hyphen is the
// reserved separator in the PayFast m_payment_id ("<CLIENT_CODE>-<booking-uuid>"),
// so excluding it from codes lets `stripBookingId` (payfast.ts) recover the
// booking UUID unambiguously. Mirrors the DB CHECK in migration 041.
// =============================================================================

/** Canonical client-code format: 3–5 uppercase letters/digits, no hyphen. */
export const CLIENT_CODE_RE = /^[A-Z0-9]{3,5}$/

/** True when `code` is a well-formed client code. */
export function isValidClientCode(code: string): boolean {
  return CLIENT_CODE_RE.test(code)
}

/**
 * Derive a sensible 3–5 char uppercase-alphanumeric suggestion from a client
 * name. Best-effort only — the UI lets the user override.
 *
 * Strategy:
 *   - Strip everything that isn't a letter or digit, uppercase the rest.
 *   - Multiple words → take the first letter/digit of each word, joined. When
 *     that acronym is too short (e.g. a two-word name → 2 chars), extend it:
 *     a SHORT trailing word that looks like an acronym (e.g. "SOS") is absorbed
 *     whole — "International SOS" → "ISOS"; otherwise pad from the FIRST word's
 *     body — "Local Choice" → "LCH" (the C/H come from the second word's start).
 *   - Single word → take the first 3–4 characters ("Parkland" → "PARK",
 *     "FCS" → "FCS").
 *   - Always clamped to [3, 5] chars where the source allows; a source with
 *     fewer than 3 usable chars is returned as-is (the UI/validator will flag
 *     it — we never invent characters that aren't in the name).
 */
export function suggestClientCode(name: string): string {
  const cleaned = (name ?? "").toUpperCase()

  // Split into word tokens on any run of non-alphanumeric characters.
  const words = cleaned.split(/[^A-Z0-9]+/).filter(Boolean)
  if (words.length === 0) return ""

  if (words.length === 1) {
    // Single word → first 3–4 characters.
    return words[0].slice(0, 4)
  }

  // Multiple words → start from the initial of each word.
  let code = words.map((w) => w[0]).join("")

  if (code.length >= 3) {
    return code.slice(0, 5)
  }

  // Acronym shortcut: when the LAST word is itself a short all-caps-ish token
  // (≤4 chars, e.g. "SOS"), absorb it whole onto the leading initials so a
  // name like "International SOS" yields "ISOS" rather than padding from
  // "International".
  const last = words[words.length - 1]
  if (last.length <= 4) {
    const lead = words.slice(0, -1).map((w) => w[0]).join("")
    const acronym = (lead + last).slice(0, 5)
    if (acronym.length >= 3) return acronym
    code = acronym
  }

  // Still short → continue INTO the second word past its initial (which is
  // already in `code`), then fall back to the first word's body.
  // "Local Choice" → initials "LC" + "H" (next char of "CHOICE") → "LCH".
  const fillers = words[1].slice(1) + words[0].slice(1)
  for (const ch of fillers) {
    if (code.length >= 3) break
    code += ch
  }
  return code.slice(0, 5)
}
