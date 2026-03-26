"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, ArrowRight, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useBookingStore } from "@/lib/booking-store"

function FloatingInput({
  id,
  label,
  value,
  onChange,
  onClear,
  className = "",
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  onClear: () => void
  className?: string
}) {
  const hasValue = value.length > 0

  return (
    <div className={`relative ${className}`}>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder=" "
        className="peer h-14 w-full rounded-lg border border-gray-300 bg-white px-4 py-4 text-sm text-gray-900 outline-none transition-colors focus:border-gray-900 focus:bg-white"
      />
      <label
        htmlFor={id}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 bg-white px-1 text-sm text-gray-400 transition-all peer-focus:top-0 peer-focus:-translate-y-1/2 peer-focus:text-xs peer-focus:text-gray-500 peer-[:not(:placeholder-shown)]:top-0 peer-[:not(:placeholder-shown)]:-translate-y-1/2 peer-[:not(:placeholder-shown)]:text-xs peer-[:not(:placeholder-shown)]:text-gray-500"
      >
        {label}
      </label>
      {hasValue && (
        <button
          type="button"
          onClick={onClear}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  )
}

export default function PaymentPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const bookingId = searchParams.get("bookingId") ?? ""
  const { discardBooking, setActiveBookingId } = useBookingStore()

  useEffect(() => {
    if (bookingId) setActiveBookingId(bookingId)
  }, [bookingId, setActiveBookingId])

  const [nameOnCard, setNameOnCard] = useState("")
  const [cardNumber, setCardNumber] = useState("")
  const [expiryDate, setExpiryDate] = useState("")
  const [cvv, setCvv] = useState("")

  const isFormValid =
    nameOnCard.trim() !== "" &&
    cardNumber.trim() !== "" &&
    expiryDate.trim() !== "" &&
    cvv.trim() !== ""

  // TODO: PAYMENT GATEWAY INTEGRATION REQUIRED
  // Currently using mock responses that alternate between success/failure.
  // Replace with actual payment gateway (e.g., PayGate, Peach Payments, Stripe)
  // when ready. The success/failed pages are already built at:
  // - /create-booking/payment/success
  // - /create-booking/payment/failed
  const payAttemptRef = useRef(0)

  function handlePay() {
    if (!isFormValid) return
    payAttemptRef.current += 1
    // Alternate between success and failure for demo purposes
    if (payAttemptRef.current % 2 === 1) {
      router.push(`/create-booking/payment/success?bookingId=${bookingId}`)
    } else {
      router.push(`/create-booking/payment/failed?bookingId=${bookingId}`)
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

      {/* Developer Note */}
      <div className="rounded-xl border border-amber-300 bg-amber-50 px-6 py-4">
        <p className="text-sm text-amber-800">
          <strong>Developer Note:</strong> No payment gateway is integrated yet. Payments alternate between success and failure for demo purposes. Integrate a payment gateway (e.g., PayGate, Peach Payments, Stripe) before going live.
        </p>
      </div>

      {/* Content */}
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 py-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold text-gray-900">Enter payment details</h1>
          <p className="text-base text-gray-500">Please enter the payment details</p>
        </div>

        <div className="flex items-start gap-8">
          {/* Left - Card form */}
          <div className="flex flex-1 flex-col gap-6">
            <FloatingInput
              id="nameOnCard"
              label="Name on Card"
              value={nameOnCard}
              onChange={setNameOnCard}
              onClear={() => setNameOnCard("")}
            />
            <FloatingInput
              id="cardNumber"
              label="Card Number"
              value={cardNumber}
              onChange={(v) => {
                // Format card number with spaces
                const cleaned = v.replace(/\D/g, "").slice(0, 16)
                const formatted = cleaned.replace(/(\d{4})(?=\d)/g, "$1 ")
                setCardNumber(formatted)
              }}
              onClear={() => setCardNumber("")}
            />
            <div className="grid grid-cols-2 gap-6">
              <FloatingInput
                id="expiryDate"
                label="Expiry Date"
                value={expiryDate}
                onChange={(v) => {
                  const cleaned = v.replace(/\D/g, "").slice(0, 4)
                  if (cleaned.length >= 3) {
                    setExpiryDate(cleaned.slice(0, 2) + " / " + cleaned.slice(2))
                  } else {
                    setExpiryDate(cleaned)
                  }
                }}
                onClear={() => setExpiryDate("")}
              />
              <FloatingInput
                id="cvv"
                label="CVV"
                value={cvv}
                onChange={(v) => setCvv(v.replace(/\D/g, "").slice(0, 3))}
                onClear={() => setCvv("")}
              />
            </div>
            <p className="text-xs text-gray-400">
              Under no circumstances do we store your card information for security reasons.
            </p>
          </div>

          {/* Right - Payment Summary */}
        <div className="w-80 shrink-0">
          <div className="flex flex-col gap-6 rounded-xl bg-white p-6">
            <h2 className="text-xl font-bold text-gray-900">Payment Summary</h2>

            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">{"{bundle_name/service_type}"}</span>
                <span className="text-gray-500">{"{amount}"}</span>
              </div>
              <div className="flex items-center justify-between text-sm font-semibold">
                <span className="text-gray-900">Total</span>
                <span className="text-gray-900">{"{amount}"}</span>
              </div>
            </div>

            <Button
              onClick={handlePay}
              disabled={!isFormValid}
              className={`h-12 w-full gap-2 rounded-xl text-base font-semibold transition-all ${
                isFormValid
                  ? "bg-gray-900 text-white hover:bg-gray-800"
                  : "bg-gray-300 text-gray-500 cursor-default"
              }`}
            >
              Pay
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
        </div>
      </div>
    </div>
  )
}
