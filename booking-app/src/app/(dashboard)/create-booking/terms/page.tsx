"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { useBookingStore } from "@/lib/booking-store"

// =============================================================================
// Terms & Conditions step (final step of the booking flow).
//
// Behaviour: Accept → persist acceptance + timestamp → redirect to
// /patient-history. The operator finds the booking at Payment Complete and
// clicks Start Consult from there when ready (PIN-gated as today).
//
// Auto-handoff used to fire here for managers on self-collect / monthly
// bookings; that's been removed by product decision — operators control
// the moment of handoff manually from Patient History.
// =============================================================================

export default function TermsAndConditionsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const bookingId = searchParams.get("bookingId") ?? ""
  const { updateBooking, setActiveBookingId } = useBookingStore()

  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (bookingId) setActiveBookingId(bookingId)
  }, [bookingId, setActiveBookingId])

  async function handleAccept() {
    if (submitting) return
    setSubmitting(true)
    setErrorMessage(null)
    try {
      if (bookingId) {
        await updateBooking(bookingId, {
          termsAccepted: true,
          termsAcceptedAt: new Date().toISOString(),
          currentStep: "terms",
        })
      }
      setActiveBookingId(null)
      router.push("/patient-history")
    } catch {
      setSubmitting(false)
      setErrorMessage("Failed to record acceptance. Please try again.")
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

      <div className="flex w-full max-w-sm flex-col gap-3">
        <Button
          data-testid="accept-button"
          onClick={handleAccept}
          disabled={submitting}
          className="h-12 w-full rounded-xl bg-gray-900 text-base font-semibold text-white hover:bg-gray-800 disabled:opacity-60"
        >
          {submitting ? "Working..." : "Accept"}
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
    </div>
  )
}
