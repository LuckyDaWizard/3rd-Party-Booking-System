"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { CheckCircle, Clock, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useBookingStore } from "@/lib/booking-store"

// =============================================================================
// Payment Success Page
//
// IMPORTANT: The PayFast ITN callback is the ONLY authoritative source of
// payment confirmation. This page polls the booking status — it does NOT
// mark the booking as paid itself.
//
// States:
//   confirmed  → ITN arrived, booking is "Payment Complete". Auto-redirect
//                to the next step (patient metrics).
//   pending    → Polling; ITN hasn't arrived yet.
//   stalled    → 30s elapsed and ITN still hasn't arrived. Show a clear
//                message instructing the user what to do. We do NOT mark
//                the booking as paid from the browser.
//
// A system admin can manually confirm the payment from Patient History if
// the ITN genuinely fails to arrive (e.g. during sandbox mode without a
// public domain).
// =============================================================================

const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS = 30000 // 30s before showing the "stalled" state

type State = "pending" | "confirmed" | "stalled"

export default function PaymentSuccessPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const bookingId = searchParams.get("bookingId") ?? ""
  const { getBooking, setActiveBookingId, refreshBookings } = useBookingStore()
  const [state, setState] = useState<State>("pending")
  const [countdown, setCountdown] = useState(10)
  const startedAt = useRef(Date.now())

  useEffect(() => {
    if (bookingId) setActiveBookingId(bookingId)
  }, [bookingId, setActiveBookingId])

  // Poll for ITN-driven status change.
  const checkStatus = useCallback(async () => {
    await refreshBookings()
  }, [refreshBookings])

  const booking = getBooking(bookingId)
  const itnConfirmed = booking?.status === "Payment Complete"

  // Transition to "confirmed" when the ITN arrives.
  useEffect(() => {
    if (itnConfirmed && state === "pending") {
      setState("confirmed")
    }
  }, [itnConfirmed, state])

  // Poll every 2 seconds until confirmed or timed out.
  useEffect(() => {
    if (state !== "pending") return

    const interval = setInterval(() => {
      const elapsed = Date.now() - startedAt.current
      if (elapsed > POLL_TIMEOUT_MS) {
        clearInterval(interval)
        setState("stalled")
        return
      }
      checkStatus()
    }, POLL_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [state, checkStatus])

  // Countdown to redirect, only once confirmed.
  useEffect(() => {
    if (state !== "confirmed") return

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          router.push(`/create-booking/patient-metrics?bookingId=${bookingId}`)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [state, router, bookingId])

  const formatted = `00:${countdown.toString().padStart(2, "0")}`

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white p-4">
      <div className="flex w-full max-w-md flex-col items-center gap-6">
        {state === "confirmed" && (
          <>
            <CheckCircle className="size-16 text-green-500" strokeWidth={1.5} />
            <h1 className="text-center text-2xl font-extrabold text-gray-900 sm:text-3xl">
              Payment Successful
            </h1>
            <p className="text-center text-base text-gray-500">
              Your payment has been confirmed. Redirecting to the next step.
            </p>
            <Button
              onClick={() => router.push(`/create-booking/patient-metrics?bookingId=${bookingId}`)}
              className="h-12 w-full rounded-xl bg-gray-900 text-base font-semibold text-white hover:bg-gray-800 sm:w-64"
            >
              Continue ({formatted})
            </Button>
          </>
        )}

        {state === "pending" && (
          <>
            <svg className="size-12 animate-spin" viewBox="0 0 40 40" fill="none">
              <circle cx="20" cy="20" r="15" stroke="#d1d5db" strokeWidth="5" strokeLinecap="round" />
              <circle cx="20" cy="20" r="15" stroke="#3ea3db" strokeWidth="5" strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset="70" />
            </svg>
            <h1 className="text-center text-2xl font-extrabold text-gray-900 sm:text-3xl">
              Confirming Payment...
            </h1>
            <p className="text-center text-base text-gray-500">
              Please wait while we confirm your payment with PayFast. This usually takes a few seconds.
            </p>
          </>
        )}

        {state === "stalled" && (
          <>
            <Clock className="size-16 text-amber-500" strokeWidth={1.5} />
            <h1 className="text-center text-2xl font-extrabold text-gray-900 sm:text-3xl">
              Awaiting Confirmation
            </h1>
            <p className="text-center text-base text-gray-500">
              Your payment may have been successful, but we haven&apos;t received confirmation from PayFast yet.
            </p>

            <div className="flex w-full flex-col gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
              <div className="flex items-start gap-2">
                <Info className="mt-0.5 size-5 shrink-0 text-blue-500" />
                <div className="text-sm text-gray-700">
                  <p className="font-medium text-gray-900">What to do next:</p>
                  <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
                    <li>Check your email for a PayFast receipt</li>
                    <li>If payment was successful, contact an administrator to confirm it manually</li>
                    <li>If payment failed or you&apos;re unsure, you can try again</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="flex w-full flex-col gap-3">
              <Button
                onClick={() => router.push("/patient-history")}
                className="h-12 w-full rounded-xl bg-gray-900 text-base font-semibold text-white hover:bg-gray-800"
              >
                Go to Patient History
              </Button>
              <Button
                variant="outline"
                onClick={() => router.push(`/create-booking/payment?bookingId=${bookingId}`)}
                className="h-12 w-full rounded-xl border border-black text-base font-semibold"
              >
                Try Payment Again
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
