// =============================================================================
// phone-lib.spec.ts — pure-function coverage for the E.164 standardization libs
//
// WHY A PLAYWRIGHT SPEC (not Vitest/Jest):
//   This repo is Playwright-only — there is NO Vitest/Jest config and no
//   *.test.ts runner outside tests/ (see package.json: the only test script is
//   `playwright test`). Per the task constraint, we do NOT introduce a new
//   framework. Instead we exercise the pure, framework-agnostic functions in
//   src/lib/phone.ts + src/lib/phone-server.ts directly inside a Playwright
//   test. These modules import no React / next/server / Supabase, so they load
//   unchanged under Playwright's TS loader.
//
//   We import via a RELATIVE path (../src/lib/...) rather than the "@/lib/*"
//   alias on purpose: the Playwright test context has no Next.js path-alias
//   resolver (see tests/_helpers/admin.ts for the same caveat).
//
//   These tests touch no DB, no server, no browser navigation — they're a fast
//   table-driven unit suite that happens to run on the Playwright harness. They
//   still get the dev-server boot from playwright.config webServer, but never
//   hit it. If the project later adds Vitest, these cases port over verbatim.
//
// HOW TO RUN:
//     cd booking-app
//     npx playwright test phone-lib --project=chromium --workers=1
// =============================================================================

import { test, expect } from "@playwright/test"

import {
  COUNTRY_CODES,
  formatPhoneInput,
  validatePhone,
  normalizeToE164,
} from "../src/lib/phone"
import { deriveCountryFromNumber } from "../src/lib/phone-server"

// =============================================================================
// COUNTRY_CODES table — shape + the notable variable-length entries.
// =============================================================================
test("COUNTRY_CODES lists 12 countries with ZA first and the documented lengths", () => {
  // ----- Assert -------------------------------------------------------------
  expect(COUNTRY_CODES).toHaveLength(12)
  // ZA must be first — it is the default country.
  expect(COUNTRY_CODES[0].code).toBe("ZA")
  expect(COUNTRY_CODES[0].dial).toBe("+27")

  const byCode = Object.fromEntries(COUNTRY_CODES.map((c) => [c.code, c]))
  // Single-length countries.
  expect(byCode.ZA.nationalLengths).toEqual([9])
  expect(byCode.BW.nationalLengths).toEqual([8])
  expect(byCode.US.nationalLengths).toEqual([10])
  // Variable-length countries.
  expect(byCode.NA.nationalLengths).toEqual([8, 9])
  expect(byCode.GB.nationalLengths).toEqual([9, 10])
})

// =============================================================================
// formatPhoneInput — keystroke sanitiser: digits + a single leading "+".
// =============================================================================
test("formatPhoneInput keeps digits and a single leading +, dropping everything else", () => {
  // ----- Assert (table) -----------------------------------------------------
  const cases: Array<[string, string]> = [
    ["", ""],
    // Spaces, dashes, parens and letters are stripped.
    ["+27 82 123-4567", "+27821234567"],
    ["(082) 123 4567", "0821234567"],
    ["082abc1234567", "0821234567"],
    // Only the LEADING + survives; interior +'s are removed.
    ["+27+82+123", "+2782123"],
    // A non-leading + (no leading +) is dropped entirely.
    ["27+82", "2782"],
  ]
  for (const [input, expected] of cases) {
    expect(formatPhoneInput(input), `formatPhoneInput(${JSON.stringify(input)})`).toBe(
      expected
    )
  }
})

// =============================================================================
// validatePhone — "not yet filled in" states return {valid:false} with NO error.
// =============================================================================
test("validatePhone returns {valid:false} with no error for empty / '+' / bare dial", () => {
  // ----- Assert -------------------------------------------------------------
  // These represent "not yet filled in", not a typed-but-wrong number, so the
  // UI must not show an error message under the field.
  for (const raw of ["", "+", "+27"]) {
    const res = validatePhone("ZA", raw)
    expect(res.valid, `validatePhone("ZA", ${JSON.stringify(raw)}).valid`).toBe(false)
    expect(
      res.error,
      `validatePhone("ZA", ${JSON.stringify(raw)}).error must be undefined`
    ).toBeUndefined()
  }
})

test("validatePhone flags an unknown country with an error", () => {
  // ----- Assert -------------------------------------------------------------
  const res = validatePhone("XX", "0821234567")
  expect(res.valid).toBe(false)
  expect(res.error).toBe("Unknown country")
})

test("validatePhone reports a length error for a typed-but-wrong-length number", () => {
  // ----- Assert -------------------------------------------------------------
  // ZA national must be 9 digits; "123" has been typed so it IS an error state.
  const tooShort = validatePhone("ZA", "123")
  expect(tooShort.valid).toBe(false)
  expect(tooShort.error).toBeTruthy()

  // 10 national digits (08212345678 → trunk 0 stripped → 8212345678 = 10) is
  // also wrong for ZA.
  const tooLong = validatePhone("ZA", "08212345678")
  expect(tooLong.valid).toBe(false)
  expect(tooLong.error).toBeTruthy()
})

// =============================================================================
// validatePhone — variable-length countries accept each permitted length.
// =============================================================================
test("validatePhone honours variable-length national numbers (NA 8|9, GB 9|10)", () => {
  // ----- Assert -------------------------------------------------------------
  // NA allows 8 OR 9 national digits.
  expect(validatePhone("NA", "+2648123456").valid).toBe(true) // 8 national
  expect(validatePhone("NA", "+26481234567").valid).toBe(true) // 9 national
  // 7 national digits is rejected for NA.
  expect(validatePhone("NA", "+264812345").valid).toBe(false)

  // GB allows 9 OR 10 national digits.
  expect(validatePhone("GB", "+44123456789").valid).toBe(true) // 9 national
  expect(validatePhone("GB", "+441234567890").valid).toBe(true) // 10 national
})

// =============================================================================
// normalizeToE164 — canonical "+<dial><national>" or null. The headline table.
// =============================================================================
test("normalizeToE164 produces the canonical +<dial><national> for every accepted input shape", () => {
  // ----- Assert (table) -----------------------------------------------------
  // [countryCode, raw, expected]
  const cases: Array<[string, string, string | null]> = [
    // ZA — the three accepted input shapes all collapse to one canonical form.
    ["ZA", "0821234567", "+27821234567"], // trunk-0 local
    ["ZA", "+27821234567", "+27821234567"], // already E.164
    ["ZA", "+27 82 123 4567", "+27821234567"], // spaced E.164
    ["ZA", "821234567", "+27821234567"], // bare national
    // ZA — invalid lengths normalise to null.
    ["ZA", "123", null], // too short
    ["ZA", "08212345678", null], // 10 national digits — too long
    // Variable-length NA: both permitted lengths normalise.
    ["NA", "+2648123456", "+2648123456"], // 8 national
    ["NA", "+26481234567", "+26481234567"], // 9 national
    ["NA", "+264812345", null], // 7 national — rejected
    // Variable-length GB: both permitted lengths normalise.
    ["GB", "+44123456789", "+44123456789"], // 9 national
    ["GB", "+441234567890", "+441234567890"], // 10 national
  ]
  for (const [country, raw, expected] of cases) {
    expect(
      normalizeToE164(country, raw),
      `normalizeToE164(${JSON.stringify(country)}, ${JSON.stringify(raw)})`
    ).toBe(expected)
  }
})

test("normalizeToE164 returns null for the empty / bare-dial 'not filled in' states", () => {
  // ----- Assert -------------------------------------------------------------
  for (const raw of ["", "+", "+27"]) {
    expect(normalizeToE164("ZA", raw)).toBeNull()
  }
})

// =============================================================================
// deriveCountryFromNumber — server-only longest-prefix heuristic for the
// country-code-less tables (users, clients). Defaults to ZA.
// =============================================================================
test("deriveCountryFromNumber picks the longest-matching dial prefix and defaults to ZA", () => {
  // ----- Assert (table) -----------------------------------------------------
  const cases: Array<[string, string]> = [
    // International prefixes resolve to their country.
    ["+2648123456", "NA"], // +264 → NA
    ["+44123456789", "GB"], // +44 → GB
    ["+15551234567", "US"], // +1 → US
    ["+27821234567", "ZA"], // +27 → ZA
    // A spaced/formatted international number is cleaned before matching.
    ["+264 81 234 56", "NA"],
    // Bare local numbers (no + prefix) default to ZA.
    ["0821234567", "ZA"],
    ["821234567", "ZA"],
    ["", "ZA"],
    // An unknown + prefix that matches no entry also falls back to ZA.
    ["+9991234567", "ZA"],
  ]
  for (const [raw, expected] of cases) {
    expect(
      deriveCountryFromNumber(raw),
      `deriveCountryFromNumber(${JSON.stringify(raw)})`
    ).toBe(expected)
  }
})

test("deriveCountryFromNumber always returns a code that exists in COUNTRY_CODES", () => {
  // ----- Assert -------------------------------------------------------------
  // Longest-prefix invariant: every derived code is a real table entry.
  const known = new Set(COUNTRY_CODES.map((c) => c.code))
  for (const raw of ["+2648123456", "+44123456789", "+1555", "0820000000", "garbage"]) {
    expect(known.has(deriveCountryFromNumber(raw))).toBe(true)
  }
})
