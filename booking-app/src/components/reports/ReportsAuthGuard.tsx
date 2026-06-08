"use client"

import { useEffect, useState, type ReactNode } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-store"

/**
 * Report slugs that are intentionally publicly readable — i.e. specific
 * reports we want to share externally (e.g. with CareFirst's dev team or
 * with non-operator stakeholders). Match against the URL path; any
 * sub-path of an allowed slug is also allowed.
 *
 * Keep this list short. Default is auth-gated; entries here are
 * deliberate carve-outs and each one should be there for a reason.
 */
const PUBLIC_REPORT_SLUGS = [
  // Multi-client routing RFC — discussion document linked from the
  // status-update email to management and intended to be forwardable
  // to CareFirst's dev team. Reads fine without operator context.
  "multi-client-routing",
] as const

function isPublicReportPath(pathname: string): boolean {
  return PUBLIC_REPORT_SLUGS.some(
    (slug) =>
      pathname === `/reports/${slug}` || pathname.startsWith(`/reports/${slug}/`)
  )
}

/**
 * Auth gate for /reports/*. Children always render in the DOM (so server and
 * client trees match — no hydration mismatch). Once we know on the client
 * whether the user is signed in, we either:
 *
 *   - show the content (signed in OR on an explicitly-public report slug)
 *   - overlay a "Loading…" screen and redirect to /sign-in (anonymous)
 *
 * The `mounted` flag defers visibility decisions to after hydration. Before
 * that, server and client both render the children — identical HTML — so
 * React doesn't throw a hydration error.
 */
export function ReportsAuthGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)

  const isPublic = pathname ? isPublicReportPath(pathname) : false

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted || loading) return
    if (isPublic) return
    if (!user) {
      const next = encodeURIComponent(window.location.pathname)
      router.replace(`/sign-in?next=${next}`)
    }
  }, [mounted, user, loading, router, isPublic])

  // Before hydration, render the children so server and client match. After
  // hydration, if we know auth state and user is anonymous (AND the route
  // isn't on the public allow-list), swap to a redirect placeholder.
  if (mounted && !loading && !user && !isPublic) {
    return (
      <div
        style={{
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          color: "#64748b",
          fontFamily: "Roboto, system-ui, sans-serif",
        }}
      >
        Redirecting to sign-in…
      </div>
    )
  }

  return <>{children}</>
}
