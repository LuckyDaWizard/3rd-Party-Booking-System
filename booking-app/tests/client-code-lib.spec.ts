/* eslint-disable no-console */
// =============================================================================
// client-code-lib.spec.ts — pure-function coverage for the per-client
// client_code helpers + the PayFast m_payment_id stripper.
//
// WHY A PLAYWRIGHT SPEC (not Vitest/Jest):
//   This repo is Playwright-only — there is NO Vitest/Jest config. Per the
//   project constraint we do NOT introduce a new framework; instead we exercise
//   the pure, framework-agnostic functions directly inside a Playwright test.
//   This mirrors phone-lib.spec.ts exactly.
//
//   src/lib/client-code.ts imports nothing (no React / server / DB), so it
//   loads unchanged under Playwright's TS loader. src/lib/payfast.ts imports
//   node:crypto + ./app-url only — both load fine in the Node test context, and
//   stripBookingId() itself touches neither, so importing the module to reach
//   the one pure export is safe.
//
//   We import via RELATIVE paths (../src/lib/...) — the Playwright test context
//   has no Next.js "@/lib/*" path-alias resolver.
//
//   These tests touch no DB, no server, no browser — a fast table-driven unit
//   suite on the Playwright harness. They get the dev-server boot from
//   playwright.config webServer but never hit it.
//
// WHAT THIS GUARDS
//   1. suggestClientCode() — the name → 3–5 char suggestion heuristic that the
//      Add/Manage Client wizard pre-fills.
//   2. isValidClientCode() — the format gate the admin routes use to 400 a bad
//      code (must stay in lockstep with the DB CHECK in migration 041 and
//      CLIENT_CODE_RE).
//   3. stripBookingId() — recovers the booking UUID from BOTH the new prefixed
//      m_payment_id ("<CODE>-<uuid>") and a legacy bare UUID. The notify route
//      + reconcile matcher rely on this for backward compatibility; a
//      regression here would strand either legacy or coded payments.
//
// HOW TO RUN:
//     cd booking-app
//     npx playwright test client-code-lib --project=chromium --workers=1
// =============================================================================

import { test, expect } from "@playwright/test"

import {
  CLIENT_CODE_RE,
  isValidClientCode,
  suggestClientCode,
} from "../src/lib/client-code"
import { stripBookingId } from "../src/lib/payfast"

// =============================================================================
// suggestClientCode — name → 3–5 char uppercase-alnum suggestion.
// =============================================================================
test("suggestClientCode derives the documented suggestions from client names", () => {
  // ----- Assert (table) -----------------------------------------------------
  // [name, expected] — the canonical cases from the lib's own doc-comment.
  const cases: Array<[string, string]> = [
    // Multi-word with a short trailing acronym-ish token → absorbed whole.
    ["International SOS", "ISOS"],
    // Multi-word, initials too short → padded from the 2nd word's body.
    ["Local Choice", "LCH"],
    // Single word → first 3–4 chars.
    ["Parkland", "PARK"],
    // Already a short code → returned as-is.
    ["FCS", "FCS"],
  ]
  for (const [name, expected] of cases) {
    expect(
      suggestClientCode(name),
      `suggestClientCode(${JSON.stringify(name)})`
    ).toBe(expected)
  }
})

test("suggestClientCode always yields an uppercase, hyphen-free result for normal names", () => {
  // ----- Assert -------------------------------------------------------------
  // Every documented suggestion is itself a valid client code. (Empty / too-
  // short SOURCE names are out of scope — the lib returns them as-is for the
  // UI/validator to flag; we don't invent characters.)
  for (const name of ["International SOS", "Local Choice", "Parkland", "FCS"]) {
    const code = suggestClientCode(name)
    expect(code, `suggestClientCode(${JSON.stringify(name)}) must be valid`).toMatch(
      CLIENT_CODE_RE
    )
  }
})

// =============================================================================
// isValidClientCode — accept/reject the format gate.
// =============================================================================
test("isValidClientCode accepts 3–5 uppercase alnum and rejects everything else", () => {
  // ----- Assert (table) -----------------------------------------------------
  // [code, expected]
  const cases: Array<[string, boolean]> = [
    // Accept: 3, 4, 5 chars; digits allowed; mixed letters+digits.
    ["FCS", true],
    ["ISOS", true],
    ["PARK", true],
    ["ABC12", true],
    ["12345", true],
    // Reject: lowercase.
    ["fcs", false],
    ["Park", false],
    // Reject: too short (< 3).
    ["AB", false],
    // Reject: too long (> 5).
    ["ABCDEF", false],
    // Reject: contains the reserved hyphen separator.
    ["AB-CD", false],
    // Reject: empty.
    ["", false],
    // Reject: whitespace / punctuation.
    ["AB C", false],
    ["AB.C", false],
  ]
  for (const [code, expected] of cases) {
    expect(
      isValidClientCode(code),
      `isValidClientCode(${JSON.stringify(code)})`
    ).toBe(expected)
  }
})

// =============================================================================
// stripBookingId — recover the booking UUID from a PayFast m_payment_id.
// =============================================================================
test("stripBookingId removes a recognised client-code prefix but leaves a bare UUID untouched", () => {
  // ----- Assert (table) -----------------------------------------------------
  // A representative UUIDv7-shaped id (the project uses uuid first segments of
  // 8 hex chars, which can NEVER match the {3,5} code prefix).
  const uuid = "a1b2c3d4-89ab-7cde-8123-456789abcdef"

  const cases: Array<[string, string]> = [
    // Prefixed ("<CODE>-<uuid>") → strip the code + first hyphen only.
    [`LCH-${uuid}`, uuid],
    // 5-char code prefix.
    [`ABC12-${uuid}`, uuid],
    // 3-char code prefix.
    [`FCS-${uuid}`, uuid],
    // Bare UUID → unchanged (8-hex first segment is NOT a 3–5 char code).
    [uuid, uuid],
    // Empty string → returned as-is (the guard short-circuits).
    ["", ""],
  ]
  for (const [ref, expected] of cases) {
    expect(stripBookingId(ref), `stripBookingId(${JSON.stringify(ref)})`).toBe(
      expected
    )
  }
})

test("stripBookingId only consumes the FIRST hyphen so the UUID's own hyphens survive", () => {
  // ----- Assert -------------------------------------------------------------
  // The UUID itself is hyphen-rich; stripping must not over-eat. This pins the
  // "indexOf('-') + 1" slice (not a greedy split) so a prefixed ref recovers
  // the complete, hyphen-bearing UUID.
  const uuid = "00000000-1111-2222-3333-444444444444"
  expect(stripBookingId(`TST-${uuid}`)).toBe(uuid)
  // Round-trips back through the same shape the seed/initiate build.
  expect(stripBookingId(`TST-${uuid}`).split("-")).toHaveLength(5)
})
