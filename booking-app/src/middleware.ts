import { NextRequest, NextResponse } from "next/server"
import {
  CSRF_COOKIE_NAME,
  CSRF_EXEMPT_PATHS,
  CSRF_HEADER_NAME,
  CSRF_PROTECTED_METHODS,
  CSRF_TOKEN_BYTES,
} from "@/lib/csrf"

// =============================================================================
// Next.js middleware — edge runtime
//
// Implements the double-submit cookie CSRF defence for audit item #14.
// Runs on every request that matches the `matcher` config below.
//
// Two responsibilities:
//
//   1. TOKEN ISSUANCE
//      On any request where the cookie is missing, generate a fresh random
//      token (256 bits of entropy, hex-encoded) and attach it as a
//      non-httpOnly cookie so client JS can read it. Works on any method;
//      fresh browser sessions pick the token up on their first GET before
//      ever attempting a POST.
//
//   2. TOKEN VALIDATION
//      For state-changing methods (POST/PUT/PATCH/DELETE), compare the
//      X-CSRF-Token header to the cookie. Mismatch → 403. Since an attacker
//      on a different origin can't read our cookie (Same-Origin Policy),
//      they can't forge the header, and SameSite=Lax blocks their cookies
//      from being sent on cross-site fetches to begin with. Two belt-and-
//      braces layers.
//
// Exempt paths (see lib/csrf.ts):
//   - /api/payfast/notify → PayFast can't send our custom header; it's
//     authenticated via its own MD5 signature + source-IP allowlist +
//     server confirmation.
//
// Safe methods (GET/HEAD/OPTIONS) are never validated — they shouldn't
// be state-changing anyway, and blocking them would break normal browsing.
//
// Runs on edge runtime — no Node crypto, use the Web Crypto API's
// crypto.getRandomValues() for the token.
// =============================================================================

function generateToken(): string {
  const bytes = new Uint8Array(CSRF_TOKEN_BYTES)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

function isExempt(pathname: string): boolean {
  return CSRF_EXEMPT_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  )
}

/**
 * Constant-time string comparison. Avoids timing side channels that could
 * let an attacker probe which leading characters of the cookie match.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

// Content-type prefixes we accept on `/api/*` POST/PUT/PATCH bodies.
// Anything else is rejected with 415 before the route handler runs, so we
// never even attempt to JSON-parse text/plain or application/octet-stream
// pretending to be JSON. Defence-in-depth — handlers already try/catch
// request.json(), but this stops the attempt at the door (audit #15).
const ALLOWED_BODY_CONTENT_TYPES = [
  "application/json",
  "multipart/form-data", // avatar / logo uploads
  "application/x-www-form-urlencoded", // PayFast notify (also CSRF-exempt)
]

const BODY_METHODS = new Set(["POST", "PUT", "PATCH"])

function requestHasBody(request: NextRequest): boolean {
  const len = request.headers.get("content-length")
  if (len !== null && len !== "0") return true
  const enc = request.headers.get("transfer-encoding")
  if (enc && enc.toLowerCase().includes("chunked")) return true
  return false
}

/**
 * Check whether the request carries a valid X-Cron-Secret matching the
 * CRON_SECRET env var. Used to let the 15-min VPS crontab bypass the
 * cookie-based admin gate + CSRF check on /api/payfast/reconcile,
 * /api/admin/cleanup/sweep, and /api/admin/incidents. Constant-time
 * compare. Returns false if CRON_SECRET isn't configured (cron disabled).
 *
 * Mirrors `isAuthorizedCronCall` in lib/api-auth.ts but runs on edge
 * runtime, so it uses the local constantTimeEqual rather than node:crypto.
 */
function isCronCall(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected || expected.length < 16) return false
  const provided = request.headers.get("x-cron-secret")
  if (!provided) return false
  return constantTimeEqual(provided, expected)
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const method = request.method.toUpperCase()

  // A valid X-Cron-Secret short-circuits the cookie-based admin gate and
  // the CSRF check below — the secret IS the auth for the 15-min VPS
  // crontab calling /api/payfast/reconcile, /api/admin/cleanup/sweep,
  // and /api/admin/incidents. Computed once per request.
  const cronAuthed = isCronCall(request)

  // Default-deny for /api/admin/* without an auth cookie (audit #7 /
  // Sprint 3 #11). The in-handler `requireSystemAdminWithCaller()` checks
  // still verify role + status downstream; this is the belt + braces layer
  // that ensures a new admin route which forgets the in-handler check is
  // STILL blocked for unauthenticated callers. Supabase sets the access
  // token under cookie name `sb-<project-ref>-auth-token`.
  if (pathname.startsWith("/api/admin/") && !cronAuthed) {
    const hasSupabaseAuthCookie = request.cookies
      .getAll()
      .some((c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token"))
    if (!hasSupabaseAuthCookie) {
      return new NextResponse(
        JSON.stringify({ ok: false, error: "Unauthenticated" }),
        {
          status: 401,
          headers: { "content-type": "application/json" },
        }
      )
    }
  }

  // Read the existing cookie (may be undefined on a fresh browser).
  const existing = request.cookies.get(CSRF_COOKIE_NAME)?.value

  // Validate FIRST so a missing/mismatched token on a protected request
  // short-circuits before we touch the response at all. Cron-authenticated
  // calls are exempt — they're not browsers and can't read cookies.
  if (CSRF_PROTECTED_METHODS.has(method) && !isExempt(pathname) && !cronAuthed) {
    const headerToken = request.headers.get(CSRF_HEADER_NAME)
    if (
      !existing ||
      !headerToken ||
      !constantTimeEqual(existing, headerToken)
    ) {
      return new NextResponse(
        JSON.stringify({ error: "CSRF validation failed" }),
        {
          status: 403,
          headers: { "content-type": "application/json" },
        }
      )
    }
  }

  // Content-Type guard for API bodies (audit #15). Only enforced when a
  // body is actually declared — bodiless POSTs (e.g. /reset-pin trigger)
  // are left alone. /api/payfast/notify uses urlencoded which is in the
  // allowed list anyway.
  if (
    pathname.startsWith("/api/") &&
    BODY_METHODS.has(method) &&
    requestHasBody(request)
  ) {
    const ct = (request.headers.get("content-type") ?? "").toLowerCase()
    const ctType = ct.split(";")[0].trim()
    if (!ALLOWED_BODY_CONTENT_TYPES.some((allowed) => ctType === allowed)) {
      return new NextResponse(
        JSON.stringify({
          error: "Unsupported Media Type — expected application/json",
        }),
        {
          status: 415,
          headers: { "content-type": "application/json" },
        }
      )
    }
  }

  // Let the request through.
  const response = NextResponse.next()

  // Issue a fresh cookie when none exists. Rotating on every request is
  // overkill and breaks in-flight requests, so we only set if missing.
  if (!existing) {
    response.cookies.set({
      name: CSRF_COOKIE_NAME,
      value: generateToken(),
      // NOT httpOnly — client JS must read this to send it back in the
      // header. The whole point of the double-submit pattern is that
      // same-origin JS can read it but cross-origin JS can't.
      httpOnly: false,
      // Lax is enough: the cookie will travel on top-level navigations
      // (so the app loads with a token), and the token itself is the
      // defence against cross-site POSTs — SameSite is the belt.
      sameSite: "lax",
      // Set secure once we're on HTTPS (audit #1). For now, the VPS is
      // http-only; flipping this on would stop the cookie being set at
      // all, so read NODE_ENV and only enable in production.
      secure: process.env.NODE_ENV === "production" && request.nextUrl.protocol === "https:",
      path: "/",
      // One week — rotates often enough to limit exposure of a stolen
      // token but long enough that a user's session cookie (up to 30
      // days) doesn't outlast the CSRF cookie and break things.
      maxAge: 7 * 24 * 60 * 60,
    })
  }

  return response
}

// Match everything EXCEPT static assets and image optimiser output. This
// keeps the middleware off the hot path for CSS/JS/font/image requests
// while still running on all API routes and page loads.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|woff|woff2|ttf|otf)$).*)",
  ],
}
