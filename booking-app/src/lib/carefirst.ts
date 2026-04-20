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
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://187.127.135.11:3000"

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
}

export interface SsoAutoRegisterPayload {
  clientCode: string
  planCode: string | null
  uniqueReference: string
  user: {
    email: string
    cellNumber: string
    idNumber: string
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
  }
  returnUrl?: string
}

export function buildSsoPayload(
  config: CareFirstConfig,
  booking: BookingForHandoff
): SsoAutoRegisterPayload {
  const hasAddress = Boolean(booking.address && booking.city)

  return {
    clientCode: config.clientCode,
    planCode: config.clientPlanCode,
    uniqueReference: booking.id, // Booking ID as the unique reference.
    user: {
      email: booking.email_address ?? "",
      cellNumber: booking.contact_number ?? "",
      idNumber: booking.id_number ?? "",
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
    })
  } catch (err) {
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
  if (typeof body === "string") return body
  if (typeof body !== "object") return undefined
  const obj = body as Record<string, unknown>
  for (const key of ["message", "error", "detail", "title"]) {
    const v = obj[key]
    if (typeof v === "string" && v.trim()) return v.trim()
  }
  return undefined
}
