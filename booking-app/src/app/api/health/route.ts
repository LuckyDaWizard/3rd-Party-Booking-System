import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"

// =============================================================================
// GET /api/health
//
// Lightweight liveness + readiness probe. Used by:
//   - Docker HEALTHCHECK (liveness)
//   - External uptime monitors (UptimeRobot, etc.)
//   - Load balancer health checks
//
// Returns 200 when the app can:
//   1. Respond to a request at all
//   2. Reach Supabase (via the service-role client) with a minimal query
//
// Returns 503 otherwise. No secrets, no PII, no auth required — but the
// response body is intentionally minimal so it's not useful for probing.
//
// DO NOT add auth to this route. Monitoring systems must be able to probe
// it without credentials. The data exposed (ok/degraded + timestamp) is
// already inferable from any HTTP request to the app.
// =============================================================================

interface HealthResponse {
  status: "ok" | "degraded"
  time: string
  checks: {
    db: "ok" | "fail"
  }
}

export async function GET() {
  const body: HealthResponse = {
    status: "ok",
    time: new Date().toISOString(),
    checks: {
      db: "fail",
    },
  }

  try {
    const admin = getSupabaseAdmin()
    // Cheapest possible check — HEAD-equivalent count on a tiny table.
    // `head: true` makes Supabase return only the count header without
    // actual row data.
    //
    // The 3s abort is load-bearing: during the 2026-09-09 Supabase outage
    // the database died at the TCP layer while the API gateway stayed up,
    // and this query hung indefinitely — so the route never answered,
    // Docker's healthcheck timed out, Traefik dropped the route, and the
    // site showed a bare 404 with nothing useful in a curl. With the
    // abort, a dead DB degrades to a prompt 503 instead.
    const { error } = await admin
      .from("users")
      .select("*", { count: "exact", head: true })
      .limit(1)
      .abortSignal(AbortSignal.timeout(3_000))

    if (!error) {
      body.checks.db = "ok"
    }
  } catch {
    // Leave body.checks.db = "fail" (thrown aborts land here too)
  }

  if (body.checks.db === "fail") {
    body.status = "degraded"
    return NextResponse.json(body, { status: 503 })
  }

  return NextResponse.json(body, {
    status: 200,
    headers: {
      // Short TTL so monitors see near-real-time state but upstreams don't
      // hammer the DB check for concurrent requests.
      "cache-control": "no-store",
    },
  })
}
