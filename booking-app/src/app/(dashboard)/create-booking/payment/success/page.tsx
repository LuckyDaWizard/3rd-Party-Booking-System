"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useBookingStore } from "@/lib/booking-store"

export default function PaymentSuccessPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const bookingId = searchParams.get("bookingId") ?? ""
  const { getBooking, setActiveBookingId, refreshBookings, completePayment } = useBookingStore()
  const [confirmed, setConfirmed] = useState(false)
  const [countdown, setCountdown] = useState(10)
  const pollCount = useRef(0)
  const hasMarkedFallback = useRef(false)

  useEffect(() => {
    if (bookingId) setActiveBookingId(bookingId)
  }, [bookingId, setActiveBookingId])

  // Poll for payment confirmation from the ITN callback.
  const checkStatus = useCallback(async () => {
    await refreshBookings()
  }, [refreshBookings])

  // Check if booking is confirmed via ITN
  const booking = getBooking(bookingId)
  const itnConfirmed = booking?.status === "Payment Complete"

  useEffect(() => {
    if (itnConfirmed && !confirmed) {
      setConfirmed(true)
    }
  }, [itnConfirmed, confirmed])

  // Poll every 2 seconds for up to 15 seconds, then fallback
  useEffect(() => {
    if (confirmed) return

    const interval = setInterval(async () => {
      pollCount.current += 1
      if (pollCount.current > 7) {
        // After ~15 seconds, ITN hasn't arrived — fallback to direct update.
        // This handles cases where PayFast can't reach our notify_url
        // (no public domain, firewall, etc).
        clearInterval(interval)
        if (!hasMarkedFallback.current && bookingId) {
          hasMarkedFallback.current = true
          await completePayment(bookingId)
        }
        setConfirmed(true)
        return
      }
      checkStatus()
    }, 2000)

    return () => clearInterval(interval)
  }, [confirmed, checkStatus, bookingId, completePayment])

  // Countdown to redirect once confirmed
  useEffect(() => {
    if (!confirmed) return

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
  }, [confirmed, router, bookingId])

  const formatted = `00:${countdown.toString().padStart(2, "0")}`

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white p-4">
      <div className="flex w-full max-w-md flex-col items-center gap-6">
        {confirmed ? (
          <>
            <CheckCircle className="size-16 text-green-500" strokeWidth={1.5} />
            <h1 className="text-center text-2xl font-extrabold text-gray-900 sm:text-3xl">
              Payment Successful
            </h1>
            <p className="text-center text-base text-gray-500">
              The payment was successful. If not redirected in a few seconds use the button below.
            </p>
            <Button
              onClick={() => router.push(`/create-booking/patient-metrics?bookingId=${bookingId}`)}
              className="h-12 w-full rounded-xl bg-gray-900 text-base font-semibold text-white hover:bg-gray-800 sm:w-64"
            >
              Redirecting ({formatted})
            </Button>
          </>
        ) : (
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
      </div>
    </div>
  )
}
