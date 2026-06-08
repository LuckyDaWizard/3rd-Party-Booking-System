"use client"

import { useEffect, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-store"

/**
 * Auth gate for /reports/*. Children always render in the DOM (so server and
 * client trees match — no hydration mismatch). Once we know on the client
 * whether the user is signed in, we either:
 *
 *   - show the content (signed in)
 *   - overlay a "Loading…" screen and redirect to /sign-in (anonymous)
 *
 * The `mounted` flag defers visibility decisions to after hydration. Before
 * that, server and client both render the children — identical HTML — so
 * React doesn't throw a hydration error.
 */
export function ReportsAuthGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted || loading) return
    if (!user) {
      const next = encodeURIComponent(window.location.pathname)
      router.replace(`/sign-in?next=${next}`)
    }
  }, [mounted, user, loading, router])

  // Before hydration, render the children so server and client match. After
  // hydration, if we know auth state and user is anonymous, swap to a redirect
  // placeholder.
  if (mounted && !loading && !user) {
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
