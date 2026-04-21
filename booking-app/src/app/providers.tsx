"use client"

import { useEffect } from "react"
import { AuthProvider } from "@/lib/auth-store"
import {
  CSRF_HEADER_NAME,
  CSRF_PROTECTED_METHODS,
  getCsrfToken,
} from "@/lib/csrf"

// =============================================================================
// App-wide client providers.
//
// Installs a global fetch interceptor that attaches the CSRF token header
// to every state-changing request (POST/PUT/PATCH/DELETE). This pairs with
// the middleware in src/middleware.ts which validates the header against
// the cookie (double-submit cookie pattern — audit #14).
//
// The interceptor is a one-time monkey-patch of window.fetch. We do it here
// (not at module top level) because it has to run in the browser after
// React hydration. Running more than once would stack interceptors, so we
// guard with a marker property on window.
// =============================================================================

function installCsrfFetchInterceptor() {
  if (typeof window === "undefined") return
  const win = window as unknown as { __csrfFetchInstalled?: boolean }
  if (win.__csrfFetchInstalled) return
  win.__csrfFetchInstalled = true

  const originalFetch = window.fetch.bind(window)

  window.fetch = async (input, init) => {
    const method = (
      init?.method ??
      (typeof input !== "string" && !(input instanceof URL)
        ? (input as Request).method
        : "GET")
    ).toUpperCase()

    if (!CSRF_PROTECTED_METHODS.has(method)) {
      return originalFetch(input, init)
    }

    // Only attach the header to same-origin requests. We don't want to
    // leak the token to PayFast, CareFirst Patient, or any other
    // third-party service we call from the client.
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url

    try {
      const target = new URL(url, window.location.origin)
      if (target.origin !== window.location.origin) {
        return originalFetch(input, init)
      }
    } catch {
      // Unparseable URL — let fetch handle the error.
      return originalFetch(input, init)
    }

    const token = getCsrfToken()
    if (!token) {
      // No cookie yet — the middleware will set it on the response, so
      // subsequent requests will have it. Send this one without a token
      // so the original request surface (error messages, status codes)
      // remains unchanged. The middleware will 403 it, which matches
      // the intended behaviour.
      return originalFetch(input, init)
    }

    // Merge the header into whatever shape the caller passed. Handles
    // Headers instances, plain objects, and arrays of tuples.
    const mergedHeaders = new Headers(init?.headers)
    mergedHeaders.set(CSRF_HEADER_NAME, token)

    return originalFetch(input, {
      ...init,
      headers: mergedHeaders,
    })
  }
}

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    installCsrfFetchInterceptor()
  }, [])

  return <AuthProvider>{children}</AuthProvider>
}
