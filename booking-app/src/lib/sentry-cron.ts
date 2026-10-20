// =============================================================================
// sentry-cron.ts — server-only
//
// Wraps the routes the VPS crontab hits every 15 minutes
// (/etc/cron.d/booking-app → /usr/local/bin/booking-cron.sh). Only calls that
// carry the cron secret are instrumented; admin-triggered calls from the UI
// pass straight through.
//
//   - `monitor: true` → Sentry Cron check-ins (in_progress → ok / error).
//     Sentry alerts when a run fails OR when no check-in arrives at all —
//     the latter is what catches a dead crontab, a down container or an
//     unreachable database (the 2026-10-17 → 20 outage went 3 days unseen).
//     The free Sentry plan includes one cron monitor, so only the PayFast
//     reconcile route (money path + best "is the app alive" canary) uses it.
//   - unmonitored routes → a failed run is captured as an issue grouped by
//     ["cron-failure", slug], which triggers the normal alert email.
//     (Monitored routes alert through the monitor only; thrown exceptions
//     are captured by onRequestError, so they aren't reported twice.)
//
// Our routes return error responses rather than throwing, so success is
// judged from the response: HTTP >= 400, `ok: false`, or a non-empty
// `errors` object (cleanup/sweep reports partial failure that way with 200).
// =============================================================================

import * as Sentry from "@sentry/nextjs"
import { isAuthorizedCronCall } from "./api-auth"

type RouteHandler = (request: Request) => Promise<Response>

const MONITOR_CONFIG = {
  schedule: { type: "crontab" as const, value: "*/15 * * * *" },
  timezone: "UTC",
  checkinMargin: 5, // minutes late before a run counts as missed
  maxRuntime: 5, // minutes before an in-progress run counts as timed out
  failureIssueThreshold: 2, // two bad runs in a row (30 min) before alerting
  recoveryThreshold: 1,
}

export async function runFailed(res: Response): Promise<boolean> {
  if (res.status >= 400) return true
  try {
    const body = (await res.clone().json()) as { ok?: boolean; errors?: Record<string, unknown> }
    if (body.ok === false) return true
    return Boolean(body.errors && Object.keys(body.errors).length > 0)
  } catch {
    return false // non-JSON 2xx — treat as success
  }
}

function reportCronFailure(slug: string, detail: string | number): void {
  Sentry.captureMessage(`Cron job ${slug} failed (${detail})`, {
    level: "error",
    tags: { cron_job: slug },
    fingerprint: ["cron-failure", slug],
  })
}

export function withCronMonitor(
  slug: string,
  handler: RouteHandler,
  opts: { monitor?: boolean } = {}
): RouteHandler {
  return async (request: Request) => {
    if (!isAuthorizedCronCall(request)) return handler(request)

    const started = Date.now()
    const checkInId = opts.monitor
      ? Sentry.captureCheckIn({ monitorSlug: slug, status: "in_progress" }, MONITOR_CONFIG)
      : undefined
    const finish = (status: "ok" | "error") => {
      if (checkInId) {
        Sentry.captureCheckIn({
          checkInId,
          monitorSlug: slug,
          status,
          duration: (Date.now() - started) / 1000,
        })
      }
    }

    try {
      const res = await handler(request)
      const failed = await runFailed(res)
      // A monitored job alerts via the monitor (which honours
      // failureIssueThreshold) — a separate issue would bypass that.
      if (failed && !opts.monitor) reportCronFailure(slug, res.status)
      finish(failed ? "error" : "ok")
      return res
    } catch (err) {
      // Not reported here: onRequestError (src/instrumentation.ts) already
      // captures the thrown exception.
      finish("error")
      throw err
    }
  }
}
