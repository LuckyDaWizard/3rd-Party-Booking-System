// =============================================================================
// sentry-provider.ts — server-only
//
// Instrumentation for calls to external providers (PayFast ITN validation,
// PayFast Query API, CareFirst SSO auto-register):
//   - providerSpan(): wraps the call in an "http.client" span tagged with
//     booking_provider, so latency per provider shows up in Sentry tracing.
//   - reportProviderFailure(): captures a failure grouped by
//     ["booking-provider", provider, status] so e.g. "CareFirst 503" is one
//     issue no matter which booking triggered it.
//
// POPIA: never pass response bodies, payloads or booking data in here —
// provider responses can echo patient details. Status + provider only.
// =============================================================================

import * as Sentry from "@sentry/nextjs"
import { stripQuery, type BookingProvider } from "./sentry-shared"

export function providerSpan<T>(
  provider: BookingProvider,
  method: string,
  url: string,
  fn: () => Promise<T>
): Promise<T> {
  return Sentry.startSpan(
    {
      op: "http.client",
      name: `${method} ${stripQuery(url)}`,
      attributes: { booking_provider: provider },
    },
    fn
  )
}

/** status: HTTP status code, or "timeout" / "network" when no response arrived. */
export function reportProviderFailure(
  provider: BookingProvider,
  status: number | "timeout" | "network"
): void {
  Sentry.captureException(new Error(`External provider ${provider} failed: ${status}`), {
    tags: { booking_provider: provider, status_code: String(status) },
    fingerprint: ["booking-provider", provider, String(status)],
  })
}
