"use client"

import * as React from "react"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { PIN_LENGTH } from "@/lib/constants"

// =============================================================================
// PinVerificationModal
//
// Generic re-verification modal for high-trust actions. Prompts the current
// user (system_admin or unit_manager) to enter their 6-digit PIN. Verifies
// server-side via /api/verify/manager-pin. On success, calls onVerified().
//
// Use this before any destructive or privilege-changing action to:
//   - Prevent unattended-session abuse (admin left their screen unlocked)
//   - Add a second-factor feel to audit-logged actions
//   - Match the existing PIN-based two-person sign-off pattern
//
// Usage:
//   <PinVerificationModal
//     open={pinOpen}
//     onOpenChange={setPinOpen}
//     activeUnitId={activeUnitId}
//     heading="Confirm deletion"
//     subtitle="Enter your access PIN to delete this user."
//     onVerified={async () => { await deleteUser(userId) }}
//   />
//
// The heading and subtitle should describe WHAT the user is authorising.
// =============================================================================

export interface PinVerificationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onVerified: () => void | Promise<void>
  activeUnitId: string | null
  heading: string
  subtitle?: string
}

export function PinVerificationModal({
  open,
  onOpenChange,
  onVerified,
  activeUnitId,
  heading,
  subtitle,
}: PinVerificationModalProps) {
  const [code, setCode] = React.useState<string[]>(
    Array.from({ length: PIN_LENGTH }, () => "")
  )
  const [verifying, setVerifying] = React.useState(false)
  const [error, setError] = React.useState("")
  const refs = React.useRef<(HTMLInputElement | null)[]>([])

  React.useEffect(() => {
    if (open) {
      setCode(Array.from({ length: PIN_LENGTH }, () => ""))
      setError("")
      setVerifying(false)
      setTimeout(() => refs.current[0]?.focus(), 100)
    }
  }, [open])

  async function handleVerify() {
    if (verifying) return
    const pin = code.join("")
    if (pin.length !== PIN_LENGTH) return

    setVerifying(true)
    setError("")
    try {
      const res = await fetch("/api/verify/manager-pin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pin, unitId: activeUnitId }),
      })
      const data = (await res.json().catch(() => ({}))) as { valid?: boolean }
      if (!res.ok || !data.valid) {
        setError("Invalid verification code")
        setCode(Array.from({ length: PIN_LENGTH }, () => ""))
        setTimeout(() => refs.current[0]?.focus(), 50)
        return
      }

      // Verified — call the action through.
      await onVerified()
      onOpenChange(false)
    } catch {
      setError("Network error. Please try again.")
    } finally {
      setVerifying(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!verifying) onOpenChange(o)
      }}
    >
      <DialogContent className="max-w-sm rounded-2xl p-6">
        <DialogHeader className="flex flex-col items-center gap-1 text-center">
          <DialogTitle className="mx-4 text-xl font-bold text-gray-900">
            {heading}
          </DialogTitle>
          {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 pt-3">
          {/* 6-digit code inputs */}
          <div className="flex w-full items-center justify-between">
            {code.map((digit, index) => (
              <input
                key={index}
                ref={(el) => {
                  refs.current[index] = el
                }}
                type="password"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                disabled={verifying}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "")
                  const newCode = [...code]
                  newCode[index] = val
                  setCode(newCode)
                  if (val && index < PIN_LENGTH - 1) {
                    refs.current[index + 1]?.focus()
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Backspace" && !digit && index > 0) {
                    refs.current[index - 1]?.focus()
                  }
                }}
                className="size-10 rounded-lg border border-gray-300 bg-gray-100 text-center text-base font-medium text-gray-900 outline-none transition-colors focus:border-gray-900 focus:bg-white disabled:opacity-50 sm:size-11"
              />
            ))}
          </div>

          {error && (
            <p className="text-center text-sm font-medium text-[#FF3A69]">
              {error}
            </p>
          )}

          <Button
            disabled={code.some((d) => !d) || verifying}
            onClick={handleVerify}
            className="h-11 w-full rounded-xl bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {verifying ? (
              <>
                Verifying...
                <svg className="ml-1 size-4 animate-spin" viewBox="0 0 40 40" fill="none">
                  <circle cx="20" cy="20" r="15" stroke="#6b7280" strokeWidth="5" strokeLinecap="round" />
                  <circle cx="20" cy="20" r="15" stroke="white" strokeWidth="5" strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset="70" />
                </svg>
              </>
            ) : (
              <>
                Continue
                <ArrowRight className="ml-1 size-4" />
              </>
            )}
          </Button>

          <button
            type="button"
            onClick={() => {
              if (!verifying) onOpenChange(false)
            }}
            disabled={verifying}
            className="text-sm font-medium text-[#FF3A69] hover:text-[#FF3A69]/80 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
