/* eslint-disable no-console */
// =============================================================================
// tests/_helpers/payfast.ts
//
// PayFast test helpers — the test-side counterparts to src/lib/payfast.ts.
//
//  - signItn()                       — MD5 signs an ITN form body the same way
//                                      production's computeItnSignature() does
//  - postItnToApp()                  — POSTs a signed ITN to /api/payfast/notify
//  - PAYFAST_MOCK_URL                — base URL for the local mock server
//  - setPayfastMockMode()            — drive the mock's mode override
//  - resetPayfastMockMode()
//  - clearPayfastMockReceived()
//  - getPayfastMockReceived()
//  - getPayfastMockReceivedForBooking()
//
// The mock control helpers are forks of the CareFirst pattern in
// coupon-r0-happy-path.spec.ts — kept here from day one so future PayFast
// specs (C4 negative paths, C5 reconcile seeding) don't have to extract.
//
// SIGNATURE PARITY
// -----------------
// signItn() MUST match src/lib/payfast.ts:290-308 computeItnSignature()
// byte-for-byte. The PayFast ITN signature algorithm differs from the
// initiate-side one in two ways:
//   1. Empty-valued fields ARE included (as `key=`).
//   2. Values are NOT trimmed.
// The notify route rejects anything else as a definitive 400 "Invalid
// signature", which would surface here as a misleading test failure with no
// clue what went wrong. Read the production code, mirror it exactly. If
// production ever changes the algorithm, this helper changes in lockstep.
// =============================================================================

import crypto from "node:crypto"
import {
  type PayfastMockMode,
  type PayfastTransaction,
  type RecordedRequest,
} from "../_setup/payfast-mock-server"

// Re-export the mock types so specs only import from one path.
export type { PayfastMockMode, PayfastTransaction, RecordedRequest }

// ----- Mock control ---------------------------------------------------------

const MOCK_PORT = Number(process.env.PAYFAST_MOCK_PORT ?? 4748)
export const PAYFAST_MOCK_URL = `http://localhost:${MOCK_PORT}`

/** Reset the recorded-request buffer on the mock. */
export async function clearPayfastMockReceived(): Promise<void> {
  const res = await fetch(`${PAYFAST_MOCK_URL}/__received`, { method: "DELETE" })
  if (!res.ok) {
    throw new Error(
      `Failed to clear PayFast mock state: ${res.status}. Is the mock running on port ${MOCK_PORT}? (See playwright.config.ts.)`
    )
  }
}

/** Return every request the mock has recorded since the last clear. */
export async function getPayfastMockReceived(): Promise<RecordedRequest[]> {
  const res = await fetch(`${PAYFAST_MOCK_URL}/__received`)
  if (!res.ok) {
    throw new Error(
      `Failed to read PayFast mock state: ${res.status}. Is the mock running on port ${MOCK_PORT}?`
    )
  }
  return (await res.json()) as RecordedRequest[]
}

/**
 * Filter mock-received requests down to those whose form body carries
 * `m_payment_id` matching the given booking ID.
 *
 * The mock's `received` array is module-level and shared across workers, so
 * a bare getPayfastMockReceived() would race the other worker's
 * clear/append cycle. Every server-confirmation POST production sends
 * carries the booking's m_payment_id, so filtering on that gives each test
 * a per-test view of the mock without any test-correlation plumbing.
 */
export async function getPayfastMockReceivedForBooking(
  bookingId: string
): Promise<RecordedRequest[]> {
  const all = await getPayfastMockReceived()
  return all.filter((r) => {
    // Pin to the validate path so a future spec routing other request
    // shapes through the mock (e.g. /transactions/history in C5, or any
    // new introspection endpoint) can't accidentally satisfy this
    // per-booking filter and inflate the observed count. The path check
    // is the load-bearing one; m_payment_id filters within the path.
    if (r.path !== "/eng/query/validate") return false
    const body = r.body
    if (!body || typeof body !== "object") return false
    return (body as { m_payment_id?: string }).m_payment_id === bookingId
  })
}

/** Drive the mock's mode override. Reset via resetPayfastMockMode() in finally. */
export async function setPayfastMockMode(mode: PayfastMockMode): Promise<void> {
  const res = await fetch(`${PAYFAST_MOCK_URL}/__mode`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(mode),
  })
  if (!res.ok) {
    throw new Error(
      `Failed to set PayFast mock mode: ${res.status}. Is the mock running on port ${MOCK_PORT}?`
    )
  }
}

/** Reset the mock back to the default `valid` mode. */
export async function resetPayfastMockMode(): Promise<void> {
  const res = await fetch(`${PAYFAST_MOCK_URL}/__mode`, { method: "DELETE" })
  if (!res.ok) {
    throw new Error(
      `Failed to reset PayFast mock mode: ${res.status}. Is the mock running on port ${MOCK_PORT}?`
    )
  }
}

// ----- Transaction History seeding (C5) -------------------------------------

/**
 * Seed the mock's GET /transactions/history list. Each row is returned
 * verbatim inside `{ data: { response: [...] } }`; production's
 * findCompletedPayfastTransaction() filters by m_payment_id + status, so a
 * spec only needs to set the four fields it reads:
 *
 *   { m_payment_id, pf_payment_id, payment_status: "COMPLETE", amount_gross }
 *
 * MUST be cleared via clearMockTransactions() in a finally block — the
 * mock's list is module-level and shared across workers (forks the
 * setPayfastMockMode pattern).
 */
export async function setMockTransactions(
  txns: PayfastTransaction[]
): Promise<void> {
  const res = await fetch(`${PAYFAST_MOCK_URL}/__transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(txns),
  })
  if (!res.ok) {
    throw new Error(
      `Failed to seed PayFast mock transactions: ${res.status}. Is the mock running on port ${MOCK_PORT}?`
    )
  }
}

/** Clear the mock's seeded transaction list back to empty. */
export async function clearMockTransactions(): Promise<void> {
  const res = await fetch(`${PAYFAST_MOCK_URL}/__transactions`, {
    method: "DELETE",
  })
  if (!res.ok) {
    throw new Error(
      `Failed to clear PayFast mock transactions: ${res.status}. Is the mock running on port ${MOCK_PORT}?`
    )
  }
}

// ----- ITN signing ----------------------------------------------------------

/**
 * Compute the MD5 signature for a PayFast ITN form body. Mirrors
 * src/lib/payfast.ts:290-308 computeItnSignature() — same iteration order,
 * same URL-encoding (`encodeURIComponent` with `%20 → +`), same passphrase
 * append rule, no trimming, no empty-value filter.
 *
 * Pass `passphrase` explicitly if you want to test the without-passphrase
 * variant; omit it to default to PAYFAST_PASSPHRASE from the environment
 * (which matches what production validates against in non-test mode).
 *
 * The returned digest is lowercase hex.
 */
export function signItn(
  fields: Record<string, string>,
  passphrase?: string
): string {
  const parts: string[] = []
  for (const [key, value] of Object.entries(fields)) {
    if (key === "signature") continue
    parts.push(
      `${key}=${encodeURIComponent(value).replace(/%20/g, "+")}`
    )
  }
  let signatureString = parts.join("&")

  // Match production's "only append if non-empty" rule. `passphrase ?? env`
  // gives the test a way to pass an explicit empty string to opt out.
  const pp =
    passphrase !== undefined ? passphrase : process.env.PAYFAST_PASSPHRASE ?? ""
  if (pp) {
    signatureString += `&passphrase=${encodeURIComponent(pp).replace(/%20/g, "+")}`
  }
  return crypto.createHash("md5").update(signatureString).digest("hex")
}

// ----- ITN delivery ---------------------------------------------------------

/**
 * POST a signed ITN form body to /api/payfast/notify on `baseUrl`.
 *
 * The signature is appended as a trailing field so the body matches what
 * real PayFast sends — and so a future spec asserting on the raw body shape
 * sees the same wire format.
 *
 * Returns the raw Response so the test asserts on status + body. We use
 * the global fetch (Node 20+) rather than node-fetch — Playwright runs on
 * Node 20.
 */
export async function postItnToApp(
  baseUrl: string,
  fields: Record<string, string>,
  signature: string
): Promise<Response> {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(fields)) {
    params.append(key, value)
  }
  params.append("signature", signature)

  return fetch(`${baseUrl}/api/payfast/notify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      // The notify route falls back to "unknown" without an x-forwarded-for /
      // x-real-ip header, which validateItnSourceIp() then rejects. In
      // non-production it accepts private/localhost IPs, so we send 127.0.0.1
      // to land in that carve-out cleanly.
      "x-forwarded-for": "127.0.0.1",
    },
    body: params.toString(),
  })
}
