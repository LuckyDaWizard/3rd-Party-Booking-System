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

        <h1 className="text-center text-2xl font-extrabold text-gray-900 sm:text-3xl">Payment Unsuccessful</h1>

        <p className="text-center text-base text-gray-500">
          The payment was unsuccessful. Please try again.
        </p>

        <Button
          onClick={() => router.push(`/create-booking/payment?bookingId=${bookingId}&type=device`)}
          className="h-12 w-full rounded-xl bg-gray-900 text-base font-semibold text-white hover:bg-gray-800 sm:w-64"
        >
          Try Again
        </Button>

        <Button
          variant="outline"
          onClick={() => {
            // TODO: send payment link flow
          }}
          className="h-12 w-full rounded-xl border border-black text-base font-semibold sm:w-64"
        >
          Send Payment Link
        </Button>

        <button
          type="button"
          onClick={() => router.push("/home")}
          className="text-sm font-semibold text-gray-700 hover:text-gray-900"
        >
          Back Home
        </button>
      </div>
    </div>
  )
}
