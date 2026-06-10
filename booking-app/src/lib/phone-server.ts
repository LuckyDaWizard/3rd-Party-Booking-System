// =============================================================================
// phone-server.ts
//
// Server-only companion to phone.ts. The shared phone.ts module is the single
// source of truth for the country table + E.164 normalization and MUST stay
// framework-agnostic; it deliberately does NOT try to guess a country from a
// bare number, because the booking flow always knows the country (it has a
// country_code column / a picker).
//
// But two tables — public.users and public.clients — store a contact_number
// with NO accompanying country_code column. For those routes we must derive
// the country from the number itself before we can normalize it. That heuristic
// lives here (server-side) rather than in phone.ts so phone.ts stays a pure,
// country-explicit module.
//
// This file imports ONLY phone.ts (no React, no next/server, no Supabase), so
// it can also be used by the read-only backfill preview script.
// =============================================================================

import { COUNTRY_CODES } from "./phone"

/**
 * Best-effort country derivation for tables that store a contact_number without
 * a country_code (users, clients).
 *
 * Strategy:
 *   - Clean the input to digits + a single leading "+" (mirrors phone.ts's
 *     formatPhoneInput cleaning, but inline so we don't depend on it).
 *   - If it carries an international "+CC" prefix, pick the COUNTRY_CODES entry
 *     whose dial code is the LONGEST matching prefix (so "+264..." matches NA,
 *     not a hypothetical shorter "+2" entry — longest-prefix wins).
 *   - Otherwise (a bare local number, typically "0…") default to "ZA".
 *
 * Always returns an ISO-2 code that exists in COUNTRY_CODES. Defaults to "ZA"
 * when nothing matches (covers the common bare SA "0…" case and any unknown
 * prefix — normalizeToE164 will then reject it if it isn't a valid ZA number).
 */
export function deriveCountryFromNumber(raw: string): string {
  const cleaned = (raw ?? "").replace(/[^0-9+]/g, "").replace(/(?!^)\+/g, "")

  if (cleaned.startsWith("+")) {
    let best: { code: string; dialLen: number } | null = null
    for (const c of COUNTRY_CODES) {
      if (cleaned.startsWith(c.dial)) {
        if (!best || c.dial.length > best.dialLen) {
          best = { code: c.code, dialLen: c.dial.length }
        }
      }
    }
    if (best) return best.code
  }

  return "ZA"
}
