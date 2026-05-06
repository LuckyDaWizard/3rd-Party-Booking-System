"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { CheckCircle, Clock, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useBookingStore } from "@/lib/booking-store"

// =============================================================================
// Payment Success Page
//
// IMPORTANT: PayFast's ITN callback is the AUTHORITATIVE source of payment
// confirmation, but it's unreliable on HTTP-only deployments. To close that
// gap, while we poll the DB we ALSO call /api/payfast/reconcile — which
// queries PayFast's Transaction History API and updates the booking if a
// completed payment is found there. Neither this page nor the reconcile
// route ever fabricates a payment — PayFast's API is still the gatekeeper.
//
// States:
//   confirmed  → ITN arrived OR reconcile found a COMPLETE transaction.
//                Auto-redirect to patient-metrics.
//   pending    → Polling; no confirmation yet.
//   stalled    → POLL_TIMEOUT_MS elapsed with no confirmation. Tell the
//                user what to do. We do NOT mark the booking paid from the
//                browser.
//
// A system admin can still manually confirm from Patient History as a
// last-resort supervisor override.
// =============================================================================

const POLL_INTERVAL_MS = 3000
const POLL_TIMEOUT_MS = 60000 // 60s before showing the "stalled" state

type State = "pending" | "confirmed" | "stalled"

export default function PaymentSuccessPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const bookingId = searchParams.get("bookingId") ?? ""
  const { getBooking, setActiveBookingId, refreshBookings } = useBookingStore()
  const [state, setState] = useState<State>("pending")
  const [countdown, setCountdown] = useState(10)
  const startedAt = useRef(0)

  useEffect(() => {
    if (startedAt.current === 0) startedAt.current = Date.now()
    if (bookingId) setActiveBookingId(bookingId)
  }, [bookingId, setActiveBookingId])

  // Self-collect bookings have NO PayFast transaction to reconcile — the
  // mark-self-collect API has already set status="Payment Complete" before
  // we land here. Skip the reconcile call (which would otherwise burn a
  // PayFast Transaction History API request for a nonexistent payment) and
  // only refresh the local store. Resolved on first render via
  // booking-store; the polling effect will pick it up immediately.
  const isSelfCollectBooking = getBooking(bookingId)?.paymentType === "self_collect"

  // Poll for ITN-driven status change AND actively query PayFast's Query API
  // via our reconcile route. Reconcile is best-effort — failures are logged
  // but don't break the polling loop (DB poll will still catch ITN if it
  // eventually arrives). If we see the booking has become Payment Complete
  // (either via ITN or via reconcile), flip to the confirmed state here so
  // we don't need a separate set-state-in-effect.
  const checkStatus = useCallback(async () => {
    if (bookingId && !isSelfCollectBooking) {
      try {
        await fetch("/api/payfast/reconcile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bookingId }),
        })
      } catch (err) {
        console.warn("[payment/success] reconcile call failed:", err)
      }
    }
    await refreshBookings()
    const current = getBooking(bookingId)
    if (current?.status === "Payment Complete") {
      setState((s) => (s === "pending" ? "confirmed" : s))
    }
  }, [bookingId, isSelfCollectBooking, refreshBookings, getBooking])

  // Poll every POLL_INTERVAL_MS until confirmed or timed out. Kick off the
  // first check via a short timeout (not a synchronous call) so we don't
  // trip React's set-state-in-effect rule.
  useEffect(() => {
    if (state !== "pending") return

    const firstCheck = setTimeout(() => {
      checkStatus()
    }, 500)

    const interval = setInterval(() => {
      const elapsed = Date.now() - startedAt.current
      if (elapsed > POLL_TIMEOUT_MS) {
        clearInterval(interval)
        setState("stalled")
        return
      }
      checkStatus()
    }, POLL_INTERVAL_MS)

    return () => {
      clearTimeout(firstCheck)
      clearInterval(interval)
    }
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
              <circle cx="20" cy="20" r="15" stroke="var(--client-primary)" strokeWidth="5" strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset="70" />
            </svg>
            <h1 className="text-center text-2xl font-extrabold text-gray-900 sm:text-3xl">
              {isSelfCollectBooking ? "Recording Payment..." : "Confirming Payment..."}
            </h1>
            <p className="text-center text-base text-gray-500">
              {isSelfCollectBooking
                ? "Just a moment while we record this booking as paid."
                : "Please wait while we confirm your payment with PayFast. This usually takes a few seconds."}
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
