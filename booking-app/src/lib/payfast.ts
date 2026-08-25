// =============================================================================
// payfast.ts
//
// Server-side PayFast utilities: signature generation, ITN validation, URLs.
//
// IMPORTANT: server-only. Never import from "use client" components.
// The passphrase and merchant key must never reach the browser.
// =============================================================================

import crypto from "crypto"
import { getAppUrl } from "./app-url"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SANDBOX_PROCESS_URL = "https://sandbox.payfast.co.za/eng/process"
const PRODUCTION_PROCESS_URL = "https://www.payfast.co.za/eng/process"

const SANDBOX_VALIDATE_URL = "https://sandbox.payfast.co.za/eng/query/validate"
const PRODUCTION_VALIDATE_URL = "https://www.payfast.co.za/eng/query/validate"

/** PayFast hostnames whose IPs are valid ITN sources. */
const PAYFAST_HOSTS = [
  "www.payfast.co.za",
  "sandbox.payfast.co.za",
  "w1w.payfast.co.za",
  "w2w.payfast.co.za",
]

/** Fixed booking consultation fee. */
export const PAYMENT_AMOUNT = "325.00"

export const PAYMENT_ITEM_NAME = "CareFirst Consultation Booking"

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

export interface PayfastConfig {
  merchantId: string
  merchantKey: string
  passphrase: string
  testMode: boolean
  appUrl: string
}

export function getPayfastConfig(): PayfastConfig {
  const merchantId = process.env.PAYFAST_MERCHANT_ID
  const merchantKey = process.env.PAYFAST_MERCHANT_KEY
  const passphrase = process.env.PAYFAST_PASSPHRASE
  const testMode = process.env.PAYFAST_TEST_MODE === "true"
  const appUrl = getAppUrl()

  if (!merchantId || !merchantKey || !passphrase) {
    throw new Error(
      "Missing PayFast env vars. Set PAYFAST_MERCHANT_ID, PAYFAST_MERCHANT_KEY, PAYFAST_PASSPHRASE."
    )
  }

  // Validate the test-only URL overrides at boot, not at first call. These
  // env vars exist only to redirect the ITN server-confirmation POST and the
  // Transaction History GET at a Playwright mock; they should never be set
  // in production. When they ARE set (test runs, dev investigations), a
  // malformed value would otherwise produce confusing runtime errors deep in
  // the fetch stack. Mirrors the CareFirst pattern in `getCareFirstConfig()`.
  //
  // When both an override AND the `testMode` flag are set in a dev/test env,
  // the override wins for the validate URL — see `getValidateUrl()`. The
  // overrides themselves are gated on `NODE_ENV !== "production"` so a stale
  // env var leaking into prod is a no-op rather than a silent redirect.
  const validateOverride = process.env.PAYFAST_VALIDATE_URL_OVERRIDE?.trim()
  if (validateOverride) {
    try {
      const parsed = new URL(validateOverride)
      if (!parsed.host) throw new Error("no host")
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      throw new Error(
        `PAYFAST_VALIDATE_URL_OVERRIDE is set but malformed: ${reason}. Expected a full URL with scheme + host (e.g. http://localhost:4748/eng/query/validate).`
      )
    }
  }
  const apiBaseOverride = process.env.PAYFAST_API_BASE_OVERRIDE?.trim()
  if (apiBaseOverride) {
    try {
      const parsed = new URL(apiBaseOverride)
      if (!parsed.host) throw new Error("no host")
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      throw new Error(
        `PAYFAST_API_BASE_OVERRIDE is set but malformed: ${reason}. Expected a full URL with scheme + host (e.g. http://localhost:4748).`
      )
    }
  }

  return { merchantId, merchantKey, passphrase, testMode, appUrl }
}

export function getProcessUrl(testMode: boolean): string {
  return testMode ? SANDBOX_PROCESS_URL : PRODUCTION_PROCESS_URL
}

/**
 * Returns the URL used for the PayFast ITN server-confirmation POST (step 4
 * of ITN validation — `validateItnServerConfirmation`).
 *
 * Honours `PAYFAST_VALIDATE_URL_OVERRIDE` when set, so the Playwright suite
 * can redirect this server-side fetch at a local mock without touching the
 * production / sandbox endpoints. Read at CALL TIME (not at module load) so
 * `playwright.config.ts` webServer.env injection isn't bypassed by Node's
 * module-cache ordering.
 *
 * IMPORTANT: the override is gated on `NODE_ENV !== "production"` as a
 * defence-in-depth measure. If a stale env var ever leaks into a prod VPS
 * shell (sloppy `.bashrc`, env-file copy-paste, etc.) it silently no-ops
 * rather than redirecting real ITN traffic at localhost — which would
 * otherwise fail every confirmation and mark every payment as fraudulent.
 */
export function getValidateUrl(testMode: boolean): string {
  if (process.env.NODE_ENV !== "production") {
    const override = process.env.PAYFAST_VALIDATE_URL_OVERRIDE?.trim()
    if (override) return override
  }
  return testMode ? SANDBOX_VALIDATE_URL : PRODUCTION_VALIDATE_URL
}

/**
 * Returns the base URL for PayFast's Transaction History Query API. Defaults
 * to https://api.payfast.co.za but honours `PAYFAST_API_BASE_OVERRIDE` so
 * the Playwright suite can redirect reconcile-flow fetches at a local mock.
 * Read at CALL TIME (not at module load) so playwright.config.ts webServer.env
 * injection isn't bypassed by Node's module-cache ordering.
 *
 * Same `NODE_ENV !== "production"` gate as `getValidateUrl()` — see that
 * function's comment block for the rationale.
 */
function getPayfastApiBase(): string {
  if (process.env.NODE_ENV !== "production") {
    const override = process.env.PAYFAST_API_BASE_OVERRIDE?.trim()
    if (override) return override.replace(/\/+$/, "")
  }
  return PAYFAST_API_BASE
}

// ---------------------------------------------------------------------------
// Signature generation
// ---------------------------------------------------------------------------

/**
 * URL-encode a string the way PHP's `urlencode()` does — which is what PayFast
 * uses on their side to compute signatures over received values.
 *
 * JS `encodeURIComponent()` differs from PHP `urlencode()` for SIX characters:
 *   !  '  (  )  *  ~
 * encodeURIComponent leaves these untouched; PHP urlencode encodes them to
 * %21 %27 %28 %29 %2A %7E. If our signature uses bare `'` (e.g. in a name
 * like "O'Brien") but PayFast computes over `%27`, the signatures diverge and
 * PayFast returns "Generated signature does not match submitted signature."
 * Similarly, item_name with a coupon contains parentheses ("(coupon XYZ)").
 *
 * Also: spaces are `+` (the PayFast convention), not `%20`.
 *
 * Sandbox PayFast appears to tolerate the mismatch; LIVE PayFast rejects it.
 */
function phpUrlencode(s: string): string {
  return encodeURIComponent(s)
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A")
    .replace(/~/g, "%7E")
    .replace(/%20/g, "+")
}

/**
 * Generate an MD5 signature for PayFast form data.
 * Fields must be passed in the correct PayFast-specified order.
 * Empty values are excluded from the signature string.
 *
 * IMPORTANT: this function does NOT trim values — that happens upstream in
 * `buildPaymentData()` at the source, so the signed set is guaranteed equal
 * to what the form actually submits. Do NOT re-introduce a trim here; the
 * invariant is: signature bytes = phpUrlencode(each submitted value). PayFast
 * itself trims received values server-side before recomputing their signature
 * (a stray leading/trailing space in a buyer name would otherwise 400), which
 * is why the trim MUST happen before both signing AND submission.
 * The passphrase IS trimmed because PayFast looks it up server-side from its
 * dashboard, and a stray whitespace in our .env is a defensive concern on our
 * side only.
 */
export function generateSignature(
  data: Record<string, string>,
  passphrase?: string
): string {
  const params = Object.entries(data)
    .filter(([, v]) => v !== "")
    .map(([k, v]) => `${k}=${phpUrlencode(v)}`)
    .join("&")

  const signatureString = passphrase
    ? `${params}&passphrase=${phpUrlencode(passphrase.trim())}`
    : params

  return crypto.createHash("md5").update(signatureString).digest("hex")
}

// ---------------------------------------------------------------------------
// Build payment form data
// ---------------------------------------------------------------------------

export interface PaymentInitData {
  bookingId: string
  amount: string
  itemName: string
  buyerFirstName?: string
  buyerLastName?: string
  buyerEmail?: string
  /**
   * Optional per-client code (3–5 uppercase alnum). When present, the PayFast
   * m_payment_id is built as "<clientCode>-<bookingId>" so the merchant
   * dashboard / settlement reports are human-readable. Absent/empty → the
   * m_payment_id falls back to the bare bookingId (legacy behaviour). Never
   * hard-error a payment over a missing prefix.
   */
  clientCode?: string
}

/**
 * Recover the booking UUID from a PayFast m_payment_id, accepting BOTH the new
 * prefixed format and the legacy bare-UUID format.
 *
 * A client code is 3–5 uppercase letters/digits followed by a hyphen, so:
 *   - "LCH-a1b2c3d4-89ab-..."  → prefix "LCH" matches → strip to "a1b2c3d4-89ab-..."
 *   - "a1b2c3d4-89ab-..."      → first segment is 8 hex chars, does NOT match the
 *                                {3,5} prefix → returned UNCHANGED.
 *
 * The regex is anchored at the start AND requires a hyphen immediately after a
 * 3–5 char run, so a bare UUID's 8-char first segment can never be mistaken for
 * a code. Only the FIRST hyphen is consumed (the UUID itself contains hyphens).
 */
export function stripBookingId(ref: string): string {
  if (!ref) return ref
  if (/^[A-Z0-9]{3,5}-/.test(ref)) {
    return ref.slice(ref.indexOf("-") + 1)
  }
  return ref
}

/**
 * Build the ordered PayFast form field object ready for signature + submission.
 */
export function buildPaymentData(
  config: PayfastConfig,
  payment: PaymentInitData
): Record<string, string> {
  const { merchantId, merchantKey, appUrl } = config

  // Fields MUST be in PayFast's required order.
  const data: Record<string, string> = {}

  // Trim ALL string values before assignment. Rationale: PayFast trims
  // received values on their side before recomputing the signature, so we
  // must sign — AND submit — trimmed values, otherwise a leading/trailing
  // space in ANY field (buyer name pasted with a stray space, email, etc.)
  // makes our signature disagree with PayFast's on the received value. This
  // was the root cause of a Local Choice booking whose first_names="Test "
  // (trailing space) 400'd with "Generated signature does not match
  // submitted signature." Trimming at the source (here) makes signature +
  // submission use the same value with no divergence possible.
  const t = (s: string | undefined): string => (s ?? "").trim()

  // Merchant details
  data.merchant_id = t(merchantId)
  data.merchant_key = t(merchantKey)

  // URLs (already server-computed, but trim as defense-in-depth)
  data.return_url = t(`${appUrl}/create-booking/payment/success?bookingId=${payment.bookingId}`)
  data.cancel_url = t(`${appUrl}/create-booking/payment/failed?bookingId=${payment.bookingId}`)
  data.notify_url = t(`${appUrl}/api/payfast/notify`)

  // Buyer info (optional but helpful) — trim to strip whitespace typed into
  // the patient-details form (PayFast trims on receipt; unsync = signature 400).
  if (t(payment.buyerFirstName)) data.name_first = t(payment.buyerFirstName)
  if (t(payment.buyerLastName)) data.name_last = t(payment.buyerLastName)
  if (t(payment.buyerEmail)) data.email_address = t(payment.buyerEmail)

  // Transaction details. Prefix m_payment_id with the client code when one
  // exists so the PayFast dashboard / settlement reports are human-readable.
  // Fall back to the bare booking UUID when there's no code — both PayFast
  // confirmation paths (ITN notify + reconcile) recover the UUID via
  // stripBookingId, so a missing prefix never blocks a payment.
  const clientCode = t(payment.clientCode)
  data.m_payment_id = clientCode
    ? `${clientCode}-${t(payment.bookingId)}`
    : t(payment.bookingId)
  data.amount = t(payment.amount)
  data.item_name = t(payment.itemName)

  return data
}

// ---------------------------------------------------------------------------
// ITN (Instant Transaction Notification) validation
// ---------------------------------------------------------------------------

/**
 * Step 1: Validate the ITN signature.
 *
 * Recompute the signature from the POST fields (excluding 'signature') and
 * compare with the received signature.
 *
 * IMPORTANT: PayFast's ITN signature algorithm DIFFERS from the initiate-side
 * signature in one subtle way: empty-valued fields are INCLUDED in the ITN
 * signature string (as `key=`), whereas the initiate side filters them out.
 * (See PayFast's official PHP sample in the ITN integration docs.) Neither
 * side trims here — the ITN body arrives from PayFast already server-trimmed,
 * and the outbound `generateSignature` receives pre-trimmed data from
 * `buildPaymentData`.
 *
 * We therefore compute the signature here directly rather than delegating to
 * generateSignature() which filters empty values.
 */
export function validateItnSignature(
  postData: Record<string, string>,
  passphrase?: string
): boolean {
  const receivedSignature = postData.signature
  if (!receivedSignature) return false

  const computed = computeItnSignature(postData, passphrase)
  return constantTimeEqualsHex(computed, receivedSignature)
}

/**
 * Constant-time comparison for hex strings (e.g. MD5 digests). Prevents
 * timing side-channel attacks that could infer the correct signature
 * byte-by-byte by measuring response time on failed validations.
 *
 * Returns false if lengths differ or hex is malformed (Buffer.from's hex
 * parser silently truncates invalid input, so we must guard against
 * mismatched buffer lengths explicitly).
 */
function constantTimeEqualsHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  try {
    const bufA = Buffer.from(a, "hex")
    const bufB = Buffer.from(b, "hex")
    // Buffer.from("", "hex") succeeds but yields length 0 — so an empty or
    // odd-length string slips through. Reject any case where the hex decode
    // lost data.
    if (bufA.length === 0 || bufA.length !== bufB.length) return false
    return crypto.timingSafeEqual(bufA, bufB)
  } catch {
    return false
  }
}

/**
 * PayFast ITN-specific signature computation. Mirrors the PHP sample in the
 * official PayFast ITN integration documentation:
 *
 *   foreach ($pfData as $key => $val) {
 *     if ($key !== 'signature') {
 *       $pfOutput .= $key . '=' . urlencode($val) . '&';
 *     }
 *   }
 *   $pfOutput = substr($pfOutput, 0, -1);
 *   if (!empty($passPhrase)) {
 *     $pfOutput .= '&passphrase=' . urlencode($passPhrase);
 *   }
 *   return md5($pfOutput);
 */
function computeItnSignature(
  postData: Record<string, string>,
  passphrase?: string
): string {
  const parts: string[] = []
  for (const [key, value] of Object.entries(postData)) {
    if (key === "signature") continue
    // Do NOT filter empties and do NOT trim — PayFast includes empty fields
    // and uses the raw value in their signature calculation. URL-encoding
    // must mirror PHP urlencode() (see phpUrlencode above), otherwise values
    // containing !'()*~ produce mismatched signatures.
    parts.push(`${key}=${phpUrlencode(value)}`)
  }
  let signatureString = parts.join("&")
  if (passphrase) {
    signatureString += `&passphrase=${phpUrlencode(passphrase)}`
  }
  return crypto.createHash("md5").update(signatureString).digest("hex")
}

/**
 * Step 2: Validate the source IP against known PayFast IPs.
 *
 * Fails CLOSED in production: if the IP can't be verified (DNS failure,
 * missing module, empty resolution), the ITN is rejected. An attacker
 * spoofing a request will never bypass validation.
 *
 * In non-production (NODE_ENV !== "production"), private/localhost IPs are
 * accepted so that local dev loops and sandbox tests (where there's no
 * real PayFast routing) can work.
 */
export async function validateItnSourceIp(ip: string): Promise<boolean> {
  // Unknown or missing IP — reject.
  if (!ip || ip === "unknown") {
    console.error("[PayFast ITN] Source IP missing — rejecting")
    return false
  }

  const isProduction = process.env.NODE_ENV === "production"

  // In non-production only, allow private/localhost IPs so devs can
  // hit the endpoint from localhost or a Docker internal network.
  // In production, these addresses should never appear as the ITN source.
  if (!isProduction) {
    const isPrivate =
      ip === "127.0.0.1" ||
      ip === "::1" ||
      ip.startsWith("10.") ||
      ip.startsWith("172.") ||
      ip.startsWith("192.168.")
    if (isPrivate) {
      console.warn(
        `[PayFast ITN] Accepting private/localhost source IP ${ip} — non-production mode`
      )
      return true
    }
  }

  // Resolve PayFast's hostnames to their current IPs and check ours is one.
  let validIps: Set<string>
  try {
    const dns = await import("dns")
    const { promisify } = await import("util")
    const resolve4 = promisify(dns.resolve4)

    validIps = new Set<string>()
    for (const host of PAYFAST_HOSTS) {
      try {
        const ips = await resolve4(host)
        for (const resolvedIp of ips) {
          validIps.add(resolvedIp)
        }
      } catch (err) {
        // DNS resolution for one host failed — try the others.
        console.warn(
          `[PayFast ITN] DNS lookup failed for ${host}:`,
          err instanceof Error ? err.message : String(err)
        )
      }
    }
  } catch (err) {
    // Node's `dns` module itself couldn't be loaded. This should never happen
    // at runtime, but if it does we fail closed — better to reject a genuine
    // ITN (PayFast will retry) than accept a spoofed one.
    console.error(
      "[PayFast ITN] Could not load DNS module — failing closed:",
      err
    )
    return false
  }

  // If DNS returned nothing, fail closed — we can't verify, so we reject.
  // PayFast will retry on non-2xx, which gives DNS time to recover.
  if (validIps.size === 0) {
    console.error(
      "[PayFast ITN] No valid IPs resolved for any PayFast host — failing closed"
    )
    return false
  }

  const allowed = validIps.has(ip)
  if (!allowed) {
    console.error(
      `[PayFast ITN] Source IP ${ip} not in PayFast allowlist (${validIps.size} known IPs)`
    )
  }
  return allowed
}

/**
 * Step 3: Validate the payment amount matches what we expect.
 */
export function validateItnAmount(
  receivedAmount: string,
  expectedAmount: string
): boolean {
  const received = parseFloat(receivedAmount)
  const expected = parseFloat(expectedAmount)
  return Math.abs(received - expected) < 0.01
}

// Abort the ITN server-confirmation POST after this many ms. PayFast's
// /eng/query/validate normally answers in well under a second; without a
// timeout a hung endpoint would block the ITN handler for Node's ~30s default
// (or longer), holding the request open and starving the single-vCPU box.
// PayFast retries on any non-2xx, so a fast 502 is strictly better than a
// stuck request. Mirrors CAREFIRST_TIMEOUT_MS on the SSO call (carefirst.ts).
const PAYFAST_CONFIRM_TIMEOUT_MS = 5000

/**
 * Step 4: Server confirmation — POST back to PayFast to verify the ITN.
 *
 * Bounded by PAYFAST_CONFIRM_TIMEOUT_MS: AbortSignal.timeout fires a
 * DOMException ("TimeoutError" on Node 18.16+, "AbortError" older) which the
 * catch below swallows into a `false` return — the notify route then maps
 * that to a transient 502 and PayFast retries. No human is on this path
 * (server-to-server), so we don't need a distinct timeout message the way the
 * CareFirst SSO call does.
 */
export async function validateItnServerConfirmation(
  postData: Record<string, string>,
  testMode: boolean
): Promise<boolean> {
  const validateUrl = getValidateUrl(testMode)

  // Build the parameter string (excluding signature)
  const params = Object.entries(postData)
    .filter(([key]) => key !== "signature")
    .map(
      ([k, v]) =>
        `${k}=${encodeURIComponent(v.trim()).replace(/%20/g, "+")}`
    )
    .join("&")

  try {
    const res = await fetch(validateUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
      signal: AbortSignal.timeout(PAYFAST_CONFIRM_TIMEOUT_MS),
    })

    const text = await res.text()
    return text.trim() === "VALID"
  } catch (err) {
    console.error("PayFast server confirmation failed:", err)
    return false
  }
}

// ---------------------------------------------------------------------------
// Transaction History Query API
//
// When PayFast's ITN fails to reach us (network blips, brief outages, the
// app restarting mid-callback, firewall hiccups at either end), we can poll
// PayFast's Transaction History API instead to reconcile payment status.
// This is the "pull" model — the opposite of ITN's "push" model.
//
// API docs: https://developers.payfast.co.za/docs#transaction_history
//
// Endpoint: GET https://api.payfast.co.za/transactions/history
// Auth: merchant-id + signature headers
// Sandbox vs prod: same URL — sandbox behaviour depends on merchant-id.
// ---------------------------------------------------------------------------

const PAYFAST_API_BASE = "https://api.payfast.co.za"

export type PayfastPaymentStatus =
  | "COMPLETE"
  | "FAILED"
  | "PENDING"
  | "CANCELLED"
  | string

export interface PayfastTransaction {
  m_payment_id?: string
  pf_payment_id?: string
  amount_gross?: number | string
  amount_fee?: number | string
  amount_net?: number | string
  payment_status?: PayfastPaymentStatus
  // Sandbox/prod may return different shapes — we keep this permissive.
  [key: string]: unknown
}

interface QueryHeaders {
  "merchant-id": string
  version: "v1"
  timestamp: string
}

/** PayFast expects timestamp like `2026-04-20T12:00:00+02:00`. */
function buildPayfastTimestamp(): string {
  // Shift to SAST ONCE and derive every component (date AND time) from the
  // shifted instant. The previous version took the date parts from UTC but
  // the time parts from the shifted clock, so between 22:00 and 24:00 UTC
  // the stamp carried yesterday's date with tomorrow's time.
  const sastDate = new Date(Date.now() + 2 * 60 * 60 * 1000)
  const pad = (n: number) => n.toString().padStart(2, "0")
  const year = sastDate.getUTCFullYear()
  const month = pad(sastDate.getUTCMonth() + 1)
  const day = pad(sastDate.getUTCDate())
  const hours = pad(sastDate.getUTCHours())
  const minutes = pad(sastDate.getUTCMinutes())
  const seconds = pad(sastDate.getUTCSeconds())
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}+02:00`
}

/**
 * Build the signature required for PayFast's Transaction History API.
 *
 * Rule: take all headers (merchant-id, version, timestamp), all query
 * params, AND the passphrase, merge into ONE object, sort alphabetically by
 * key, URL-encode values (spaces as +), join as k=v&k=v, MD5.
 *
 * ⚠️ The passphrase participates in the ALPHABETICAL SORT — this is the REST
 * API convention and differs from the ITN/process signatures, where the
 * passphrase is appended last. The original implementation appended it here
 * too, which the live API rejects with 401 "Merchant authorization failed" —
 * the same 401 long attributed to a sandbox quirk (B6). Verified empirically
 * against the live API on 2026-08-25: sorted → 200, appended → 401.
 */
function buildQueryApiSignature(
  headers: QueryHeaders,
  queryParams: Record<string, string>,
  passphrase: string
): string {
  const combined: Record<string, string> = {
    ...headers,
    ...queryParams,
    passphrase,
  }

  const sortedKeys = Object.keys(combined).sort()
  const encoded = sortedKeys
    .map(
      (k) =>
        `${k}=${encodeURIComponent(combined[k].trim()).replace(/%20/g, "+")}`
    )
    .join("&")

  return crypto.createHash("md5").update(encoded).digest("hex")
}

/**
 * Fetch the merchant's transaction history for a given date range.
 * Returns an array of transactions (may be empty). Throws on non-2xx or
 * parse failure — caller should handle.
 */
export async function fetchPayfastTransactions(
  config: PayfastConfig,
  opts: { startDate: string; endDate?: string }
): Promise<PayfastTransaction[]> {
  const headers: QueryHeaders = {
    "merchant-id": config.merchantId,
    version: "v1",
    timestamp: buildPayfastTimestamp(),
  }

  const queryParams: Record<string, string> = {
    start_date: opts.startDate,
  }
  if (opts.endDate) queryParams.end_date = opts.endDate

  const signature = buildQueryApiSignature(
    headers,
    queryParams,
    config.passphrase
  )

  const qs = Object.entries(queryParams)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&")

  const url = `${getPayfastApiBase()}/transactions/history?${qs}`

  const res = await fetch(url, {
    method: "GET",
    headers: {
      ...headers,
      signature,
      accept: "application/json",
    },
  })

  const text = await res.text()

  if (!res.ok) {
    throw new Error(
      `PayFast Query API returned ${res.status}: ${text.slice(0, 500)}`
    )
  }

  // The LIVE API returns CSV (despite an application/json accept header):
  //   Date,Type,Sign,...,"M Payment ID","PF Payment ID",...
  // The Playwright mock (and possibly other environments) returns JSON —
  // either a top-level array or {data: {response: [...]}}. Try JSON first,
  // fall back to CSV; only give up when it's neither.
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return parseTransactionHistoryCsv(text)
  }

  const transactions = extractTransactionsFromResponse(body)
  return transactions
}

/**
 * Parse the live Transaction History CSV into PayfastTransaction rows.
 *
 * Observed live format (2026-08-25):
 *   Date,Type,Sign,Party,Name,Description,Currency,"Funding Type",
 *   "Batch ID",Gross,Fee,Net,Balance,"M Payment ID","PF Payment ID",...
 * - Quoted fields may contain commas (amounts use thousands separators:
 *   `"2,800.00"`), so a naive split(",") is not safe.
 * - Incoming payments have Type=FUNDS_RECEIVED and Sign=CREDIT; those map
 *   to payment_status "COMPLETE" for the reconcile matcher. Everything
 *   else (PAYOUT, fees, reversals) is passed through with its raw Type so
 *   it can never satisfy a COMPLETE match.
 * - Amounts keep their string form minus the thousands separators so the
 *   existing Rand-string comparisons work unchanged.
 *
 * Exported for direct unit coverage (tests/payfast-csv-lib.spec.ts).
 */
export function parseTransactionHistoryCsv(text: string): PayfastTransaction[] {
  const records = splitCsvRecords(text)
  if (records.length === 0) return []

  const header = records[0]
  if (!header.includes("M Payment ID")) {
    throw new Error(
      `PayFast Query API returned unrecognised body: ${text.slice(0, 200)}`
    )
  }
  if (records.length < 2) return []

  const col = (row: string[], name: string): string => {
    const i = header.indexOf(name)
    return i >= 0 ? (row[i] ?? "").trim() : ""
  }

  return records.slice(1).map((row) => {
    const type = col(row, "Type").toUpperCase()
    const sign = col(row, "Sign").toUpperCase()
    return {
      m_payment_id: col(row, "M Payment ID"),
      pf_payment_id: col(row, "PF Payment ID"),
      amount_gross: col(row, "Gross").replace(/,/g, ""),
      amount_fee: col(row, "Fee").replace(/,/g, ""),
      amount_net: col(row, "Net").replace(/,/g, ""),
      payment_status:
        type === "FUNDS_RECEIVED" && sign === "CREDIT" ? "COMPLETE" : type,
      // Extra ledger context the matcher uses for its guards. JSON-shaped
      // responses (the Playwright mock) simply won't carry these keys.
      sign,
      currency: col(row, "Currency").toUpperCase(),
      date: col(row, "Date"),
    }
  })
}

/**
 * Tokenise a whole CSV document into records of fields, honouring
 * double-quoted fields ("" = escaped quote) INCLUDING quoted commas and
 * quoted newlines — a newline inside a quoted Description must not split
 * the record. Blank records (trailing newlines) are dropped.
 */
function splitCsvRecords(text: string): string[][] {
  const records: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false
  let sawAny = false

  const endField = () => {
    row.push(field)
    field = ""
  }
  const endRecord = () => {
    endField()
    if (row.length > 1 || row[0].trim() !== "") records.push(row)
    row = []
    sawAny = false
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
      sawAny = true
    } else if (ch === ",") {
      endField()
      sawAny = true
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++
      if (sawAny || field.trim() !== "") endRecord()
      else field = ""
    } else {
      field += ch
      sawAny = true
    }
  }
  if (sawAny || field.trim() !== "") endRecord()
  return records
}

function extractTransactionsFromResponse(body: unknown): PayfastTransaction[] {
  if (!body) return []
  if (Array.isArray(body)) return body as PayfastTransaction[]
  if (typeof body !== "object") return []
  const obj = body as Record<string, unknown>

  // Known shapes: {data: {response: [...]}}, {data: [...]}, {response: [...]}
  for (const key of ["response", "data", "result", "transactions"]) {
    const v = obj[key]
    if (Array.isArray(v)) return v as PayfastTransaction[]
    if (v && typeof v === "object") {
      const nested = extractTransactionsFromResponse(v)
      if (nested.length > 0) return nested
    }
  }
  return []
}

/**
 * Check if a specific booking has been paid according to PayFast's records.
 * Returns the matching transaction (if found and COMPLETE) or null.
 *
 * Looks up transactions from `lookbackDays` ago through today, then filters
 * by m_payment_id (our booking id) and status == "COMPLETE".
 */
export async function findCompletedPayfastTransaction(
  config: PayfastConfig,
  bookingId: string,
  lookbackDays: number = 2
): Promise<PayfastTransaction | null> {
  const now = new Date()
  const past = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000)
  const pad = (n: number) => n.toString().padStart(2, "0")
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

  // NOTE (2026-08-25, observed live): the API accepts start_date/end_date
  // (they must be present AND in the signature or it 401s) but does not
  // appear to actually filter by them — probes with disjoint ranges returned
  // identical row sets. Don't rely on the window for correctness: the
  // m_payment_id match below is what scopes the result to this booking.
  const transactions = await fetchPayfastTransactions(config, {
    startDate: fmt(past),
    endDate: fmt(now),
  })

  const windowStart = past.getTime() - 24 * 60 * 60 * 1000 // 1-day slack
  return selectCompletedTransaction(transactions, bookingId, windowStart)
}

/**
 * Pure matching core for reconcile, split out for direct unit coverage
 * (tests/payfast-csv-lib.spec.ts). Given the full (unfiltered) ledger,
 * return the transaction that proves `bookingId` was paid, or null.
 */
export function selectCompletedTransaction(
  transactions: PayfastTransaction[],
  bookingId: string,
  windowStart: number
): PayfastTransaction | null {
  // All ledger rows for THIS booking. m_payment_id may be prefixed
  // ("<CODE>-<uuid>") or a legacy bare UUID — strip any recognised code
  // prefix before comparing to our booking id.
  const forBooking = transactions.filter(
    (t) => stripBookingId(String(t.m_payment_id ?? "").trim()) === bookingId
  )

  // Reversal guard: the CSV is an append-only ledger, so a refund or
  // chargeback is a SEPARATE row alongside the original credit — the credit
  // row alone would keep matching as COMPLETE forever. If ANY row for this
  // booking is a debit or a refund-ish type, fail closed (booking stays
  // unpaid; the manual PIN-confirm path remains available).
  const negated = forBooking.some((t) => {
    const sign = String(t.sign ?? "").trim().toUpperCase()
    const status = String(t.payment_status ?? "").trim().toUpperCase()
    return sign === "DEBIT" || /REFUND|REVERS|CHARGEBACK/.test(status)
  })
  if (negated) return null

  const match = forBooking.find((t) => {
    const status = String(t.payment_status ?? "").trim().toUpperCase()
    if (status !== "COMPLETE") return false

    // Currency guard: a non-ZAR amount must never satisfy the Rand-string
    // amount check downstream. Rows without a currency (the JSON mock shape)
    // pass through — the mock predates this field.
    const currency = String(t.currency ?? "").trim().toUpperCase()
    if (currency && currency !== "ZAR") return false

    // Client-side lookback: the API ignores start_date/end_date (see note
    // above), so enforce the window here. Rows without a parseable date
    // (the JSON mock shape) pass through.
    const rawDate = String(t.date ?? "").trim()
    if (rawDate) {
      // Live format "2026-08-20 11:54:59" in SAST.
      const parsed = Date.parse(rawDate.replace(" ", "T") + "+02:00")
      if (!Number.isNaN(parsed) && parsed < windowStart) return false
    }
    return true
  })

  return match ?? null
}
