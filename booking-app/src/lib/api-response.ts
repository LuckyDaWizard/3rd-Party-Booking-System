import { NextResponse } from "next/server"

// =============================================================================
// api-response.ts
//
// Canonical shape for API responses (audit #10). Before this, every endpoint
// returned errors in a slightly different shape — some `{ error: "msg" }`,
// some `{ ok: false, reason: "..." }`, some just `{ valid: false }`. Clients
// had to be defensive in multiple ways.
//
// Convention going forward:
//   - Errors:   { ok: false, error: "human-readable message" }
//   - Success:  whatever the endpoint's response model is; usually
//               includes ok: true alongside the payload fields.
//
// Anti-enumeration endpoints (forgot-pin, reset-pin reason codes,
// manager-pin valid:false) deliberately keep their existing shapes — they
// must NOT include a descriptive error message that would leak whether an
// account exists. Use the explicit NextResponse.json there.
// =============================================================================

export interface ApiErrorBody {
  ok: false
  error: string
}

/**
 * Standardised error response. Returns `{ ok: false, error }` with the
 * given HTTP status code.
 */
export function apiError(
  message: string,
  status: number,
  init?: ResponseInit
): NextResponse<ApiErrorBody> {
  return NextResponse.json<ApiErrorBody>(
    { ok: false, error: message },
    { ...init, status }
  )
}
