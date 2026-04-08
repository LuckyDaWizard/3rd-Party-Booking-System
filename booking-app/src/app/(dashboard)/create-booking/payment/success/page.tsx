"use client"

import { useEffect, useState, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useBookingStore } from "@/lib/booking-store"

export default function PaymentSuccessPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const bookingId = searchParams.get("bookingId") ?? ""
  const { completePayment, setActiveBookingId } = useBookingStore()
  const [countdown, setCountdown] = useState(10)
  const hasMarked = useRef(false)

  useEffect(() => {
    if (bookingId) setActiveBookingId(bookingId)

    // Mark payment as complete (once)
    if (!hasMarked.current && bookingId) {
      hasMarked.current = true
      completePayment(bookingId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId])

  useEffect(() => {
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
  }, [router, bookingId])

  const formatted = `00:${countdown.toString().padStart(2, "0")}`

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white p-4">
      <div className="flex w-full max-w-md flex-col items-center gap-6">
        <CheckCircle className="size-16 text-green-500" strokeWidth={1.5} />

        <h1 className="text-center text-2xl font-extrabold text-gray-900 sm:text-3xl">Payment Successful</h1>

        <p className="text-center text-base text-gray-500">
          The payment was successful. If not redirected in a few seconds use the button below.
        </p>

        <Button
          onClick={() => router.push(`/create-booking/patient-metrics?bookingId=${bookingId}`)}
          className="h-12 w-full rounded-xl bg-gray-900 text-base font-semibold text-white hover:bg-gray-800 sm:w-64"
        >
          Redirecting ({formatted})
        </Button>
      </div>
    </div>
  )
}
