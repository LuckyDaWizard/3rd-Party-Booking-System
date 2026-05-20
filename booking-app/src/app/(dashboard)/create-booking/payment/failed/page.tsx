"use client"

import { useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useBookingStore } from "@/lib/booking-store"

export default function PaymentFailedPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const bookingId = searchParams.get("bookingId") ?? ""
  const { setActiveBookingId } = useBookingStore()

  useEffect(() => {
    if (bookingId) setActiveBookingId(bookingId)
  }, [bookingId, setActiveBookingId])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white p-4">
      <div className="flex w-full max-w-md flex-col items-center gap-6">
        <XCircle className="size-16 text-[#FF3A69]" strokeWidth={1.5} />

        <h1 className="text-center text-2xl font-extrabold text-ink sm:text-3xl">Payment Unsuccessful</h1>

        <p className="text-center text-base text-ink-muted">
          The payment was unsuccessful. Please try again.
        </p>

        <Button
          onClick={() => router.push(`/create-booking/payment?bookingId=${bookingId}&type=device`)}
          variant="primary"
          size="cta-lg"
          className="w-full sm:w-64"
        >
          Try Again
        </Button>

        <button
          type="button"
          onClick={() => router.push("/home")}
          className="text-sm font-semibold text-ink hover:text-ink"
        >
          Back Home
        </button>
      </div>
    </div>
  )
}
