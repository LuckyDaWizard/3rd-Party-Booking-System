import { NextResponse } from "next/server"
import { createRateLimiter, getClientIp } from "@/lib/rate-limit"

// =============================================================================
// POST /monitoring — Sentry tunnel for the browser SDK
//
// Browser events are sent here (same origin, so ad-blockers don't drop them)
// and forwarded to Sentry. Replaces withSentryConfig's `tunnelRoute`, which is
// a blind Next.js rewrite: it takes the org/project from the client's query
// string (an open relay to ANY Sentry org) and passes every request header on
// — including the Supabase session cookies.
//
// This route:
//   - only forwards envelopes whose header DSN matches OUR project
//   - sends just the envelope body: no cookies, auth or X-Forwarded-For
//   - caps body size and rate-limits per IP (1-vCPU VPS)
//
// CSRF-exempt (src/lib/csrf.ts): the SDK can't send our CSRF header, and the
// route changes no app state. No auth: errors on /sign-in matter too.
// =============================================================================

const MAX_ENVELOPE_BYTES = 1024 * 1024
const limiter = createRateLimiter({ max: 120, windowMs: 60 * 1000 })

function parseDsn(dsn: string | undefined): { host: string; projectId: string } | null {
  if (!dsn) return null
  try {
    const u = new URL(dsn)
    const projectId = u.pathname.replace(/^\/+/, "")
    return /^\d+$/.test(projectId) ? { host: u.host, projectId } : null
  } catch {
    return null
  }
}

const OUR_DSN = parseDsn(process.env.NEXT_PUBLIC_SENTRY_DSN)

export async function POST(request: Request) {
  if (!OUR_DSN) return new NextResponse(null, { status: 204 }) // Sentry disabled

  const limit = limiter(getClientIp(request) ?? "unknown")
  if (!limit.allowed) {
    return new NextResponse(null, {
      status: 429,
      headers: { "retry-after": String(limit.retryAfterSeconds) },
    })
  }

  const declared = Number(request.headers.get("content-length") ?? 0)
  if (declared > MAX_ENVELOPE_BYTES) return new NextResponse(null, { status: 413 })

  const body = new Uint8Array(await request.arrayBuffer())
  if (body.byteLength > MAX_ENVELOPE_BYTES) return new NextResponse(null, { status: 413 })

  // Envelope = JSON header line, then items. The browser SDK puts the DSN in
  // the header when a tunnel is configured.
  const newline = body.indexOf(10)
  let target: { host: string; projectId: string } | null = null
  try {
    const header = JSON.parse(
      new TextDecoder().decode(newline === -1 ? body : body.subarray(0, newline))
    ) as { dsn?: string }
    target = parseDsn(header.dsn)
  } catch {
    target = null
  }
  if (!target || target.host !== OUR_DSN.host || target.projectId !== OUR_DSN.projectId) {
    return new NextResponse(null, { status: 400 })
  }

  try {
    const upstream = await fetch(
      `https://${OUR_DSN.host}/api/${OUR_DSN.projectId}/envelope/`,
      {
        method: "POST",
        headers: { "content-type": "application/x-sentry-envelope" },
        body,
        signal: AbortSignal.timeout(10_000),
      }
    )
    return new NextResponse(null, { status: upstream.status })
  } catch {
    // Monitoring must never break the app — just drop the event.
    return new NextResponse(null, { status: 202 })
  }
}
