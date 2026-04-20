"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-store"
import {
  IDLE_ACTIVITY_EVENTS,
  IDLE_TICK_MS,
  IDLE_TIMEOUT_MS,
  IDLE_WARNING_MS,
} from "@/lib/constants"
import { SessionIdleWarningModal } from "@/components/ui/session-idle-warning-modal"

// =============================================================================
// SessionIdleMonitor
//
// Tracks user activity (mouse, keyboard, scroll, touch) and enforces the
// idle-timeout policy defined in constants.ts. Two thresholds:
//
//   IDLE_WARNING_MS  → show the warning modal with a countdown
//   IDLE_TIMEOUT_MS  → sign the user out and redirect to /sign-in
//
// Mounted from the dashboard layout so it only runs on authenticated routes.
// It does not mount on /sign-in, /forgot-pin, or /reset-pin — those have no
// session to protect.
//
// A "Stay signed in" click inside the modal resets the idle clock. A "Sign
// out" click triggers an immediate signOut (via auth-store) so the user can
// leave the workstation cleanly.
//
// Why activity listeners and not Supabase's session expiry directly:
//   Supabase refresh tokens auto-renew as long as the tab is open — so
//   without explicit inactivity tracking, the session effectively never
//   expires. We want an EXPLICIT workstation-level idle policy, which is
//   what this component adds.
// =============================================================================

export function SessionIdleMonitor() {
  const { user, signOut } = useAuth()
  const router = useRouter()

  // Last time the user showed activity. Stored in a ref (not state) so that
  // changing it doesn't trigger re-renders on every mousemove.
  const lastActivityRef = useRef<number>(Date.now())

  const [showWarning, setShowWarning] = useState(false)
  const [remainingMs, setRemainingMs] = useState(IDLE_TIMEOUT_MS - IDLE_WARNING_MS)

  const resetIdle = useCallback(() => {
    lastActivityRef.current = Date.now()
    setShowWarning(false)
  }, [])

  const handleSignOutNow = useCallback(async () => {
    setShowWarning(false)
    try {
      await signOut()
    } finally {
      router.push("/sign-in")
    }
  }, [signOut, router])

  // Attach activity listeners. These run very frequently so they use a
  // ref-only update — no setState, no re-renders. Throttled to at most
  // one update per second since sub-second precision doesn't matter for
  // a 15-minute timeout.
  useEffect(() => {
    if (!user) return

    let lastTouched = 0
    const onActivity = () => {
      const now = Date.now()
      if (now - lastTouched < 1000) return
      lastTouched = now
      lastActivityRef.current = now
      // If the warning is currently showing, DON'T silently dismiss it —
      // the user must explicitly click "Stay signed in" to continue.
      // Otherwise a stray scroll in the background would hide the modal.
    }

    for (const evt of IDLE_ACTIVITY_EVENTS) {
      window.addEventListener(evt, onActivity, { passive: true })
    }
    return () => {
      for (const evt of IDLE_ACTIVITY_EVENTS) {
        window.removeEventListener(evt, onActivity)
      }
    }
  }, [user])

  // Periodic check: are we past the warning threshold? The timeout
  // threshold? Keeps the countdown fresh when the modal is visible.
  useEffect(() => {
    if (!user) return

    const interval = setInterval(() => {
      const idleMs = Date.now() - lastActivityRef.current

      if (idleMs >= IDLE_TIMEOUT_MS) {
        // Hit the hard timeout. Sign out immediately.
        clearInterval(interval)
        handleSignOutNow()
        return
      }

      if (idleMs >= IDLE_WARNING_MS) {
        setShowWarning(true)
        setRemainingMs(Math.max(0, IDLE_TIMEOUT_MS - idleMs))
      } else if (showWarning) {
        // User resumed activity mid-countdown (via Stay-signed-in click);
        // hide the modal.
        setShowWarning(false)
      }
    }, IDLE_TICK_MS)

    return () => clearInterval(interval)
  }, [user, showWarning, handleSignOutNow])

  if (!user) return null

  return (
    <SessionIdleWarningModal
      open={showWarning}
      remainingMs={remainingMs}
      onStaySignedIn={resetIdle}
      onSignOutNow={handleSignOutNow}
    />
  )
}
