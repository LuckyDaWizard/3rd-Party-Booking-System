"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, ArrowRight, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useBookingStore } from "@/lib/booking-store"

export default function PaymentPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const bookingId = searchParams.get("bookingId") ?? ""
  const { discardBooking, setActiveBookingId } = useBookingStore()
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState("")
  const formRef = useRef<HTMLFormElement>(null)
  const [formData, setFormData] = useState<{
    paymentUrl: string
    formFields: Record<string, string>
  } | null>(null)

  useEffect(() => {
    if (bookingId) setActiveBookingId(bookingId)
  }, [bookingId, setActiveBookingId])

  // Auto-submit the hidden form once we have PayFast data
  useEffect(() => {
    if (formData && formRef.current) {
      formRef.current.submit()
    }
  }, [formData])

  async function handlePayWithPayfast() {
    if (processing) return
    setProcessing(true)
    setError("")

    try {
      const res = await fetch("/api/payfast/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? "Failed to initiate payment")
        setProcessing(false)
        return
      }

      // Set form data — the useEffect above will auto-submit
      setFormData(data)
    } catch {
      setError("Failed to connect to payment server")
      setProcessing(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      {/* Top bar */}
      <div className="flex items-center justify-between rounded-xl bg-white px-6 py-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const params = new URLSearchParams()
            if (bookingId) params.set("bookingId", bookingId)
            params.set("searchType", "id")
            params.set("step", "5")
            router.push(`/create-booking/patient-details?${params.toString()}`)
          }}
          className="gap-3 rounded-lg border-black px-6 py-2"
        >
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <Button
          size="sm"
          onClick={async () => {
            if (bookingId) await discardBooking(bookingId)
            router.push("/home")
          }}
          className="rounded-lg border-0 px-6 py-2 text-white hover:opacity-90"
          style={{ backgroundColor: "#FF3A69" }}
        >
          Discard Flow
        </Button>
      </div>

      {/* Content */}
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 py-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Payment</h1>
          <p className="text-base text-gray-500">Complete your booking payment securely via PayFast</p>
        </div>

        <div className="flex flex-col items-stretch gap-6 md:flex-row md:items-start md:gap-8">
          {/* Left — Payment info */}
          <div className="flex flex-1 flex-col gap-6">
            <div className="flex flex-col gap-4 rounded-xl bg-white p-6">
              <div className="flex items-center gap-3">
                <ShieldCheck className="size-6 text-green-500" />
                <h2 className="text-lg font-bold text-gray-900">Secure Payment</h2>
              </div>
              <p className="text-sm text-gray-500">
                You will be redirected to PayFast&apos;s secure payment page to complete your transaction.
                PayFast supports credit/debit cards, EFT, and other payment methods.
              </p>
              <ul className="flex flex-col gap-2 text-sm text-gray-600">
                <li className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-green-500" />
                  256-bit SSL encrypted
                </li>
                <li className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-green-500" />
                  PCI DSS compliant
                </li>
                <li className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-green-500" />
                  No card details stored on our servers
                </li>
              </ul>
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}
          </div>

          {/* Right — Payment summary */}
          <div className="w-full md:w-80 md:shrink-0">
            <div className="flex flex-col gap-6 rounded-xl bg-white p-6">
              <h2 className="text-xl font-bold text-gray-900">Payment Summary</h2>

              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Consultation Booking</span>
                  <span className="text-gray-500">R325.00</span>
                </div>
                <div className="border-t border-gray-100" />
                <div className="flex items-center justify-between text-sm font-semibold">
                  <span className="text-gray-900">Total</span>
                  <span className="text-gray-900">R325.00</span>
                </div>
              </div>

              <Button
                onClick={handlePayWithPayfast}
                disabled={processing}
                className={`h-12 w-full gap-2 rounded-xl text-base font-semibold transition-all ${
                  !processing
                    ? "bg-gray-900 text-white hover:bg-gray-800"
                    : "bg-gray-300 text-gray-500"
                }`}
              >
                {processing ? (
                  <>
                    Redirecting to PayFast...
                    <svg className="ml-1 size-4 animate-spin" viewBox="0 0 40 40" fill="none">
                      <circle cx="20" cy="20" r="15" stroke="#6b7280" strokeWidth="5" strokeLinecap="round" />
                      <circle cx="20" cy="20" r="15" stroke="white" strokeWidth="5" strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset="70" />
                    </svg>
                  </>
                ) : (
                  <>
                    Pay with PayFast
                    <ArrowRight className="size-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Hidden form for PayFast redirect */}
      {formData && (
        <form
          ref={formRef}
          action={formData.paymentUrl}
          method="POST"
          className="hidden"
        >
          {Object.entries(formData.formFields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
        </form>
      )}
    </div>
  )
}
