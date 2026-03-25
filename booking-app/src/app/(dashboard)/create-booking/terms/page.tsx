"use client"

import { useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { useBookingStore } from "@/lib/booking-store"

export default function TermsAndConditionsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const bookingId = searchParams.get("bookingId") ?? ""
  const { updateBooking, setActiveBookingId } = useBookingStore()

  useEffect(() => {
    if (bookingId) setActiveBookingId(bookingId)
  }, [bookingId, setActiveBookingId])

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6">
      <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
        VERSION 1.0.0
      </span>

      <h1 className="text-3xl font-extrabold text-gray-900">Terms and Conditions</h1>

      <p className="max-w-xl text-center text-base text-gray-500">
        By accepting these Terms and Conditions, you agree to use this web application and platform as set out
        therein and you consent and agree that we can display the information you upload onto the platform.
      </p>

      <div className="flex w-full max-w-sm flex-col gap-3">
        <Button
          onClick={async () => {
            if (bookingId) {
              await updateBooking(bookingId, {
                termsAccepted: true,
                termsAcceptedAt: new Date().toISOString(),
                currentStep: "terms",
              })
              // Clear active booking — flow is complete
              setActiveBookingId(null)
            }
            router.push("/home")
          }}
          className="h-12 w-full rounded-xl bg-gray-900 text-base font-semibold text-white hover:bg-gray-800"
        >
          Accept
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
    </div>
  )
}
