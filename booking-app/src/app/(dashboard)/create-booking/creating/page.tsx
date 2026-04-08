"use client"

import { useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useBookingStore } from "@/lib/booking-store"

export default function CreatingBookingPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const bookingId = searchParams.get("bookingId") ?? ""
  const { updateBooking, setActiveBookingId } = useBookingStore()
  const hasUpdated = useRef(false)

  useEffect(() => {
    if (bookingId && !hasUpdated.current) {
      hasUpdated.current = true
      setActiveBookingId(bookingId)
      updateBooking(bookingId, { currentStep: "creating" })
    }

    const timer = setTimeout(() => {
      router.push(`/create-booking/terms?bookingId=${bookingId}`)
    }, 6000)

    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId])

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6">
      <p className="text-base text-gray-500">Please be patient</p>
      <h1 className="text-center text-2xl font-extrabold text-gray-900 sm:text-3xl">Creating Booking</h1>
      <svg className="size-12 animate-spin" viewBox="0 0 40 40" fill="none">
        <circle cx="20" cy="20" r="15" stroke="#d1d5db" strokeWidth="5" strokeLinecap="round" />
        <circle cx="20" cy="20" r="15" stroke="#3ea3db" strokeWidth="5" strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset="70" />
      </svg>
    </div>
  )
}
