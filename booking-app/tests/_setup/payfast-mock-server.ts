/* eslint-disable no-console */
// =============================================================================
// tests/_setup/payfast-mock-server.ts
//
// Stand-in HTTP server for the PayFast endpoints our server-side code calls
// directly (ITN server-confirmation POST + Transaction History GET). Forked
// from carefirst-mock-server.ts (D10 / D11) — same lifecycle, introspection,
// and cross-worker safety conventions. See that file's header for the why
// of the overall pattern.
//
// SCOPE
// ------
// What this mock CURRENTLY simulates:
//
//   - POST /eng/query/validate
//     Step 4 of ITN validation — the "server confirmation" round trip in
//     `validateItnServerConfirmation()` at src/lib/payfast.ts. Production
//     PayFast returns the plain-text body "VALID" or "INVALID" (NOT JSON).
//     We match that contract: Content-Type text/plain, body literally
//     "VALID" or "INVALID" depending on mode.
//
//   - GET /transactions/history
//     The pull-based reconciliation endpoint hit by
//     `fetchPayfastTransactions()` at src/lib/payfast.ts:464. Production
//     PayFast returns JSON in one of several shapes — we use the
//     `{ data: { response: [...] } }` shape since that's what
//     extractTransactionsFromResponse() prefers. Default mode returns an
//     empty array; per-test seeding will be added in C5.
//
//   - Introspection: GET /__health, GET/POST/DELETE /__received, GET/POST/
//     DELETE /__mode. Same shapes as the CareFirst mock.
//
// What this mock DELIBERATELY DOES NOT simulate:
//
//   - The production sandbox-API 401 on GET /transactions/history. Real
//     PayFast sandbox returns 401 because the Query API isn't enabled for
//     sandbox merchants (see memory `project_payfast_mode`). The mock
//     always returns 200 + an empty array (or seeded data in C5+) so we
//     can test the SUCCESS path of reconcile that production sandbox can't
//     reach. Tests that want to assert the 401 / sandbox-skip path should
//     use the mock's `mode: "invalid"` or similar (added in C4).
//
//   - PayFast's signature / merchant-id header validation on the Query
//     API. The production fetch sends merchant-id, timestamp, signature
//     headers; we record them via /__received so a future spec can assert
//     they were present, but the mock itself doesn't recompute or check.
//
//   - The PayFast IP allowlist check at payfast.ts:247 — that runs on the
//     INBOUND /api/payfast/notify route, not on outbound fetches, so it's
//     not in this mock's scope. The localhost carve-out (NODE_ENV !==
//     "production") already lets that route accept test-originated ITNs.
//
// PORT
// -----
// Hardcoded default 4748 (CareFirst uses 4747). Override via
// PAYFAST_MOCK_PORT in your shell AND update playwright.config.ts in
// lockstep — there's no shared discovery channel between globalSetup and
// the webServer block. If 4748 collides with something on your box (rare),
// same diagnostic as the CareFirst mock: EADDRINUSE on boot, surfaced as
// a clear error.
//
// MODE LIFECYCLE
// ---------------
// Mode is module-level state. Tests that set a non-default mode MUST reset
// it (DELETE /__mode) in a try/finally or afterEach, otherwise the next
// test in the same worker inherits the override. startPayfastMockServer()
// forces mode back to "valid" at every boot so a fresh run always starts
// at the default.
//
// Modes for C1: only `valid` is implemented. The other kinds in
// `PayfastMockMode` are documented placeholders for C4 (negative paths)
// and C5 (Transaction History seeding). The mode handler accepts them so
// that C1 tests asserting against the type definition pass, but they
// currently behave identically to `valid`. TODO(C4/C5) markers below.
//
// CROSS-WORKER SAFETY
// --------------------
// Same as the CareFirst mock: `received` is module-level, shared across
// workers over HTTP. Specs must filter the received-array by their own
// booking ID or m_payment_id. ITN-flow tests will key off m_payment_id;
// reconcile tests will key off the start_date/end_date query window. See
// the CareFirst mock's CROSS-WORKER SAFETY block for the broader rationale.
//
// SEEDED-TRANSACTION CAVEAT (C5): unlike `received`, the `seededTransactions`
// list (GET /transactions/history) is returned WHOLESALE with no per-booking
// keying — there is no in-test filter as a second line of defence. The match
// tests survive a cross-worker leak because production's
// findCompletedPayfastTransaction() filters client-side by m_payment_id, but
// a "no completed transaction" negative test would FALSE-FAIL if another
// worker's seeded matching row leaked in. Seeded-txn specs therefore DEPEND on
// single-worker execution (already required suite-wide: every spec is
// `mode: "serial"` and the single-process dev server serialises compilation
// anyway). If the harness ever moves to multi-worker, add per-booking keying
// to setMockTransactions / handleTransactionsHistory before doing so.
// =============================================================================

import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http"

// ----- Public types ----------------------------------------------------------

export interface RecordedRequest {
  method: string
  path: string
  headers: Record<string, string>
  body: unknown
  query: Record<string, string>
  receivedAt: string
}

/**
 * Response-mode discriminator for the PayFast mock.
 *
 * For C1 only `valid` is fully implemented. The other variants are part of
 * the public surface so tests authored in C4/C5 can rely on the type
 * without further breaking changes — but they currently fall back to the
 * `valid` behaviour. TODO(C4): wire `invalid` (returns "INVALID" string
 * body from /eng/query/validate) and `timeout` (sleep past production's
 * 5s abort). TODO(C5): wire `txn-mismatch` and the per-test seeded
 * transaction list for /transactions/history.
 */
export type PayfastMockMode =
  | { kind: "valid" }                       // default
  | { kind: "invalid" }                     // C4 — /eng/query/validate returns "INVALID"
  | { kind: "timeout"; delayMs?: number }   // C4 — 6s default exceeds production's 5s abort

/**
 * A single seeded transaction row for GET /transactions/history. Loose by
 * design — the production parser (extractTransactionsFromResponse +
 * findCompletedPayfastTransaction) only reads m_payment_id, pf_payment_id,
 * payment_status, amount_gross, so a spec only needs to seed those. Extra
 * keys are passed through verbatim, mirroring real PayFast rows which carry
 * many more fields than the reconcile path inspects.
 */
export type PayfastTransaction = Record<string, unknown>

// ----- Module-level state ----------------------------------------------------

let server: Server | null = null
let received: RecordedRequest[] = []

const DEFAULT_MODE: PayfastMockMode = { kind: "valid" }
let currentMode: PayfastMockMode = DEFAULT_MODE

// Seeded transaction list for GET /transactions/history (C5). Defaults to
// empty — handleTransactionsHistory returns `{ data: { response: [] } }`
// until a spec POSTs rows to /__transactions. Reset to empty at every boot
// and on DELETE /__transactions, same lifecycle discipline as currentMode.
const DEFAULT_TRANSACTIONS: PayfastTransaction[] = []
let seededTransactions: PayfastTransaction[] = DEFAULT_TRANSACTIONS

// ----- Public API ------------------------------------------------------------

export function getReceivedRequests(): RecordedRequest[] {
  return [...received]
}

export function clearReceivedRequests(): void {
  received = []
}

export interface StartOptions {
  /** Port to bind to. Defaults to env PAYFAST_MOCK_PORT or 4748. */
  port?: number
}

export interface StartResult {
  port: number
  baseUrl: string
}

/**
 * Boots the mock server and resolves once it's accepting connections.
 * Idempotent — calling twice returns the same instance.
 */
export async function startPayfastMockServer(
  opts: StartOptions = {}
): Promise<StartResult> {
  if (server) {
    const addr = server.address()
    const port = typeof addr === "object" && addr ? addr.port : opts.port ?? 4748
    return { port, baseUrl: `http://localhost:${port}` }
  }

  const port = opts.port ?? Number(process.env.PAYFAST_MOCK_PORT ?? 4748)

  // Reset mode at every boot so a stale module-level value from a prior
  // run (only possible under in-process re-use) can't leak through.
  currentMode = DEFAULT_MODE
  // Same reasoning for the seeded transaction list — start every run empty.
  seededTransactions = DEFAULT_TRANSACTIONS

  server = createServer(handleRequest)

  await new Promise<void>((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        reject(
          new Error(
            `[payfast-mock] Port ${port} is already in use. Free it or set PAYFAST_MOCK_PORT to another value (and update playwright.config.ts to match).`
          )
        )
      } else {
        reject(err)
      }
    }
    server!.once("error", onError)
    server!.listen(port, "127.0.0.1", () => {
      server!.removeListener("error", onError)
      resolve()
    })
  })

  console.log(`[payfast-mock] Listening on http://localhost:${port}`)
  return { port, baseUrl: `http://localhost:${port}` }
}

/** Gracefully shuts the mock down. Safe to call when not running. */
export async function stopPayfastMockServer(): Promise<void> {
  if (!server) return
  await new Promise<void>((resolve, reject) => {
    server!.close((err) => (err ? reject(err) : resolve()))
  })
  server = null
  received = []
  seededTransactions = DEFAULT_TRANSACTIONS
  console.log("[payfast-mock] Stopped")
}

// ----- Request handler --------------------------------------------------------

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  const method = req.method ?? "GET"
  const rawUrl = req.url ?? "/"
  // Strip query string for path-based routing; we still record the full
  // query separately for assertion purposes.
  const [path, queryString = ""] = rawUrl.split("?", 2)

  // Introspection: GET /__received → JSON array of recorded requests.
  if (method === "GET" && path === "/__received") {
    sendJson(res, 200, received)
    return
  }
  // Introspection: DELETE /__received → reset recorded requests.
  if (method === "DELETE" && path === "/__received") {
    received = []
    sendJson(res, 200, { cleared: true })
    return
  }
  // Health check.
  if (method === "GET" && path === "/__health") {
    sendJson(res, 200, { ok: true })
    return
  }

  // Mode override. GET introspects, POST sets, DELETE resets.
  if (method === "GET" && path === "/__mode") {
    sendJson(res, 200, currentMode)
    return
  }
  if (method === "DELETE" && path === "/__mode") {
    currentMode = DEFAULT_MODE
    sendJson(res, 200, { ok: true, mode: currentMode })
    return
  }
  if (method === "POST" && path === "/__mode") {
    handleSetMode(req, res)
    return
  }

  // Seeded-transactions override (C5). GET introspects, POST sets the list
  // from a JSON array body, DELETE clears back to empty. Same lifecycle as
  // /__mode — specs MUST clear in a try/finally so the next test in the
  // worker doesn't inherit the seeded rows.
  if (method === "GET" && path === "/__transactions") {
    sendJson(res, 200, seededTransactions)
    return
  }
  if (method === "DELETE" && path === "/__transactions") {
    seededTransactions = DEFAULT_TRANSACTIONS
    sendJson(res, 200, { ok: true, count: 0 })
    return
  }
  if (method === "POST" && path === "/__transactions") {
    handleSetTransactions(req, res)
    return
  }

  // ITN server-confirmation endpoint.
  if (method === "POST" && path === "/eng/query/validate") {
    handleValidate(req, res, queryString)
    return
  }

  // Transaction History query endpoint.
  if (method === "GET" && path === "/transactions/history") {
    handleTransactionsHistory(req, res, queryString)
    return
  }

  sendJson(res, 404, { error: `Mock PayFast: no handler for ${method} ${path}` })
}

function handleSetMode(req: IncomingMessage, res: ServerResponse): void {
  readJsonBody(req)
    .then((body) => {
      if (!body || typeof body !== "object") {
        sendJson(res, 400, {
          error: "POST /__mode requires a JSON body with { kind }.",
        })
        return
      }
      const raw = body as Record<string, unknown>
      const kind = raw.kind
      if (kind !== "valid" && kind !== "invalid" && kind !== "timeout") {
        sendJson(res, 400, {
          error: `Unknown mode kind: ${String(kind)}. Expected "valid" | "invalid" | "timeout".`,
        })
        return
      }
      let next: PayfastMockMode
      if (kind === "timeout") {
        const delayMs = typeof raw.delayMs === "number" ? raw.delayMs : 6000
        next = { kind, delayMs }
      } else {
        next = { kind }
      }
      currentMode = next
      sendJson(res, 200, { ok: true, mode: currentMode })
    })
    .catch((err: unknown) => {
      sendJson(res, 400, {
        error: `Failed to parse mode body — ${
          err instanceof Error ? err.message : String(err)
        }`,
      })
    })
}

function handleSetTransactions(req: IncomingMessage, res: ServerResponse): void {
  readJsonBody(req)
    .then((body) => {
      if (!Array.isArray(body)) {
        sendJson(res, 400, {
          error:
            "POST /__transactions requires a JSON array of transaction rows.",
        })
        return
      }
      seededTransactions = body as PayfastTransaction[]
      sendJson(res, 200, { ok: true, count: seededTransactions.length })
    })
    .catch((err: unknown) => {
      sendJson(res, 400, {
        error: `Failed to parse transactions body — ${
          err instanceof Error ? err.message : String(err)
        }`,
      })
    })
}

// ---------------------------------------------------------------------------
// POST /eng/query/validate
//
// Production PayFast returns a plain-text body — literally the string "VALID"
// or "INVALID", no JSON, no quotes. validateItnServerConfirmation() at
// src/lib/payfast.ts:362 does `text.trim() === "VALID"`. Match exactly.
// ---------------------------------------------------------------------------
function handleValidate(
  req: IncomingMessage,
  res: ServerResponse,
  queryString: string
): void {
  readRawBody(req)
    .then(async (rawBody) => {
      // ITN confirmation comes in as application/x-www-form-urlencoded — parse
      // for the audit trail so tests can assert what production sent. Empty
      // body is fine (the recorded body will be {}); we don't reject on it.
      const parsed = parseFormUrlEncoded(rawBody)
      received.push({
        method: req.method ?? "POST",
        path: "/eng/query/validate",
        headers: flattenHeaders(req.headers),
        body: parsed,
        query: parseFormUrlEncoded(queryString),
        receivedAt: new Date().toISOString(),
      })

      // Snapshot mode for THIS request so a concurrent /__mode change can't
      // swap behaviour mid-flight.
      const mode = currentMode

      if (mode.kind === "timeout") {
        // TODO(C4): production aborts after 5s via the fetch's natural
        // network timeout (no explicit AbortSignal — Node's default applies).
        // 6s default delay is conservative; tweak when C4 wires the real
        // negative test.
        const delayMs = mode.delayMs ?? 6000
        await new Promise((resolve) => setTimeout(resolve, delayMs))
        sendPlain(res, 200, "VALID")
        return
      }

      if (mode.kind === "invalid") {
        // TODO(C4): exercise the validateItnServerConfirmation() false-return
        // branch. Production returns "INVALID" (plain-text) when the server
        // confirmation fails its own validation pass.
        sendPlain(res, 200, "INVALID")
        return
      }

      // Default: valid.
      sendPlain(res, 200, "VALID")
    })
    .catch((err: unknown) => {
      // Body-read failures shouldn't be silent. PayFast itself would return
      // "INVALID" on a malformed confirmation; we mirror that.
      console.error("[payfast-mock] /eng/query/validate body read failed:", err)
      sendPlain(res, 200, "INVALID")
    })
}

// ---------------------------------------------------------------------------
// GET /transactions/history
//
// Production returns one of several shapes; extractTransactionsFromResponse()
// in payfast.ts unpacks `{ data: { response: [...] } }` first. We emit that
// shape so the production parser exercises its primary branch.
//
// C1: always returns an empty array. C5 will add a `setMockTransactions()`
// helper that seeds the array for a single test, scoped by m_payment_id.
// ---------------------------------------------------------------------------
function handleTransactionsHistory(
  req: IncomingMessage,
  res: ServerResponse,
  queryString: string
): void {
  // Record the request for assertion purposes. No body on a GET, but the
  // production signature + merchant-id headers and the start_date /
  // end_date query params are what tests will want to verify.
  received.push({
    method: req.method ?? "GET",
    path: "/transactions/history",
    headers: flattenHeaders(req.headers),
    body: null,
    query: parseFormUrlEncoded(queryString),
    receivedAt: new Date().toISOString(),
  })

  // Return the per-test seeded list (C5), defaulting to empty. We return
  // ALL seeded rows regardless of the start_date/end_date query window —
  // production's findCompletedPayfastTransaction() filters client-side by
  // m_payment_id + status, so returning the full list and letting the
  // production parser do the matching exercises the real code path. Specs
  // seed only the rows relevant to their booking and clear in finally.
  sendJson(res, 200, { data: { response: seededTransactions } })
}

// ----- Utilities --------------------------------------------------------------

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  if (res.writableEnded || res.destroyed) return
  const body = JSON.stringify(payload)
  try {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    })
    res.end(body)
  } catch {
    // Socket closed mid-write — same reason as the CareFirst mock.
  }
}

function sendPlain(res: ServerResponse, status: number, payload: string): void {
  if (res.writableEnded || res.destroyed) return
  try {
    res.writeHead(status, {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Length": Buffer.byteLength(payload),
    })
    res.end(payload)
  } catch {
    // No-op — see sendJson comment.
  }
}

// Cap body size at 256 KiB. ITN confirmation payloads are <2 KiB so this is
// generous; the cap exists to stop a misconfigured / looping test from
// OOM'ing the worker before the real assertion can fail.
const MAX_BODY_BYTES = 256 * 1024

async function readRawBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    total += (chunk as Buffer).byteLength
    if (total > MAX_BODY_BYTES) {
      throw new Error(`body exceeds ${MAX_BODY_BYTES} bytes`)
    }
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks).toString("utf8")
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const raw = await readRawBody(req)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

function parseFormUrlEncoded(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  if (!raw) return out
  for (const pair of raw.split("&")) {
    if (!pair) continue
    const eq = pair.indexOf("=")
    if (eq === -1) {
      out[decodeURIComponent(pair.replace(/\+/g, " "))] = ""
      continue
    }
    const k = decodeURIComponent(pair.slice(0, eq).replace(/\+/g, " "))
    const v = decodeURIComponent(pair.slice(eq + 1).replace(/\+/g, " "))
    out[k] = v
  }
  return out
}

function flattenHeaders(
  headers: IncomingMessage["headers"]
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) {
    if (v === undefined) continue
    out[k] = Array.isArray(v) ? v.join(", ") : String(v)
  }
  return out
}

// NOTE: No standalone entry point. The repo's tsconfig is ESM so a CJS
// `require.main === module` check would fail strict typing. globalSetup
// imports startPayfastMockServer() directly; for ad-hoc manual launches,
// wrap a 1-line CJS launcher (mirror the CareFirst pattern).
