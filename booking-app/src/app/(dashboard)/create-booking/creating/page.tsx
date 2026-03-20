"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function CreatingBookingPage() {
  const router = useRouter()

  useEffect(() => {
    const timer = setTimeout(() => {
      router.push("/create-booking/terms")
    }, 6000)

    return () => clearTimeout(timer)
  }, [router])

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6">
      <p className="text-base text-gray-500">Please be patient</p>
      <h1 className="text-3xl font-extrabold text-gray-900">Creating Booking</h1>
      <svg className="size-12 animate-spin" viewBox="0 0 40 40" fill="none">
        <circle cx="20" cy="20" r="15" stroke="#d1d5db" strokeWidth="5" strokeLinecap="round" />
        <circle cx="20" cy="20" r="15" stroke="#3ea3db" strokeWidth="5" strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset="70" />
      </svg>
    </div>
  )
}
