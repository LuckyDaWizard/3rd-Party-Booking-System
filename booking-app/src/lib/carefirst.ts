// =============================================================================
// carefirst.ts
//
// Server-side helpers for the CareFirst Patient SSO handoff. After a booking
// is marked "Payment Complete", the nurse clicks "Start Consult", which POSTs
// the patient data to CareFirst Patient's auto-register endpoint. CareFirst
// returns a redirect URL that launches the virtual consultation.
//
// IMPORTANT: server-only. The API key must never reach the browser.
// =============================================================================

import { getAppUrl } from "./app-url"

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface CareFirstConfig {
  apiDomain: string
  apiKey: string
  clientCode: string
  clientPlanCode: string | null
  appUrl: string
}

export function getCareFirstConfig(): CareFirstConfig {
  const apiDomain = process.env.CAREFIRST_API_DOMAIN
  const apiKey = process.env.CAREFIRST_API_KEY
  const clientCode = process.env.CAREFIRST_CLIENT_CODE
  const clientPlanCode = process.env.CAREFIRST_CLIENT_PLAN_CODE || null
  const appUrl = getAppUrl()

  if (!apiDomain || !apiKey || !clientCode) {
    throw new Error(
      "Missing CareFirst env vars. Set CAREFIRST_API_DOMAIN, CAREFIRST_API_KEY, CAREFIRST_CLIENT_CODE."
    )
  }

  return { apiDomain, apiKey, clientCode, clientPlanCode, appUrl }
}

// ---------------------------------------------------------------------------
// Field mapping
//
// Transforms our booking record's field values to the formats CareFirst
// Patient expects.
// ---------------------------------------------------------------------------

const VALID_TITLES = [
  "MR",
  "MRS",
  "MS",
  "MISS",
  "MASTER",
  "DR",
  "PROF",
  "REV",
  "DS",
] as const
type CareFirstTitle = (typeof VALID_TITLES)[number]

export function mapTitle(raw: string | null): CareFirstTitle | null {
  if (!raw) return null
  const upper = raw.trim().toUpperCase()
  return (VALID_TITLES as readonly string[]).includes(upper)
    ? (upper as CareFirstTitle)
    : null
}

/** 0 = National ID, 1 = Passport, 2 = Other. */
export function mapIdNumberType(raw: string | null): 0 | 1 | 2 {
  if (!raw) return 2
  const lower = raw.trim().toLowerCase()
  if (lower.includes("national") || lower === "id" || lower === "sa id") return 0
  if (lower.includes("passport")) return 1
  return 2
}

/** M = Male, F = Female, O = Other, N = Not Specified. */
export function mapGender(raw: string | null): "M" | "F" | "O" | "N" {
  if (!raw) return "N"
  const c = raw.trim().charAt(0).toUpperCase()
  if (c === "M") return "M"
  if (c === "F") return "F"
  if (c === "O") return "O"
  return "N"
}

/** Returns 'za' | 'bw' | 'lso' | null. */
export function mapCountryCode(
  raw: string | null
): "za" | "bw" | "lso" | null {
  if (!raw) return null
  const v = raw.trim().toLowerCase()
  // Accept both ISO 2-letter codes and full country names.
  if (v === "za" || v === "south africa" || v === "rsa") return "za"
  if (v === "bw" || v === "botswana") return "bw"
  if (v === "lso" || v === "ls" || v === "lesotho") return "lso"
  return null
}

/** Ensures YYYY-MM-DD format. Returns null for invalid input. */
export function formatDateOfBirth(raw: string | null): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  // Already in YYYY-MM-DD format.
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  // Try parsing a Date and reformatting.
  const d = new Date(trimmed)
  if (isNaN(d.getTime())) return null
  const year = d.getFullYear().toString().padStart(4, "0")
  const month = (d.getMonth() + 1).toString().padStart(2, "0")
  const day = d.getDate().toString().padStart(2, "0")
  return `${year}-${month}-${day}`
}

// ---------------------------------------------------------------------------
// Build the SSO payload
//
// Uses the Postman-collection shape (nested userProfile), confirmed with
// CareFirst as the current format.
// ---------------------------------------------------------------------------

export interface BookingForHandoff {
  id: string
  email_address: string | null
  contact_number: string | null
  id_number: string | null
  id_type: string | null
  title: string | null
  first_names: string | null
  surname: string | null
  date_of_birth: string | null
  country_code: string | null
  nationality: string | null
  gender: string | null
  address: string | null
  suburb: string | null
  city: string | null
  province: string | null
  country: string | null
  postal_code: string | null
  // "Would you like to script this to another email address?" toggle + the
  // additional email value. Forwarded to CareFirst as user.additionalScriptEmail
  // so prescriptions can be delivered to a carer / family member / pharmacy.
  // Captured on patient-details step 3.
  script_to_another_email: boolean | null
  additional_email: string | null
  // Vitals captured on /create-booking/patient-metrics. Sent under user.vitals.
  // All strings on the row — BP is composite ("120/80"), the rest are numeric
  // values entered as text. We forward as strings to preserve exactly what was
  // captured; consumers can parse if they need numbers.
  blood_pressure: string | null
  glucose: string | null
  temperature: string | null
  oxygen_saturation: string | null
  heart_rate: string | null
  // Best-effort proxy for "when were vitals captured" — really the booking row's
  // last-modified time. Used as user.vitals.capturedAt.
  updated_at: string | null
}

/**
 * Vitals block sent under `user.vitals`. NOT defined in CareFirst's current
 * schema (neither the TypeScript interface nor the Postman example references
 * vitals) — we send it speculatively. CareFirst silently ignores unknown
 * fields today; when they extend their schema to consume it, no code change
 * is required on our side.
 *
 * Field values are strings to preserve the operator's input exactly:
 *   - bloodPressure is composite ("120/80")
 *   - the others are numeric values stored as text on the bookings row
 *
 * The whole block is omitted from the payload when every vital field is null
 * or empty (which is the case for skip_patient_metrics clients).
 */
export interface VitalsBlock {
  bloodPressure: string | null
  glucose: string | null
  temperature: string | null
  oxygenSaturation: string | null
  heartRate: string | null
  /**
   * Best-effort timestamp — the booking row's `updated_at`. NOT specifically
   * "when vitals were captured": metrics are usually the last update before
   * T&Cs, but `updated_at` is also bumped by terms acceptance, payment
   * confirmation, etc. Treat as "last known state of these readings".
   */
  capturedAt: string | null
}

export interface SsoAutoRegisterPayload {
  clientCode: string
  planCode: string | null
  uniqueReference: string
  user: {
    email: string
    cellNumber: string
    idNumber: string
    /**
     * Optional extra recipient for the prescription. Populated when the
     * patient ticked "script this to another email address" AND provided a
     * valid value. Sent as `null` when the toggle was No (or omitted entirely
     * if you'd prefer — currently we send `null` so you can distinguish
     * "patient declined" from "we never asked").
     *
     * Speculative — not in CareFirst's current schema. Safe to ignore.
     */
    additionalScriptEmail: string | null
    userProfile: {
      title: string | null
      firstName: string
      surname: string
      idNumberType: 0 | 1 | 2
      dateOfBirth: string | null
      countryCode: string | null
      nationality: string | null
      gender: "M" | "F" | "O" | "N"
      fullAddress: {
        address: string
        suburb?: string
        city: string
        province?: string
        country?: string
        postalCode?: string
      } | null
    }
    /** Speculative extension — see VitalsBlock. */
    vitals?: VitalsBlock
  }
  returnUrl?: string
}

/**
 * Normalises a string value: trims whitespace, treats empty string the same
 * as null. Returns null when the field wasn't captured (so the JSON sends
 * `null` rather than `""`, matching what the booking row actually means).
 */
function normaliseVital(raw: string | null): string | null {
  if (raw === null || raw === undefined) return null
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Resolve the additional script-delivery email. Three states on the row:
 *   - script_to_another_email = false      → patient declined; send null
 *   - script_to_another_email = true + blank email → toggle ON but no value;
 *     treat as missing, send null (we don't want to send "" downstream)
 *   - script_to_another_email = true + populated email → send the email
 *
 * Always returns a string-or-null so the JSON shape is stable and CareFirst
 * can distinguish "patient said no" (null + the toggle wasn't set anywhere
 * else) from "patient said yes here's the address" (the string).
 */
function resolveAdditionalScriptEmail(
  toggle: boolean | null,
  email: string | null
): string | null {
  if (toggle !== true) return null
  return normaliseVital(email)
}

/**
 * Build the vitals block — or undefined if every reading is missing, in
 * which case we omit the field entirely from the payload.
 */
function buildVitalsBlock(booking: BookingForHandoff): VitalsBlock | undefined {
  const bloodPressure = normaliseVital(booking.blood_pressure)
  const glucose = normaliseVital(booking.glucose)
  const temperature = normaliseVital(booking.temperature)
  const oxygenSaturation = normaliseVital(booking.oxygen_saturation)
  const heartRate = normaliseVital(booking.heart_rate)

  const anyCaptured =
    bloodPressure !== null ||
    glucose !== null ||
    temperature !== null ||
    oxygenSaturation !== null ||
    heartRate !== null
  if (!anyCaptured) return undefined

  return {
    bloodPressure,
    glucose,
    temperature,
    oxygenSaturation,
    heartRate,
    capturedAt: booking.updated_at,
  }
}

export function buildSsoPayload(
  config: CareFirstConfig,
  booking: BookingForHandoff
): SsoAutoRegisterPayload {
  const hasAddress = Boolean(booking.address && booking.city)
  const vitals = buildVitalsBlock(booking)

  return {
    clientCode: config.clientCode,
    planCode: config.clientPlanCode,
    uniqueReference: booking.id, // Booking ID as the unique reference.
    user: {
      email: booking.email_address ?? "",
      cellNumber: booking.contact_number ?? "",
      idNumber: booking.id_number ?? "",
      additionalScriptEmail: resolveAdditionalScriptEmail(
        booking.script_to_another_email,
        booking.additional_email
      ),
      userProfile: {
        title: mapTitle(booking.title),
        firstName: booking.first_names ?? "",
        surname: booking.surname ?? "",
        idNumberType: mapIdNumberType(booking.id_type),
        dateOfBirth: formatDateOfBirth(booking.date_of_birth),
        countryCode: mapCountryCode(booking.country_code),
        nationality: mapCountryCode(booking.nationality),
        gender: mapGender(booking.gender),
        fullAddress: hasAddress
          ? {
              address: booking.address ?? "",
              suburb: booking.suburb ?? undefined,
              city: booking.city ?? "",
              province: booking.province ?? undefined,
              country: booking.country ?? undefined,
              postalCode: booking.postal_code ?? undefined,
            }
          : null,
      },
      ...(vitals ? { vitals } : {}),
    },
    returnUrl: `${config.appUrl}/patient-history`,
  }
}

// ---------------------------------------------------------------------------
// Call CareFirst's auto-register endpoint
// ---------------------------------------------------------------------------

export interface SsoAutoRegisterResult {
  ok: boolean
  /** The URL to open in a new tab (the CareFirst session / redirect URL). */
  redirectUrl?: string
  /** External reference ID returned by CareFirst (if any). */
  externalReferenceId?: string
  /** Raw response body for logging / debugging. */
  rawResponse?: unknown
  /** Human-readable error for display + audit. */
  error?: string
  /** HTTP status code from the CareFirst call (undefined if network-level failure). */
  statusCode?: number
}

// Upper bound for a single CareFirst auto-register call. If CareFirst hangs
// (rather than failing fast with a 5xx), the nurse otherwise waits up to
// Node's default ~30s before seeing any feedback. Five seconds is well above
// CareFirst's normal response time (~300-800ms in staging) and still inside
// the operator's patience window.
const CAREFIRST_TIMEOUT_MS = 5000

function isAbortOrTimeout(err: unknown): boolean {
  if (!err || typeof err !== "object") return false
  const e = err as { name?: string; cause?: { name?: string } }
  if (e.name === "TimeoutError" || e.name === "AbortError") return true
  if (e.cause?.name === "TimeoutError" || e.cause?.name === "AbortError") return true
  return false
}

export async function callSsoAutoRegister(
  config: CareFirstConfig,
  payload: SsoAutoRegisterPayload
): Promise<SsoAutoRegisterResult> {
  const url = `https://${config.apiDomain}/api/external/client-sso/auto-register`

  let res: Response
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
      },
      body: JSON.stringify(payload),
      // AbortSignal.timeout fires a DOMException with name "TimeoutError"
      // (Node 18.16+) or "AbortError" on older runtimes. isAbortOrTimeout
      // below handles both shapes so the operator sees a specific
      // "didn't respond in time" message instead of a generic network error.
      signal: AbortSignal.timeout(CAREFIRST_TIMEOUT_MS),
    })
  } catch (err) {
    if (isAbortOrTimeout(err)) {
      return {
        ok: false,
        error: `CareFirst did not respond within ${
          CAREFIRST_TIMEOUT_MS / 1000
        } seconds. Please try again — if this persists, the service may be experiencing issues.`,
      }
    }
    return {
      ok: false,
      error: `Network error calling CareFirst: ${
        err instanceof Error ? err.message : String(err)
      }`,
    }
  }

  let body: unknown
  const rawText = await res.text()
  try {
    body = rawText ? JSON.parse(rawText) : null
  } catch {
    body = rawText
  }

  if (!res.ok) {
    // Upstream gateway errors usually indicate CareFirst's infrastructure
    // is down — operator-friendly message instead of "rejected the handoff",
    // which sounds like a data problem we caused.
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      return {
        ok: false,
        statusCode: res.status,
        error: `CareFirst service is currently unavailable (HTTP ${res.status}). Please try again in a few minutes.`,
        rawResponse: body,
      }
    }
    const errorMsg = extractErrorMessage(body) ?? `HTTP ${res.status}`
    return {
      ok: false,
      statusCode: res.status,
      error: `CareFirst rejected the handoff: ${errorMsg}`,
      rawResponse: body,
    }
  }

  // Success. Extract the redirect URL — we handle a few likely field shapes
  // since the exact contract hasn't been finalised. If none are found, we
  // still return ok=true but without a redirect.
  const redirectUrl = extractRedirectUrl(body)
  const externalReferenceId = extractExternalReferenceId(body)

  return {
    ok: true,
    statusCode: res.status,
    redirectUrl,
    externalReferenceId,
    rawResponse: body,
  }
}

function extractRedirectUrl(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined
  const obj = body as Record<string, unknown>
  const candidates = ["redirectUrl", "redirect_url", "url", "ssoUrl", "sso_url"]
  for (const key of candidates) {
    const v = obj[key]
    if (typeof v === "string" && v.trim()) return v.trim()
  }
  // Sometimes nested under data/result.
  for (const wrapper of ["data", "result"]) {
    const inner = obj[wrapper]
    if (inner && typeof inner === "object") {
      const found = extractRedirectUrl(inner)
      if (found) return found
    }
  }
  return undefined
}

function extractExternalReferenceId(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined
  const obj = body as Record<string, unknown>
  const candidates = [
    "referenceId",
    "reference_id",
    "patientId",
    "patient_id",
    "id",
    "sessionId",
    "session_id",
  ]
  for (const key of candidates) {
    const v = obj[key]
    if (typeof v === "string" && v.trim()) return v.trim()
    if (typeof v === "number") return String(v)
  }
  for (const wrapper of ["data", "result"]) {
    const inner = obj[wrapper]
    if (inner && typeof inner === "object") {
      const found = extractExternalReferenceId(inner)
      if (found) return found
    }
  }
  return undefined
}

function extractErrorMessage(body: unknown): string | undefined {
  if (!body) return undefined
  if (typeof body === "string") {
    // Non-JSON response (e.g. nginx HTML error page from an upstream
    // outage). Don't dump raw HTML into the operator's banner — fall
    // through so callSsoAutoRegister can use the HTTP status code to
    // produce a clean message.
    if (/<\s*html|<!DOCTYPE/i.test(body)) return undefined
    return body
  }
  if (typeof body !== "object") return undefined
  const obj = body as Record<string, unknown>
  // Key order matters — try the most user-facing first. CareFirst's actual
  // shape (observed in production): { result: false, displayMessage: "...",
  // errorMessage: "..." }. Both message keys hold the same human-readable
  // string. We also fall back to standard REST conventions (message,
  // error, detail, title) for older / future endpoints.
  for (const key of [
    "displayMessage",
    "errorMessage",
    "message",
    "error",
    "detail",
    "title",
  ]) {
    const v = obj[key]
    if (typeof v === "string" && v.trim()) return v.trim()
  }
  return undefined
}
