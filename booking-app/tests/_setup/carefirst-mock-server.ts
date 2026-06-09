/* eslint-disable no-console */
// =============================================================================
// tests/_setup/carefirst-mock-server.ts
//
// Stand-in HTTP server for the CareFirst Patient SSO endpoint. Used by the
// Playwright suite so we can drive the full /create-booking flow through
// /api/bookings/[id]/start-consultation and assert the booking ends in
// "Successful" with handoff_redirect_url stored.
//
// WHY THIS EXISTS
// ----------------
// Playwright's `page.route()` only intercepts BROWSER-originated requests.
// The Start Consult flow's CareFirst call is a server-side `fetch()` from
// our Next.js API route — it never touches the browser, so page.route()
// can't see it. The workaround is to stand up a tiny HTTP server on a
// known port, point CAREFIRST_API_DOMAIN at it via the dev server's env,
// and assert against the recorded requests over a separate introspection
// endpoint.
//
// SCOPE
// ------
// - Single happy-path endpoint: POST /api/external/client-sso/auto-register
//   returns 200 + { redirectUrl, referenceId } for any well-formed body.
// - Introspection endpoint: GET /__received returns the recorded requests
//   (JSON). DELETE /__received clears them. Workers that import this file
//   directly can also call getReceivedRequests() / clearReceivedRequests()
//   in-process — but globalSetup runs in a separate Node process from the
//   test workers, so the HTTP introspection is what the spec uses.
// - No persistent state, no DB writes, no external deps. Pure Node http.
// - Fixed port (default 4747) so playwright.config.ts can set the env var
//   statically. Override with CAREFIRST_MOCK_PORT if 4747 is in use.
//
// CROSS-WORKER SAFETY
// --------------------
// `received` is module-level and the introspection endpoint serves it over
// HTTP, so all Playwright workers share the same array. Two specs calling
// clearMockReceived() + getMockReceived() concurrently would race.
//
// The mitigation is on the SPEC side, not the mock side: tests filter the
// mock's full received-array by their own booking ID, since
// uniqueReference === booking.id in every Start Consult payload. See
// getMockReceivedForBooking() in coupon-r0-happy-path.spec.ts. As long as
// every spec follows that pattern, the shared array is safe — each test
// only sees its own requests.
//
// If a future test needs to assert "the mock received N requests total"
// rather than "received N requests for booking X", it'll need to either
// (a) serialise via test.describe.configure({ mode: "serial" }) + a
// project-level workers: 1, or (b) accept that the total is a
// best-effort floor rather than an exact count.
//
// DEV-SERVER WIRING CHECK
// -----------------------
// reuseExistingServer=true (the local default) silently bypasses
// webServer.env. If a dev had `npm run dev` running before Playwright
// launched, the SSO call hits real CareFirst staging — not the mock.
// The coupon-r0-happy-path spec catches this with an explicit error
// message when getMockReceivedForBooking() returns empty after a Start
// Consult call. The error tells the operator the likely cause and the
// remediation. If a NEW spec adds Start Consult coverage, copy that
// pattern so the same diagnostic surfaces.
//
// LIFECYCLE
// ----------
// startCareFirstMockServer() / stopCareFirstMockServer() are the entry
// points. Called from tests/_setup/global-setup.ts and global-teardown.ts.
// =============================================================================

import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http"
import { randomUUID } from "node:crypto"

// ----- Public types ----------------------------------------------------------

export interface RecordedRequest {
  method: string
  path: string
  headers: Record<string, string>
  body: unknown
  receivedAt: string
}

// ----- Module-level state ----------------------------------------------------
//
// In-process state for code paths that import this module directly (e.g.
// tests run in the same Node instance as the mock). For cross-process
// reads (the test workers vs globalSetup), the introspection HTTP endpoint
// is the source of truth.

let server: Server | null = null
let received: RecordedRequest[] = []
let expectedApiKey: string | null = null

// ----- Public API ------------------------------------------------------------

export function getReceivedRequests(): RecordedRequest[] {
  return [...received]
}

export function clearReceivedRequests(): void {
  received = []
}

export interface StartOptions {
  /** Port to bind to. Defaults to env CAREFIRST_MOCK_PORT or 4747. */
  port?: number
  /** Required x-api-key value. Defaults to env CAREFIRST_API_KEY or "playwright-mock-key". */
  apiKey?: string
}

export interface StartResult {
  port: number
  baseUrl: string
}

/**
 * Boots the mock server and resolves once it's accepting connections.
 * Idempotent — calling twice returns the same instance.
 */
export async function startCareFirstMockServer(
  opts: StartOptions = {}
): Promise<StartResult> {
  if (server) {
    const addr = server.address()
    const port = typeof addr === "object" && addr ? addr.port : opts.port ?? 4747
    return { port, baseUrl: `http://localhost:${port}` }
  }

  const port = opts.port ?? Number(process.env.CAREFIRST_MOCK_PORT ?? 4747)
  expectedApiKey = opts.apiKey ?? process.env.CAREFIRST_API_KEY ?? "playwright-mock-key"

  server = createServer(handleRequest)

  await new Promise<void>((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        reject(
          new Error(
            `[carefirst-mock] Port ${port} is already in use. Free it or set CAREFIRST_MOCK_PORT to another value (and update playwright.config.ts to match).`
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

  console.log(`[carefirst-mock] Listening on http://localhost:${port}`)
  return { port, baseUrl: `http://localhost:${port}` }
}

/** Gracefully shuts the mock down. Safe to call when not running. */
export async function stopCareFirstMockServer(): Promise<void> {
  if (!server) return
  await new Promise<void>((resolve, reject) => {
    server!.close((err) => (err ? reject(err) : resolve()))
  })
  server = null
  received = []
  console.log("[carefirst-mock] Stopped")
}

// ----- Request handler --------------------------------------------------------

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  const method = req.method ?? "GET"
  const path = req.url ?? "/"

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

  // SSO endpoint.
  if (method === "POST" && path === "/api/external/client-sso/auto-register") {
    handleAutoRegister(req, res)
    return
  }

  sendJson(res, 404, { error: `Mock CareFirst: no handler for ${method} ${path}` })
}

function handleAutoRegister(req: IncomingMessage, res: ServerResponse): void {
  // Presence check on x-api-key. We intentionally don't compare against a
  // specific expected value — that turned out to be fragile because Next.js
  // dev's env-loading order can let `.env.local`'s CAREFIRST_API_KEY win
  // over the override we inject via playwright.config.ts's webServer.env.
  // What we DO want to catch is "production code forgot to send the header
  // at all" — that fails the booking on the real CareFirst side and we'd
  // want the test to fail too. Presence check covers it.
  //
  // The expectedApiKey module-level var is still set during start() for
  // backwards-compat / introspection, but isn't enforced here.
  void expectedApiKey
  const headerKey = req.headers["x-api-key"]
  const apiKey = Array.isArray(headerKey) ? headerKey[0] : headerKey
  if (!apiKey || apiKey.length === 0) {
    sendJson(res, 401, {
      result: false,
      displayMessage: "Mock CareFirst: missing x-api-key header.",
      errorMessage: "missing_api_key",
    })
    return
  }

  // Read body.
  readJsonBody(req)
    .then((body) => {
      const recorded: RecordedRequest = {
        method: req.method ?? "POST",
        path: req.url ?? "/",
        headers: flattenHeaders(req.headers),
        body,
        receivedAt: new Date().toISOString(),
      }
      received.push(recorded)

      // Derive a deterministic-ish redirect URL from the uniqueReference so
      // the test can correlate the response to the request without depending
      // on call order.
      const uniqueReference =
        (body && typeof body === "object" && (body as Record<string, unknown>).uniqueReference) ||
        "unknown"
      const referenceId = randomUUID()
      sendJson(res, 200, {
        result: true,
        redirectUrl: `https://patient.carefirst.test/start/${String(uniqueReference)}`,
        referenceId,
      })
    })
    .catch((err: unknown) => {
      sendJson(res, 400, {
        result: false,
        errorMessage: `Mock CareFirst: failed to parse body — ${
          err instanceof Error ? err.message : String(err)
        }`,
      })
    })
}

// ----- Utilities --------------------------------------------------------------

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  })
  res.end(body)
}

// Cap body size at 256 KiB. SSO payloads are ~2 KiB so this is generous;
// the cap exists to stop a misconfigured / looping test from OOM'ing the
// worker before the real assertion can fail.
const MAX_BODY_BYTES = 256 * 1024

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    total += (chunk as Buffer).byteLength
    if (total > MAX_BODY_BYTES) {
      throw new Error(`body exceeds ${MAX_BODY_BYTES} bytes`)
    }
    chunks.push(chunk as Buffer)
  }
  const raw = Buffer.concat(chunks).toString("utf8")
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
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

// NOTE: No standalone entry point. The repo's tsconfig is ESM
// (module: "esnext"), so `require.main === module` would be a type error
// under strict mode. globalSetup imports startCareFirstMockServer()
// directly; if you want to run the mock manually for debugging, wrap a
// 1-line CJS launcher in `tests/_setup/carefirst-mock-launcher.cjs`.
