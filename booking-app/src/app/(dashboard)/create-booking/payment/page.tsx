"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, ArrowRight, ShieldCheck, Mail, CheckCircle, Pencil, Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
//
// Safety net: on mount we GET /api/bookings/[id]/payment-mode. If the booking
// belongs to a self-collect client, we render a "Confirm payment collected at
// unit" panel instead of the gateway UI. Patient-details step 5 already
// short-circuits self-collect bookings to /payment/success, but this catches
// stragglers — Resume Payment from Patient History, old bookmarks, or any
// caller that lands here for a self-collect booking.
// =============================================================================

export default function PaymentPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const bookingId = searchParams.get("bookingId") ?? ""
  const paymentType = (searchParams.get("type") ?? "device") as "device" | "link"
  const { discardBooking, setActiveBookingId, getBooking, updateBooking, refreshBookings } = useBookingStore()

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

  // Email-editing state (link mode only)
  const [editingEmail, setEditingEmail] = useState(false)
  const [emailDraft, setEmailDraft] = useState("")
  const [savingEmail, setSavingEmail] = useState(false)
  const [emailError, setEmailError] = useState("")

  // Payment-mode safety net. Resolved server-side from the booking's parent
  // client's `collect_payment_at_unit` flag. "checking" until the API
  // resolves; "gateway" is the default.
  const [paymentMode, setPaymentMode] =
    useState<"checking" | "gateway" | "self_collect" | "monthly_invoice">("checking")
  const [markingSelfCollect, setMarkingSelfCollect] = useState(false)
  const [selfCollectError, setSelfCollectError] = useState("")
  // Sub-flag from payment-mode endpoint. Same purpose as in
  // patient-details — skip /patient-metrics on the post-success
  // navigation when the parent client opts in.
  const [skipPatientMetrics, setSkipPatientMetrics] = useState(false)

  useEffect(() => {
    if (bookingId) setActiveBookingId(bookingId)
  }, [bookingId, setActiveBookingId])

  // Auto-submit the hidden form once we have PayFast data (device mode)
  useEffect(() => {
    if (formData && formRef.current) {
      formRef.current.submit()
    }
  }, [formData])

  // Resolve payment mode for this booking. If the parent client is set to
  // collect at unit, we render the self-collect confirm UI instead of the
  // PayFast button — even if the URL says ?type=device. The server is the
  // source of truth.
  //
  // Fall back to "gateway" on any failure (404 because bookingId is bogus,
  // 401 because session expired, network error, or 10s timeout). Better
  // to show the existing PayFast UI than to leave the user staring at a
  // spinner forever if the API is hanging.
  useEffect(() => {
    if (!bookingId) return
    let cancelled = false
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10_000)

    fetch(`/api/bookings/${bookingId}/payment-mode`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (cancelled) return
        if (!res.ok) {
          setPaymentMode("gateway")
          return
        }
        const data = (await res.json().catch(() => ({}))) as {
          mode?: "gateway" | "self_collect" | "monthly_invoice"
          skipPatientMetrics?: boolean
        }
        if (cancelled) return
        setPaymentMode(
          data.mode === "self_collect"
            ? "self_collect"
            : data.mode === "monthly_invoice"
              ? "monthly_invoice"
              : "gateway"
        )
        if (data.skipPatientMetrics) setSkipPatientMetrics(true)
      })
      .catch(() => {
        if (!cancelled) setPaymentMode("gateway")
      })
      .finally(() => clearTimeout(timeoutId))

    return () => {
      cancelled = true
      clearTimeout(timeoutId)
      controller.abort()
    }
  }, [bookingId])

  // Auto-skip safety net for monthly_invoice clients. If a user lands
  // here for a monthly-billed booking (Resume Payment from Patient
  // History, old bookmark, etc.), auto-mark and route past — they
  // never see the PayFast UI or the /payment/success countdown.
  const monthlyAutoSkipFiredRef = useRef(false)
  useEffect(() => {
    if (paymentMode !== "monthly_invoice" || !bookingId) return
    if (monthlyAutoSkipFiredRef.current) return
    monthlyAutoSkipFiredRef.current = true
    ;(async () => {
      try {
        const res = await fetch(
          `/api/bookings/${bookingId}/mark-monthly-invoice`,
          { method: "POST" }
        )
        if (!res.ok) {
          monthlyAutoSkipFiredRef.current = false
          // Fall through — render still shows the spinner; user can
          // refresh to retry. Failure here is rare (bookings already
          // checked the same flag at step 5 entry).
          return
        }
        await refreshBookings()
        // Skip /payment/success — no PayFast transaction was made.
        router.push(
          skipPatientMetrics
            ? `/create-booking/creating?bookingId=${bookingId}`
            : `/create-booking/patient-metrics?bookingId=${bookingId}`
        )
      } catch {
        monthlyAutoSkipFiredRef.current = false
      }
    })()
  }, [paymentMode, bookingId, refreshBookings, router, skipPatientMetrics])

  async function handleConfirmSelfCollect() {
    if (markingSelfCollect || !bookingId) return
    setMarkingSelfCollect(true)
    setSelfCollectError("")
    try {
      const res = await fetch(
        `/api/bookings/${bookingId}/mark-self-collect`,
        { method: "POST" }
      )
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
      }
      if (!res.ok || !data.ok) {
        setSelfCollectError(data.error ?? "Failed to mark booking as self-collect")
        setMarkingSelfCollect(false)
        return
      }
      // Refresh the booking-store so downstream pages see the booking's
      // new status + payment_type immediately.
      await refreshBookings()
      // Skip /payment/success — no PayFast transaction was made.
      router.push(
        skipPatientMetrics
          ? `/create-booking/creating?bookingId=${bookingId}`
          : `/create-booking/patient-metrics?bookingId=${bookingId}`
      )
    } catch {
      setSelfCollectError("Network error. Please try again.")
      setMarkingSelfCollect(false)
    }
  }

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

  function startEditingEmail() {
    setEmailDraft(patientEmail ?? "")
    setEditingEmail(true)
    setEmailError("")
    setSent(false) // if they're changing email, they'll need to send again
  }

  function cancelEditingEmail() {
    setEditingEmail(false)
    setEmailDraft("")
    setEmailError("")
  }

  async function saveEmail() {
    if (savingEmail) return
    const trimmed = emailDraft.trim()
    // Minimal email shape check — don't over-validate (user might need to
    // enter a perfectly valid address the regex rejects).
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailError("Please enter a valid email address")
      return
    }
    setSavingEmail(true)
    setEmailError("")
    try {
      await updateBooking(bookingId, { emailAddress: trimmed })
      setEditingEmail(false)
    } catch {
      setEmailError("Failed to update email. Please try again.")
    } finally {
      setSavingEmail(false)
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

      {/* Content — checking / monthly_invoice spinner / self-collect panel / gateway UI */}
      {paymentMode === "checking" && (
        <div className="mx-auto flex w-full max-w-4xl items-center justify-center py-12">
          <svg className="size-8 animate-spin text-gray-400" viewBox="0 0 40 40" fill="none">
            <circle cx="20" cy="20" r="15" stroke="#e5e7eb" strokeWidth="5" strokeLinecap="round" />
            <circle cx="20" cy="20" r="15" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset="70" />
          </svg>
        </div>
      )}

      {paymentMode === "monthly_invoice" && (
        <div
          data-testid="payment-monthly-invoice"
          className="mx-auto flex w-full max-w-4xl flex-col items-center gap-4 py-12 text-center"
        >
          <svg className="size-8 animate-spin text-gray-400" viewBox="0 0 40 40" fill="none">
            <circle cx="20" cy="20" r="15" stroke="#e5e7eb" strokeWidth="5" strokeLinecap="round" />
            <circle cx="20" cy="20" r="15" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset="70" />
          </svg>
          <span className="text-sm font-medium text-gray-700">
            This client is billed monthly — no payment needed. Continuing to the consultation...
          </span>
        </div>
      )}

      {paymentMode === "self_collect" && (
        <div
          data-testid="payment-self-collect"
          className="mx-auto flex w-full max-w-4xl flex-col gap-6 py-4"
        >
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
              Confirm payment collected at unit
            </h1>
            <p className="text-base text-gray-500">
              This client collects the consultation fee directly. Confirm
              that the patient has paid before continuing.
            </p>
          </div>

          <div className="flex flex-col gap-4 rounded-xl border border-amber-200 bg-amber-50 p-6">
            <span className="text-base font-bold text-gray-900">
              Self-collect payment
            </span>
            <p className="text-sm text-gray-700">
              Clicking <strong>Confirm &amp; Continue</strong> marks this
              booking as Payment Complete and skips the payment gateway.
              Make sure the consultation fee has been collected before
              proceeding.
            </p>

            {selfCollectError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {selfCollectError}
              </div>
            )}

            <Button
              data-testid="confirm-self-collect-button"
              onClick={handleConfirmSelfCollect}
              disabled={markingSelfCollect}
              className={`mt-2 h-12 w-full gap-2 rounded-xl text-base font-semibold transition-all sm:w-fit sm:px-8 ${
                !markingSelfCollect
                  ? "bg-gray-900 text-white hover:bg-gray-800"
                  : "bg-gray-300 text-gray-500"
              }`}
            >
              {markingSelfCollect ? (
                <>
                  Confirming...
                  <svg className="ml-1 size-4 animate-spin" viewBox="0 0 40 40" fill="none">
                    <circle cx="20" cy="20" r="15" stroke="#6b7280" strokeWidth="5" strokeLinecap="round" />
                    <circle cx="20" cy="20" r="15" stroke="white" strokeWidth="5" strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset="70" />
                  </svg>
                </>
              ) : (
                <>
                  Confirm &amp; Continue
                  <ArrowRight className="size-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Gateway UI — only when paymentMode is resolved as gateway. */}
      {paymentMode === "gateway" && (
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
                  <Mail className="size-6 text-[var(--client-primary)]" />
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

                  <div className="flex flex-col gap-2 rounded-lg bg-gray-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                        Sending to
                      </span>
                      {!editingEmail && (
                        <button
                          type="button"
                          onClick={startEditingEmail}
                          disabled={sending}
                          className="inline-flex items-center gap-1 text-xs font-medium text-[var(--client-primary)] hover:text-[var(--client-primary-80)] disabled:opacity-50"
                        >
                          <Pencil className="size-3" />
                          {patientEmail ? "Change" : "Add email"}
                        </button>
                      )}
                    </div>

                    {editingEmail ? (
                      <div className="flex flex-col gap-2">
                        {patientName && (
                          <span className="text-base font-medium text-gray-900">
                            {patientName}
                          </span>
                        )}
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Input
                            type="email"
                            value={emailDraft}
                            onChange={(e) => setEmailDraft(e.target.value)}
                            placeholder="recipient@example.com"
                            disabled={savingEmail}
                            autoFocus
                            className="bg-white"
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={saveEmail}
                              disabled={savingEmail || !emailDraft.trim()}
                              className="gap-1 rounded-lg bg-gray-900 text-xs text-white hover:bg-gray-800 disabled:opacity-50"
                            >
                              {savingEmail ? (
                                <svg className="size-3 animate-spin" viewBox="0 0 40 40" fill="none">
                                  <circle cx="20" cy="20" r="15" stroke="#6b7280" strokeWidth="5" strokeLinecap="round" />
                                  <circle cx="20" cy="20" r="15" stroke="white" strokeWidth="5" strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset="70" />
                                </svg>
                              ) : (
                                <Check className="size-3" />
                              )}
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={cancelEditingEmail}
                              disabled={savingEmail}
                              className="gap-1 rounded-lg border-gray-300 text-xs"
                            >
                              <X className="size-3" />
                              Cancel
                            </Button>
                          </div>
                        </div>
                        {emailError && (
                          <p className="text-xs font-medium text-red-600">{emailError}</p>
                        )}
                      </div>
                    ) : patientEmail ? (
                      <>
                        <span className="text-base font-medium text-gray-900">
                          {patientName || "Patient"}
                        </span>
                        <span className="text-sm text-gray-600">{patientEmail}</span>
                      </>
                    ) : (
                      <span className="text-sm text-red-600">
                        No patient email on file. Click &ldquo;Add email&rdquo; above to add one.
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
      )}

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
