/* eslint-disable no-console */
// =============================================================================
// carefirst-routing.spec.ts — pure-function coverage for the per-client
// CareFirst SSO routing resolver (B1).
//
// WHY A PLAYWRIGHT SPEC (not Vitest/Jest):
//   This repo is Playwright-only — there is NO Vitest/Jest config. Per the
//   project constraint we do NOT introduce a new framework; instead we exercise
//   the pure, framework-agnostic functions directly inside a Playwright test.
//   This mirrors phone-lib.spec.ts / client-code-lib.spec.ts exactly.
//
//   src/lib/carefirst.ts imports only ./app-url (which reads NEXT_PUBLIC_APP_URL
//   and never throws). The two functions under test —
//   getCareFirstConfigForClient() + isValidApiDomain() — touch no React / next/
//   server / Supabase, so the module loads unchanged under Playwright's TS
//   loader. We import via a RELATIVE path (../src/lib/carefirst) because the
//   Playwright test context has no Next.js "@/lib/*" path-alias resolver.
//
//   These tests touch no DB, no server, no browser — a fast table-driven unit
//   suite that happens to run on the Playwright harness. They still get the
//   dev-server boot from playwright.config webServer but never hit it.
//
// WHAT THIS GUARDS — getCareFirstConfigForClient(), the B1 routing resolver:
//   1. Un-mapped client (no carefirst_client_code, or a null client) → returns
//      the env-DEFAULT config. Unchanged legacy behaviour.
//   2. Mapped client + per-client API key present in env → returns that
//      client's clientCode + the PER-CLIENT key (NOT the env-default key).
//   3. Mapped client + per-client key MISSING → THROWS. This is the
//      patient-routing-integrity guard (fail-closed: never fall back to the
//      env-default key, which would register the patient under the wrong
//      CareFirst account). The most load-bearing case in this file.
//   4. Plan-code + API-domain fallback: a mapped client with null plan/domain
//      falls back to env; a client-set domain wins over env.
//   5. isValidApiDomain() — accept bare host + full https URL; reject
//      empty / "https://" (no host) / garbage.
//
// ENV ISOLATION:
//   getCareFirstConfigForClient() reads process.env at call time. Each test
//   snapshots the CareFirst-related env keys, mutates them for the case, and
//   restores them in a finally block so cases don't bleed into each other (or
//   into the dev-server process — though these run in the worker, not the
//   server).
//
// HOW TO RUN:
//     cd booking-app
//     npx playwright test carefirst-routing --project=chromium --workers=1
// =============================================================================

import { test, expect } from "@playwright/test"

import {
  getCareFirstConfigForClient,
  isValidApiDomain,
} from "../src/lib/carefirst"

// ----- Env snapshot / restore helper -----------------------------------------
//
// We touch only the CareFirst keys plus the one per-client key the mapped
// cases use. Snapshot is `string | undefined` so we can faithfully restore a
// previously-unset var back to deleted (not "").

const TOUCHED_ENV_KEYS = [
  "CAREFIRST_API_DOMAIN",
  "CAREFIRST_API_KEY",
  "CAREFIRST_CLIENT_CODE",
  "CAREFIRST_CLIENT_PLAN_CODE",
  "CAREFIRST_API_KEY__TESTCODE",
] as const

type EnvSnapshot = Record<(typeof TOUCHED_ENV_KEYS)[number], string | undefined>

function snapshotEnv(): EnvSnapshot {
  const snap = {} as EnvSnapshot
  for (const k of TOUCHED_ENV_KEYS) snap[k] = process.env[k]
  return snap
}

function restoreEnv(snap: EnvSnapshot): void {
  for (const k of TOUCHED_ENV_KEYS) {
    if (snap[k] === undefined) delete process.env[k]
    else process.env[k] = snap[k]
  }
}

/** Set the env-DEFAULT CareFirst config to a known, distinguishable baseline. */
function setEnvDefaults(): void {
  process.env.CAREFIRST_API_DOMAIN = "env-default.carefirst.test"
  process.env.CAREFIRST_API_KEY = "ENV-DEFAULT-KEY"
  process.env.CAREFIRST_CLIENT_CODE = "ENVDEFAULT"
  process.env.CAREFIRST_CLIENT_PLAN_CODE = "ENVPLAN"
  delete process.env.CAREFIRST_API_KEY__TESTCODE
}

// =============================================================================
// 1. Un-mapped client → env-default config (legacy behaviour).
// =============================================================================
test("getCareFirstConfigForClient returns the env default for an un-mapped client", () => {
  const snap = snapshotEnv()
  try {
    // ----- Arrange ----------------------------------------------------------
    setEnvDefaults()

    // ----- Act / Assert -----------------------------------------------------
    // Both shapes of "un-mapped": a null client object, and a row whose
    // carefirst_client_code is null. Each must yield the env-default account.
    for (const client of [null, { carefirst_client_code: null }] as const) {
      const cfg = getCareFirstConfigForClient(client)
      expect(
        cfg.clientCode,
        "un-mapped client must use the env-default clientCode"
      ).toBe("ENVDEFAULT")
      expect(
        cfg.apiKey,
        "un-mapped client must use the env-default apiKey"
      ).toBe("ENV-DEFAULT-KEY")
      expect(cfg.apiDomain).toBe("env-default.carefirst.test")
      expect(cfg.clientPlanCode).toBe("ENVPLAN")
    }
  } finally {
    restoreEnv(snap)
  }
})

// =============================================================================
// 2. Mapped client + per-client key present → per-client clientCode + key.
// =============================================================================
test("getCareFirstConfigForClient resolves the per-client key for a mapped client", () => {
  const snap = snapshotEnv()
  try {
    // ----- Arrange ----------------------------------------------------------
    setEnvDefaults()
    // The per-client key lives in env keyed by the code. It MUST win over the
    // env-default key — routing the patient to the right CareFirst account.
    process.env.CAREFIRST_API_KEY__TESTCODE = "PER-CLIENT-KEY-TESTCODE"

    // ----- Act --------------------------------------------------------------
    const cfg = getCareFirstConfigForClient({ carefirst_client_code: "TESTCODE" })

    // ----- Assert -----------------------------------------------------------
    // Load-bearing: the resolved clientCode is the client's code, and the key
    // is the PER-CLIENT key — NOT the env-default key.
    expect(cfg.clientCode).toBe("TESTCODE")
    expect(cfg.apiKey).toBe("PER-CLIENT-KEY-TESTCODE")
    expect(
      cfg.apiKey,
      "mapped client must NEVER reuse the env-default apiKey"
    ).not.toBe("ENV-DEFAULT-KEY")
  } finally {
    restoreEnv(snap)
  }
})

// =============================================================================
// 3. Mapped client + per-client key MISSING → THROWS (fail-closed). HEADLINE.
// =============================================================================
test("getCareFirstConfigForClient THROWS for a mapped client whose API key is missing (fail-closed)", () => {
  const snap = snapshotEnv()
  try {
    // ----- Arrange ----------------------------------------------------------
    setEnvDefaults()
    // Deliberately do NOT set CAREFIRST_API_KEY__TESTCODE. The env-default key
    // IS set — the guard must refuse to fall back to it.
    delete process.env.CAREFIRST_API_KEY__TESTCODE

    // ----- Act / Assert -----------------------------------------------------
    // Patient-routing integrity: better to block the handoff than register a
    // patient under the wrong CareFirst account. The message must name the
    // mis-configuration so the operator knows to contact an admin.
    expect(() =>
      getCareFirstConfigForClient({ carefirst_client_code: "TESTCODE" })
    ).toThrow(/not fully configured/i)
  } finally {
    restoreEnv(snap)
  }
})

// =============================================================================
// 4a. Plan/domain fallback to env when the mapped client leaves them null.
// =============================================================================
test("getCareFirstConfigForClient falls back to env plan/domain when the client leaves them null", () => {
  const snap = snapshotEnv()
  try {
    // ----- Arrange ----------------------------------------------------------
    setEnvDefaults()
    process.env.CAREFIRST_API_KEY__TESTCODE = "PER-CLIENT-KEY-TESTCODE"

    // ----- Act --------------------------------------------------------------
    const cfg = getCareFirstConfigForClient({
      carefirst_client_code: "TESTCODE",
      carefirst_plan_code: null,
      carefirst_api_domain: null,
    })

    // ----- Assert -----------------------------------------------------------
    expect(cfg.clientCode).toBe("TESTCODE")
    expect(cfg.apiKey).toBe("PER-CLIENT-KEY-TESTCODE")
    // Plan + domain fall back to the env defaults.
    expect(cfg.clientPlanCode).toBe("ENVPLAN")
    expect(cfg.apiDomain).toBe("env-default.carefirst.test")
  } finally {
    restoreEnv(snap)
  }
})

// =============================================================================
// 4b. Client-set plan/domain WIN over env.
// =============================================================================
test("getCareFirstConfigForClient prefers the client's own plan/domain over env", () => {
  const snap = snapshotEnv()
  try {
    // ----- Arrange ----------------------------------------------------------
    setEnvDefaults()
    process.env.CAREFIRST_API_KEY__TESTCODE = "PER-CLIENT-KEY-TESTCODE"

    // ----- Act --------------------------------------------------------------
    const cfg = getCareFirstConfigForClient({
      carefirst_client_code: "TESTCODE",
      carefirst_plan_code: "CLIENTPLAN",
      carefirst_api_domain: "client-domain.carefirst.test",
    })

    // ----- Assert -----------------------------------------------------------
    // The client's overrides win; env defaults are NOT used.
    expect(cfg.clientPlanCode).toBe("CLIENTPLAN")
    expect(cfg.apiDomain).toBe("client-domain.carefirst.test")
    expect(cfg.clientPlanCode).not.toBe("ENVPLAN")
    expect(cfg.apiDomain).not.toBe("env-default.carefirst.test")
  } finally {
    restoreEnv(snap)
  }
})

// =============================================================================
// 4c. A mapped client with a MALFORMED domain (and no usable fallback) throws.
//     Guards the assertValidApiDomain() reuse in the resolver.
// =============================================================================
test("getCareFirstConfigForClient throws on a malformed client API domain", () => {
  const snap = snapshotEnv()
  try {
    // ----- Arrange ----------------------------------------------------------
    setEnvDefaults()
    process.env.CAREFIRST_API_KEY__TESTCODE = "PER-CLIENT-KEY-TESTCODE"

    // ----- Act / Assert -----------------------------------------------------
    // "https://" has a scheme but no host — isValidApiDomain rejects it, so the
    // resolver's assertValidApiDomain throws with a "malformed" message naming
    // the client field (since the client supplied the bad value).
    expect(() =>
      getCareFirstConfigForClient({
        carefirst_client_code: "TESTCODE",
        carefirst_api_domain: "https://",
      })
    ).toThrow(/malformed|carefirst_api_domain/i)
  } finally {
    restoreEnv(snap)
  }
})

// =============================================================================
// 5. isValidApiDomain — accept/reject table.
// =============================================================================
test("isValidApiDomain accepts a bare host or full https URL and rejects host-less / garbage values", () => {
  // ----- Assert (table) -----------------------------------------------------
  // [value, expected]
  const cases: Array<[string, boolean]> = [
    // Accept: bare hostname (gets https:// prepended at call time).
    ["stage-patient.care-first.co.za", true],
    ["localhost:4747", true],
    // Accept: full http(s) URL with a non-empty host.
    ["https://api.carefirst.co.za", true],
    ["http://localhost:4747", true],
    // Reject: a scheme with no host.
    ["https://", false],
    ["http://", false],
    // Reject: empty.
    ["", false],
    // Reject: pure whitespace (no host once normalised).
    [" ", false],
  ]
  for (const [value, expected] of cases) {
    expect(
      isValidApiDomain(value),
      `isValidApiDomain(${JSON.stringify(value)})`
    ).toBe(expected)
  }
})
