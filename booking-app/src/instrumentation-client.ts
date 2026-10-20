// Sentry — browser. Session Replay is deliberately NOT enabled (POPIA: it
// would record patient details typed into forms). Events go through our own
// /monitoring route (src/app/monitoring/route.ts) so ad-blockers on staff
// machines don't drop them; that route forwards only to our own Sentry
// project and never passes cookies on. All privacy rules live in
// src/lib/sentry-shared.ts.
import * as Sentry from "@sentry/nextjs"
import { baseSentryOptions } from "@/lib/sentry-shared"

Sentry.init({
  ...baseSentryOptions,
  tunnel: "/monitoring",
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
