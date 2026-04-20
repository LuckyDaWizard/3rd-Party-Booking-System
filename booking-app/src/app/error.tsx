"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { AlertTriangle } from "lucide-react"

// =============================================================================
// Global error boundary
//
// Catches unexpected runtime errors in any dashboard / auth route that
// propagate past page-level error handling. Renders a user-friendly message
// with a support contact so the user isn't left stranded on a broken UI.
//
// Next.js expects this file at app/error.tsx. It receives `error` and a
// `reset` function for trying the failing render again.
// =============================================================================

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error server-side on the terminal via console.error — the
    // Next.js dev/prod server will capture this. No Sentry wiring yet;
    // that lands with audit item #5.
    console.error("[Global error boundary] Caught:", error)
  }, [error])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4">
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <AlertTriangle className="size-16 text-[#FF3A69]" strokeWidth={1.5} />

        <h1 className="text-2xl font-extrabold text-gray-900 sm:text-3xl">
          Something went wrong
        </h1>

        <p className="text-base text-gray-500">
          An unexpected error occurred. Try again — if the problem
          continues, contact support and share the reference below.
        </p>

        {error.digest && (
          <p className="font-mono text-xs text-gray-400">
            Ref: {error.digest}
          </p>
        )}

        <div className="flex w-full flex-col gap-3">
          <Button
            onClick={reset}
            className="h-12 w-full rounded-xl bg-gray-900 text-base font-semibold text-white hover:bg-gray-800"
          >
            Try again
          </Button>
          <a
            href="mailto:lehlohonolom@firstcare.solutions?subject=CareFirst%20Booking%20-%20Unexpected%20error"
            className="text-sm font-medium text-[#3ea3db] hover:underline"
          >
            Contact support
          </a>
        </div>
      </div>
    </div>
  )
}
