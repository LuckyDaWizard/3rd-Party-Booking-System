// =============================================================================
// sentry-shared.ts
//
// Sentry options + POPIA scrubbing shared by the client, server and edge
// configs (instrumentation-client.ts, sentry.server.config.ts,
// sentry.edge.config.ts). Keep every privacy rule HERE so the three runtimes
// can't drift apart.
//
// What leaves the app (and what doesn't):
//   - dataCollection (below) turns off SDK collection of bodies, cookies,
//     headers, query params, user info and stack-frame variables
//   - request bodies, cookies, query strings and non-allowlisted headers are
//     stripped from every event
//   - query strings are stripped from EVERY URL we can reach — breadcrumbs,
//     span descriptions, span attributes. Supabase/PostgREST puts its filters
//     in the query string (?email=eq.x, ?patient_name=ilike.*y*), so a bare
//     fetch breadcrumb would otherwise leak patient data.
//   - free text (messages, exception values, breadcrumb messages, extra) is
//     passed through redactText(): SA ID numbers, phone numbers, emails and
//     PIN / code values are masked. DB errors echo values back
//     ("duplicate key (email)=(x)") and some server logs include emails.
//
// Known limit: a regex can't recognise a person's NAME. The rule for code is
// therefore: never pass booking / patient / user objects to Sentry
// (captureException extras, setContext, span attributes). IDs only.
// =============================================================================

import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs"
// Not re-exported by @sentry/nextjs v11; type-only imports from its core dep.
import type { DataCollection, Options, StreamedSpanJSON } from "@sentry/core"

export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN
export const SENTRY_ENVIRONMENT = process.env.NEXT_PUBLIC_APP_ENV ?? "development"

/** Request headers Sentry may record. Everything else (cookies, auth, CSRF,
 *  referer — which carries query strings) is never collected. */
const SAFE_HEADERS = ["user-agent", "content-type", "accept"]

/**
 * What the SDK itself collects. In v11 `sendDefaultPii` no longer exists —
 * this object is the privacy switch, and its DEFAULTS COLLECT EVERYTHING
 * (request/response bodies, cookies, headers, query params, user IP, stack
 * frame local variables). Everything is off except a minimal header allowlist.
 */
const DATA_COLLECTION: DataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: { request: { allow: SAFE_HEADERS }, response: false },
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
}

/** Options common to every runtime's Sentry.init. `satisfies` makes tsc
 *  reject options the SDK doesn't know (how `sendDefaultPii` slipped by). */
export const baseSentryOptions = {
  dsn: SENTRY_DSN,
  // No DSN (e.g. Playwright runs, which blank it) → SDK stays fully off.
  enabled: Boolean(SENTRY_DSN),
  environment: SENTRY_ENVIRONMENT,
  dataCollection: DATA_COLLECTION,
  tracesSampleRate: SENTRY_ENVIRONMENT === "production" ? 0.1 : 1.0,
  beforeSend: scrubEvent,
  // v11 streams spans by default (traceLifecycle: "stream"), so span data is
  // scrubbed here — beforeSendTransaction is never called in that mode.
  beforeSendSpan: scrubSpan,
  beforeBreadcrumb: scrubBreadcrumb,
} satisfies Options

// ---------------------------------------------------------------------------
// Text redaction
// ---------------------------------------------------------------------------

const REDACTIONS: Array<[RegExp, string]> = [
  // Emails first — includes the synthetic sign-in address pin-<PIN>@carefirst.local.
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]"],
  // South African ID number: 13 digits, optionally grouped 6-4-3
  // (8001015009087, 800101 5009 087). Side effect: 13-digit epoch-ms
  // timestamps in free text are masked too — accepted.
  [/(?<!\d)\d{6}\s?\d{4}\s?\d{3}(?!\d)/g, "[id-number]"],
  // E.164 / international (+27 82 123 4567, +27821234567, other +CC numbers).
  [/\+\d[\d\s-]{8,16}\d/g, "[phone]"],
  // SA number written without the "+" (27821234567).
  [/(?<!\d)27\d{9}(?!\d)/g, "[phone]"],
  // Local SA formats: 0821234567, 082 123 4567, 011-123-4567, (082) 123 4567,
  // 082 123 45 67.
  [/\(?(?<!\d)0\d{2}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}(?!\d)/g, "[phone]"],
  // A 6-digit PIN / reset code next to a label that says so.
  [/\b(pin|code|otp)(\W{0,3})\d{6}\b/gi, "$1$2[redacted]"],
]

export function redactText(text: string): string {
  let out = text
  for (const [pattern, replacement] of REDACTIONS) {
    out = out.replace(pattern, replacement)
  }
  return out
}

/** Drop the query string (and, for URLs/paths, the fragment). A "#" in
 *  anything else is left alone so UI span names like "button#save" survive. */
export function stripQuery(url: string): string {
  const urlLike = url.includes("://") || url.startsWith("/") || /^[A-Z]+ /.test(url)
  const cut = url.search(urlLike ? /[?#]/ : /\?/)
  return cut === -1 ? url : url.slice(0, cut)
}

/** Redact every string inside a plain JSON-ish value (depth-limited). */
function redactDeep(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return redactText(value)
  if (depth > 6 || value === null || typeof value !== "object") return value
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, depth + 1))
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = redactDeep(v, depth + 1)
  }
  return out
}

// URL-carrying keys used by Sentry's fetch/http/navigation instrumentation
// on breadcrumbs and spans (old + OpenTelemetry semantic-convention names).
const URL_KEYS = ["url", "from", "to", "http.url", "url.full", "http.target", "url.path"]
const QUERY_KEYS = ["http.query", "url.query", "http.fragment", "url.fragment"]

function scrubUrlData(data: Record<string, unknown> | undefined): void {
  if (!data) return
  for (const key of URL_KEYS) {
    if (typeof data[key] === "string") data[key] = stripQuery(data[key] as string)
  }
  for (const key of QUERY_KEYS) delete data[key]
}

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

const SAFE_HEADER_SET = new Set(SAFE_HEADERS)

function scrubRequest(event: ErrorEvent): void {
  const req = event.request
  if (!req) return
  delete req.data
  delete req.cookies
  delete req.query_string
  if (req.url) req.url = stripQuery(req.url)
  if (req.headers) {
    for (const name of Object.keys(req.headers)) {
      if (!SAFE_HEADER_SET.has(name.toLowerCase())) delete req.headers[name]
    }
  }
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

// ui.click / ui.input breadcrumbs describe the element as a CSS selector,
// including title/alt/aria-label attributes — which carry staff and patient
// names in this app (e.g. avatar alt text, "Edit Jane Test" buttons).
const IDENTIFYING_ATTR_SELECTOR = /\[(?:title|alt|aria-label|name|value|placeholder)=(?:"[^"]*"|'[^']*'|[^\]]*)\]/gi

export function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb | null {
  if (crumb.message && crumb.category?.startsWith("ui.")) {
    crumb.message = crumb.message.replace(IDENTIFYING_ATTR_SELECTOR, "")
  }
  if (crumb.message) crumb.message = redactText(crumb.message)
  if (crumb.category === "console") {
    // console.* arguments can be whole objects (bookings, Supabase rows).
    // Keep the redacted message line, drop the raw arguments.
    delete crumb.data
    return crumb
  }
  if (crumb.data) {
    scrubUrlData(crumb.data)
    delete crumb.data.request_body
    delete crumb.data.response_body
  }
  return crumb
}

export function scrubEvent(event: ErrorEvent): ErrorEvent | null {
  scrubRequest(event)
  if (event.message) event.message = redactText(event.message)
  if (event.logentry?.message) event.logentry.message = redactText(event.logentry.message)
  if (event.logentry?.params) event.logentry.params = redactDeep(event.logentry.params) as unknown[]
  for (const ex of event.exception?.values ?? []) {
    if (ex.value) ex.value = redactText(ex.value)
  }
  if (event.extra) event.extra = redactDeep(event.extra) as Record<string, unknown>
  // e.g. contexts.nextjs.request_path from captureRequestError keeps the
  // query string. Strip queries from URL/path-looking context values.
  for (const ctx of Object.values(event.contexts ?? {})) {
    if (!ctx || typeof ctx !== "object") continue
    for (const [k, v] of Object.entries(ctx as Record<string, unknown>)) {
      if (typeof v === "string" && (v.startsWith("/") || v.includes("://"))) {
        ;(ctx as Record<string, unknown>)[k] = stripQuery(v)
      }
    }
  }
  for (const crumb of event.breadcrumbs ?? []) scrubBreadcrumb(crumb)
  if (event.user) {
    // Only ever id + role (set in auth-store / api-auth). Belt and braces.
    event.user = { id: event.user.id, role: (event.user as { role?: string }).role }
  }
  return event
}

export function scrubSpan(span: StreamedSpanJSON): StreamedSpanJSON {
  span.name = redactText(stripQuery(span.name))
  const attrs = span.attributes as Record<string, unknown>
  for (const key of QUERY_KEYS) delete attrs[key]
  for (const key of Object.keys(attrs)) {
    // Bodies, non-allowlisted headers, user identity and client IP — the v11
    // request-data integration writes these onto server segment spans. The
    // dataCollection policy should stop them; this is the second lock.
    const header = /^http\.(?:request|response)\.header\.(.+)$/.exec(key)
    if (
      /^http\.(?:request|response)\.body/.test(key) ||
      (header && !SAFE_HEADER_SET.has(header[1].toLowerCase())) ||
      /^(?:user\.|client\.address|http\.client_ip|enduser\.)/.test(key)
    ) {
      delete attrs[key]
    }
  }
  for (const [key, raw] of Object.entries(attrs)) {
    // Attribute values may be bare primitives or { value, type } wrappers.
    const wrapped = raw !== null && typeof raw === "object" && "value" in raw
    const value = wrapped ? (raw as { value: unknown }).value : raw
    if (typeof value !== "string") continue
    const clean = URL_KEYS.includes(key) ? stripQuery(value) : redactText(value)
    if (wrapped) (raw as { value: unknown }).value = clean
    else attrs[key] = clean
  }
  return span
}

// ---------------------------------------------------------------------------
// External-provider instrumentation helper (server-side only callers)
// ---------------------------------------------------------------------------

export type BookingProvider = "payfast-validate" | "payfast-query" | "carefirst"
