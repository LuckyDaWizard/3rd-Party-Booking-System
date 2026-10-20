// Sentry — edge runtime. Nothing in this app currently runs on the edge
// (Next 16's proxy runs on Node), but any future edge route gets the same
// POPIA scrubbing. Loaded from src/instrumentation.ts.
import * as Sentry from "@sentry/nextjs"
import { baseSentryOptions } from "./src/lib/sentry-shared"

Sentry.init(baseSentryOptions)
