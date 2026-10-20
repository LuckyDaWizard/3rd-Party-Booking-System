// Sentry — Node.js server runtime (API routes, server components, proxy).
// Loaded from src/instrumentation.ts. All privacy rules — including
// stack-frame local variables being off — live in src/lib/sentry-shared.ts.
import * as Sentry from "@sentry/nextjs"
import { baseSentryOptions } from "./src/lib/sentry-shared"

Sentry.init(baseSentryOptions)
