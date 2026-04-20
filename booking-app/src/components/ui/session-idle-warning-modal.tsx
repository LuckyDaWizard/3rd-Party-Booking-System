"use client"

import * as React from "react"
import { Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

// =============================================================================
// SessionIdleWarningModal
//
// Countdown dialog shown by SessionIdleMonitor when the user has been idle
// for IDLE_WARNING_MS. Two actions:
//
//   Stay signed in → resets the idle timer (no session token refresh needed
//                    because Supabase auto-refreshes the access token on
//                    activity; what matters is resetting our inactivity
//                    clock)
//   Sign out now   → signs out immediately and redirects to /sign-in
//
// The modal cannot be dismissed via escape/overlay click. The user must
// explicitly choose one of the two actions — silent dismissal would
// defeat the workstation-security purpose.
//
// showCloseButton={false} hides the × so there's no escape hatch other
// than the two explicit buttons.
// =============================================================================

interface Props {
  open: boolean
  remainingMs: number
  onStaySignedIn: () => void
  onSignOutNow: () => void | Promise<void>
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${seconds.toString().padStart(2, "0")}`
}

export function SessionIdleWarningModal({
  open,
  remainingMs,
  onStaySignedIn,
  onSignOutNow,
}: Props) {
  const [signingOut, setSigningOut] = React.useState(false)

  async function handleSignOut() {
    if (signingOut) return
    setSigningOut(true)
    try {
      await onSignOutNow()
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={() => {
        // Ignore attempts to close via overlay/escape. User must click
        // one of the explicit buttons.
      }}
    >
      <DialogContent
        data-testid="session-idle-modal"
        className="max-w-sm rounded-2xl p-6"
        showCloseButton={false}
      >
        <DialogHeader className="flex flex-col items-center gap-3 text-center">
          <Clock className="size-12 text-amber-500" strokeWidth={1.5} />
          <DialogTitle className="text-xl font-bold text-gray-900">
            You&apos;ll be signed out soon
          </DialogTitle>
          <p className="text-sm text-gray-500">
            You&apos;ve been inactive for a while. For your security, we&apos;ll sign
            you out automatically.
          </p>
        </DialogHeader>

        <div className="flex flex-col items-center gap-1 py-2">
          <p className="text-xs uppercase tracking-wider text-gray-400">
            Time remaining
          </p>
          <p
            className="font-mono text-3xl font-bold text-gray-900"
            data-testid="session-idle-countdown"
          >
            {formatCountdown(remainingMs)}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Button
            onClick={onStaySignedIn}
            disabled={signingOut}
            data-testid="session-idle-stay-signed-in"
            className="h-11 w-full rounded-xl bg-gray-900 text-white hover:bg-gray-800"
          >
            Stay signed in
          </Button>
          <Button
            variant="outline"
            onClick={handleSignOut}
            disabled={signingOut}
            data-testid="session-idle-sign-out"
            className="h-11 w-full rounded-xl border border-black"
          >
            {signingOut ? "Signing out..." : "Sign out now"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
