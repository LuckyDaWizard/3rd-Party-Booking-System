// =============================================================================
// csrf.ts
//
// Double-submit cookie CSRF protection (audit item #14).
//
// How it works:
//   1. Middleware (src/middleware.ts) writes a random token to the
//      CSRF_COOKIE_NAME cookie on every response. The cookie is NOT
//      httpOnly so client JS can read it.
//   2. Client-side fetch interceptor (src/app/providers.tsx) reads the
//      cookie on every state-changing request (POST/PUT/PATCH/DELETE)
//      and sends the value back in the CSRF_HEADER_NAME header.
//   3. Middleware validates that the header matches the cookie. An
//      attacker on a different origin can't read our cookie (Same-Origin
//      Policy) so they can't forge the header. Legitimate same-origin
//      JS can.
//
// Exempt routes:
//   - /api/payfast/notify — PayFast calls this server-to-server and has
//     its own signature-based authentication. It can't send our custom
//     header. Keep exempt.
//   - GET / HEAD / OPTIONS — not state-changing; the token is refreshed
//     but not required.
//
// This module is safe to import from both server and client — the
// `getCsrfToken()` function uses `document.cookie` so it only resolves
// in the browser, but the constants are plain strings.
// =============================================================================

export const CSRF_COOKIE_NAME = "cf_csrf"
export const CSRF_HEADER_NAME = "x-csrf-token"

/** HTTP methods that require the CSRF header. */
export const CSRF_PROTECTED_METHODS = new Set([
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
])

/** Cookie length in bytes (hex-encoded, so actual string is 2x). */
export const CSRF_TOKEN_BYTES = 32

/**
 * Routes exempt from CSRF validation.
 *
 * `/api/payfast/notify` is called by PayFast server-to-server — they can't
 * send our custom header, and the route authenticates via PayFast's own
 * MD5 signature + source-IP check + server confirmation (see notify/route.ts).
 */
export const CSRF_EXEMPT_PATHS = [
  "/api/payfast/notify",
]

/**
 * Read the CSRF token from document.cookie. Returns null on the server
 * or if the cookie hasn't been set yet.
 *
 * Client-only. Uses document.cookie, not the Next.js cookie helpers,
 * because the interceptor needs to read the value on each request
 * without any async overhead.
 */
export function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${CSRF_COOKIE_NAME}=([^;]+)`)
  )
  return match ? decodeURIComponent(match[1]) : null
}
