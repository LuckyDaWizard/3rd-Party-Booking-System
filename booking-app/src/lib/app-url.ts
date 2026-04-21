// =============================================================================
// app-url.ts
//
// One place to resolve the public-facing base URL of the app. Every server-
// side place that needs to build an absolute URL (email links, PayFast
// return_url, CareFirst returnUrl, etc.) should call getAppUrl() rather
// than reading process.env.NEXT_PUBLIC_APP_URL directly. When the domain
// migration happens (audit #1) there's a single env var to update, and
// the fallback value in this file is the only place that pins the legacy
// IP.
//
// Safe on both server and client — NEXT_PUBLIC_ prefix means the value is
// inlined into the client bundle at build time.
// =============================================================================

/**
 * Legacy fallback used only when NEXT_PUBLIC_APP_URL is completely unset.
 * In a normal deploy this env var is present (via docker-compose), so this
 * fallback only matters for local dev started without a .env.local.
 *
 * Update this string when we move to a real domain + HTTPS and retire the
 * raw-IP URL entirely.
 */
const LEGACY_FALLBACK = "http://187.127.135.11:3000"

/**
 * Returns the app's public base URL with no trailing slash.
 * Always safe to concatenate with an absolute path, e.g.
 *   `${getAppUrl()}/api/health`
 */
export function getAppUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL
  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv.replace(/\/+$/, "")
  }
  return LEGACY_FALLBACK
}
