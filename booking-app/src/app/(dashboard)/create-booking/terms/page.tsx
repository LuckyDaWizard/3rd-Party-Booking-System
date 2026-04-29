"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { PinVerificationModal } from "@/components/ui/pin-verification-modal"
import { useBookingStore } from "@/lib/booking-store"
import { useAuth } from "@/lib/auth-store"

export default function TermsAndConditionsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const bookingId = searchParams.get("bookingId") ?? ""
  const { updateBooking, setActiveBookingId, getBooking, refreshBookings } = useBookingStore()
  const { activeUnitId, isSystemAdmin, isUnitManager } = useAuth()

  const booking = getBooking(bookingId)
  const isSelfCollect = booking?.paymentType === "self_collect"
  // Auto-handoff is only available to operators who can authorise it.
  // For a `user` role, the manager handles Start Consult from Patient History.
  const canAutoStartConsult = isSelfCollect && (isSystemAdmin || isUnitManager)

  const [submitting, setSubmitting] = useState(false)
  const [pinOpen, setPinOpen] = useState(false)
  const [startConsultBusy, setStartConsultBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (bookingId) setActiveBookingId(bookingId)
  }, [bookingId, setActiveBookingId])

  async function persistAcceptance() {
    if (!bookingId) return
    await updateBooking(bookingId, {
      termsAccepted: true,
      termsAcceptedAt: new Date().toISOString(),
      currentStep: "terms",
    })
  }

  async function handleAccept() {
    if (submitting) return
    setSubmitting(true)
    setErrorMessage(null)
    try {
      await persistAcceptance()
      if (canAutoStartConsult) {
        // Self-collect short-circuit: prompt for PIN, then hand off straight
        // to CareFirst. Operator otherwise has to navigate to Patient History
        // and click Start Consult separately.
        setPinOpen(true)
        setSubmitting(false)
        return
      }
      // Default: end of flow.
      setActiveBookingId(null)
      router.push("/home")
    } catch {
      setSubmitting(false)
      setErrorMessage("Failed to record acceptance. Please try again.")
    }
  }

  async function runStartConsult() {
    if (!bookingId) return
    setStartConsultBusy(true)
    setErrorMessage(null)
    try {
      const res = await fetch(`/api/bookings/${bookingId}/start-consultation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        redirectUrl?: string | null
        error?: string
      }
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to start consultation. Please try again.")
      }
      await refreshBookings()
      if (data.redirectUrl) {
        window.open(data.redirectUrl, "_blank", "noopener,noreferrer")
      } else {
        setErrorMessage(
          "Consultation registered but CareFirst did not return a redirect URL. Please contact support."
        )
      }
      setActiveBookingId(null)
      router.push("/home")
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to start consultation."
      )
      throw err
    } finally {
      setStartConsultBusy(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6">
      <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
        VERSION 1.0.0
      </span>

      <h1 className="text-center text-2xl font-extrabold text-gray-900 sm:text-3xl">Terms and Conditions</h1>

      <p className="max-w-xl text-center text-base text-gray-500">
        By accepting these Terms and Conditions, you agree to use this web application and platform as set out
        therein and you consent and agree that we can display the information you upload onto the platform.
      </p>

      {canAutoStartConsult && (
        <p
          data-testid="self-collect-handoff-hint"
          className="max-w-xl rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-center text-xs text-amber-900"
        >
          This is a self-collect booking. After acceptance you&apos;ll be asked to
          enter your access PIN, then the consultation will open in a new tab.
        </p>
      )}

      <div className="flex w-full max-w-sm flex-col gap-3">
        <Button
          data-testid="accept-button"
          onClick={handleAccept}
          disabled={submitting || startConsultBusy}
          className="h-12 w-full rounded-xl bg-gray-900 text-base font-semibold text-white hover:bg-gray-800 disabled:opacity-60"
        >
          {submitting || startConsultBusy ? "Working..." : "Accept"}
        </Button>

        <a
          href="https://carefirst.co.za/terms-and-conditions/"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button
            variant="outline"
            className="h-12 w-full rounded-xl border border-black text-base font-semibold"
          >
            View full T&apos;s and C&apos;s
          </Button>
        </a>
      </div>

      {errorMessage && (
        <p
          data-testid="terms-error"
          className="max-w-xl rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-700"
        >
          {errorMessage}
        </p>
      )}

      {/* PIN verification — only used for the self-collect auto-handoff path */}
      <PinVerificationModal
        open={pinOpen}
        onOpenChange={(o) => {
          setPinOpen(o)
          // If the operator dismisses the PIN modal, the booking is still
          // marked Payment Complete and T&Cs accepted — they can always run
          // Start Consult from Patient History later. Just send them home.
          if (!o && !startConsultBusy) {
            setActiveBookingId(null)
            router.push("/home")
          }
        }}
        activeUnitId={activeUnitId}
        heading="Enter your verification code to start the consultation"
        subtitle="This will hand off the patient's data to CareFirst Patient and be recorded in the audit log."
        onVerified={runStartConsult}
      />
    </div>
  )
}
