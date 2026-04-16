"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, ArrowRight, ShieldCheck, Mail, CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useBookingStore } from "@/lib/booking-store"

// =============================================================================
// Payment page
//
// Two modes based on ?type=... query param (set by patient-details step 5):
//   type=device → "Pay with PayFast" button, auto-submit redirect to hosted PayFast
//   type=link   → "Send Payment Link" button, emails the patient a PayFast URL
//
// After a link is sent, user can continue to the next step (patient-metrics)
// without completing payment on this device.
// =============================================================================

export default function PaymentPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const bookingId = searchParams.get("bookingId") ?? ""
  const paymentType = (searchParams.get("type") ?? "device") as "device" | "link"
  const { discardBooking, setActiveBookingId, getBooking } = useBookingStore()

  const booking = getBooking(bookingId)
  const patientEmail = booking?.emailAddress ?? null
  const patientName = booking
    ? `${booking.firstNames ?? ""} ${booking.surname ?? ""}`.trim()
    : null

  // Device-mode state
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState("")
  const formRef = useRef<HTMLFormElement>(null)
  const [formData, setFormData] = useState<{
    paymentUrl: string
    formFields: Record<string, string>
  } | null>(null)

  // Link-mode state
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    if (bookingId) setActiveBookingId(bookingId)
  }, [bookingId, setActiveBookingId])

  // Auto-submit the hidden form once we have PayFast data (device mode)
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
      setFormData(data)
    } catch {
      setError("Failed to connect to payment server")
      setProcessing(false)
    }
  }

  async function handleSendPaymentLink() {
    if (sending || sent) return
    setSending(true)
    setError("")

    try {
      const res = await fetch("/api/payfast/send-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Failed to send payment link")
        setSending(false)
        return
      }
      setSent(true)
      setSending(false)
    } catch {
      setError("Network error. Please try again.")
      setSending(false)
    }
  }

  function handleContinue() {
    router.push(`/create-booking/patient-metrics?bookingId=${bookingId}`)
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
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
            {paymentType === "link" ? "Send Payment Link" : "Payment"}
          </h1>
          <p className="text-base text-gray-500">
            {paymentType === "link"
              ? "Email the patient a secure PayFast payment link."
              : "Complete your booking payment securely via PayFast."}
          </p>
        </div>

        <div className="flex flex-col items-stretch gap-6 md:flex-row md:items-start md:gap-8">
          {/* Left — Info */}
          <div className="flex flex-1 flex-col gap-6">
            <div className="flex flex-col gap-4 rounded-xl bg-white p-6">
              <div className="flex items-center gap-3">
                {paymentType === "link" ? (
                  <Mail className="size-6 text-[#3ea3db]" />
                ) : (
                  <ShieldCheck className="size-6 text-green-500" />
                )}
                <h2 className="text-lg font-bold text-gray-900">
                  {paymentType === "link" ? "Payment link by email" : "Secure Payment"}
                </h2>
              </div>

              {paymentType === "link" ? (
                <>
                  <p className="text-sm text-gray-500">
                    We&apos;ll email the patient a secure PayFast payment link. They can pay from any device at their convenience. Once payment is received, the booking status updates automatically.
                  </p>

                  <div className="flex flex-col gap-1 rounded-lg bg-gray-50 p-4">
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                      Sending to
                    </span>
                    {patientEmail ? (
                      <>
                        <span className="text-base font-medium text-gray-900">
                          {patientName || "Patient"}
                        </span>
                        <span className="text-sm text-gray-600">{patientEmail}</span>
                      </>
                    ) : (
                      <span className="text-sm text-red-600">
                        No patient email on file. Please go back and add an email before sending a link.
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <>
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
                </>
              )}
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {sent && paymentType === "link" && (
              <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-4">
                <CheckCircle className="mt-0.5 size-5 shrink-0 text-green-600" />
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-semibold text-gray-900">
                    Payment link sent
                  </span>
                  <span className="text-sm text-gray-600">
                    Emailed to <strong>{patientEmail}</strong>. The booking will automatically update to &ldquo;Payment Complete&rdquo; once the patient pays.
                  </span>
                </div>
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

              {paymentType === "link" ? (
                sent ? (
                  <Button
                    onClick={handleContinue}
                    className="h-12 w-full gap-2 rounded-xl bg-gray-900 text-base font-semibold text-white hover:bg-gray-800"
                  >
                    Continue
                    <ArrowRight className="size-4" />
                  </Button>
                ) : (
                  <Button
                    onClick={handleSendPaymentLink}
                    disabled={sending || !patientEmail}
                    className={`h-12 w-full gap-2 rounded-xl text-base font-semibold transition-all ${
                      !sending && patientEmail
                        ? "bg-gray-900 text-white hover:bg-gray-800"
                        : "bg-gray-300 text-gray-500"
                    }`}
                  >
                    {sending ? (
                      <>
                        Sending...
                        <svg className="ml-1 size-4 animate-spin" viewBox="0 0 40 40" fill="none">
                          <circle cx="20" cy="20" r="15" stroke="#6b7280" strokeWidth="5" strokeLinecap="round" />
                          <circle cx="20" cy="20" r="15" stroke="white" strokeWidth="5" strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset="70" />
                        </svg>
                      </>
                    ) : (
                      <>
                        Send Payment Link
                        <Mail className="size-4" />
                      </>
                    )}
                  </Button>
                )
              ) : (
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
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Hidden form for PayFast redirect (device mode only) */}
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
