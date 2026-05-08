"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { PinVerificationModal } from "@/components/ui/pin-verification-modal"
import { useBookingStore } from "@/lib/booking-store"
import { useUnitStore } from "@/lib/unit-store"
import { useClientStore } from "@/lib/client-store"
import { useAuth } from "@/lib/auth-store"

// =============================================================================
// Terms & Conditions step (final step of the booking flow).
//
// Default behaviour (gateway bookings, or self-collect bookings handled by a
// `user` role): Accept → /home. The unit manager runs Start Consult later
// from Patient History.
//
// Self-collect short-circuit (system_admin / unit_manager only):
// Accept → persist acceptance → prompt for PIN → POST start-consultation →
// open the CareFirst redirect URL in a new tab → send the operator home.
// This collapses two clicks (Accept + Start Consult later) into one, since
// for self-collect the booking is already Payment Complete and there's no
// reason to wait.
//
// If the operator dismisses the PIN modal mid-handoff, acceptance is still
// persisted — they can complete Start Consult from Patient History later.
// =============================================================================

export default function TermsAndConditionsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const bookingId = searchParams.get("bookingId") ?? ""
  const { updateBooking, setActiveBookingId, getBooking, refreshBookings } = useBookingStore()
  const { units } = useUnitStore()
  const { clients } = useClientStore()
  const { activeUnitId, isSystemAdmin, isUnitManager } = useAuth()

  const booking = getBooking(bookingId)
  // Resolve the booking's parent client to read nurse_verification.
  // Falls back to TRUE — fail-safe: if we can't determine the client
  // (stores not yet loaded, missing rows), keep the PIN gate in
  // place. Only flips to FALSE when the client has explicitly
  // opted out.
  const nurseVerificationRequired = (() => {
    const unitId = booking?.unitId ?? activeUnitId
    if (!unitId) return true
    const unit = units.find((u) => u.id === unitId)
    if (!unit) return true
    const client = clients.find((c) => c.id === unit.clientId)
    if (!client) return true
    return client.nurseVerification
  })()
  const isSelfCollect = booking?.paymentType === "self_collect"
  const isMonthlyInvoice = booking?.paymentType === "monthly_invoice"
  // Auto-handoff applies to ALL non-gateway billing modes. For self-collect
  // the operator confirmed the cash payment; for monthly_invoice the
  // booking auto-completed without operator interaction. Either way the
  // consultation is paid-for and ready, so collapse the two clicks
  // (Accept + Start Consult later) into one PIN-gated handoff.
  // For a `user` role, the manager handles Start Consult from Patient
  // History — operators below manager can't authorise CareFirst handoff.
  const canAutoStartConsult =
    (isSelfCollect || isMonthlyInvoice) && (isSystemAdmin || isUnitManager)

  const [submitting, setSubmitting] = useState(false)
  const [pinOpen, setPinOpen] = useState(false)
  const [startConsultBusy, setStartConsultBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  // Tracks whether `runStartConsult` failed during this Accept cycle.
  // We use this to distinguish "user cancelled the PIN modal" (→ go home;
  // T&Cs are saved, manager will run Start Consult later) from
  // "PIN verified but the start-consultation API failed" (→ stay on
  // this page so the operator can see the error and decide what to do).
  // Reset on each fresh handleAccept attempt.
  const [startConsultFailed, setStartConsultFailed] = useState(false)

  useEffect(() => {
    if (bookingId) setActiveBookingId(bookingId)
  }, [bookingId, setActiveBookingId])

  async function persistAcceptance() {
    if (!bookingId) return
    await updateBooking(bookingId, {
      termsAccepted: true,
      termsAcceptedAt: new Date().toISOString(),
      currentStep: "terms",
    })
  }

  async function handleAccept() {
    if (submitting) return
    setSubmitting(true)
    setErrorMessage(null)
    setStartConsultFailed(false)
    try {
      await persistAcceptance()
      if (canAutoStartConsult) {
        // Self-collect short-circuit: hand off straight to CareFirst.
        // When the client requires nurse verification, prompt for PIN
        // first; otherwise call the handoff directly — runStartConsult
        // navigates home on success and stays on the page on failure.
        setSubmitting(false)
        if (nurseVerificationRequired) {
          setPinOpen(true)
        } else {
          await runStartConsult()
        }
        return
      }
      // Default: end of flow.
      setActiveBookingId(null)
      router.push("/home")
    } catch {
      setSubmitting(false)
      setErrorMessage("Failed to record acceptance. Please try again.")
    }
  }

  async function runStartConsult() {
    if (!bookingId) return
    setStartConsultBusy(true)
    setErrorMessage(null)
    setStartConsultFailed(false)
    try {
      const res = await fetch(`/api/bookings/${bookingId}/start-consultation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        redirectUrl?: string | null
        error?: string
      }
      if (!res.ok || !data.ok) {
        throw new Error(
          data.error ?? "Failed to start consultation. Please try again."
        )
      }
      await refreshBookings()
      if (data.redirectUrl) {
        window.open(data.redirectUrl, "_blank", "noopener,noreferrer")
      } else {
        // Soft-fail: handoff registered but no redirect URL came back.
        // Surface the warning but still navigate home — the booking is
        // marked Successful server-side and there's nothing else for
        // the operator to do here.
        setErrorMessage(
          "Consultation registered but CareFirst did not return a redirect URL. Please contact support."
        )
      }
      setActiveBookingId(null)
      router.push("/home")
    } catch (err) {
      // Hard failure — keep the operator on this page so they can read
      // the error and either retry (we re-allow Accept) or navigate
      // away manually. Don't re-throw: the PIN modal already closed
      // when verification succeeded; surfacing the error here is the
      // parent's job, not the modal's.
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to start consultation."
      )
      setStartConsultFailed(true)
    } finally {
      setStartConsultBusy(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6">
      <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
        VERSION 1.0.0
      </span>

      <h1 className="text-center text-2xl font-extrabold text-gray-900 sm:text-3xl">Terms and Conditions</h1>

      <p className="max-w-xl text-center text-base text-gray-500">
        By accepting these Terms and Conditions, you agree to use this web application and platform as set out
        therein and you consent and agree that we can display the information you upload onto the platform.
      </p>

      {canAutoStartConsult && (
        <p
          data-testid="self-collect-handoff-hint"
          className={`max-w-xl rounded-lg border px-4 py-3 text-center text-xs ${
            isMonthlyInvoice
              ? "border-blue-200 bg-blue-50 text-blue-900"
              : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          {isMonthlyInvoice
            ? nurseVerificationRequired
              ? "This client is billed monthly. After acceptance you'll be asked to enter your access PIN, then the consultation will open in a new tab."
              : "This client is billed monthly. After acceptance the consultation will open in a new tab."
            : nurseVerificationRequired
              ? "This is a self-collect booking. After acceptance you'll be asked to enter your access PIN, then the consultation will open in a new tab."
              : "This is a self-collect booking. After acceptance the consultation will open in a new tab."}
        </p>
      )}

      <div className="flex w-full max-w-sm flex-col gap-3">
        <Button
          data-testid="accept-button"
          onClick={handleAccept}
          disabled={submitting || startConsultBusy}
          className="h-12 w-full rounded-xl bg-gray-900 text-base font-semibold text-white hover:bg-gray-800 disabled:opacity-60"
        >
          {submitting || startConsultBusy ? "Working..." : "Accept"}
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

      {errorMessage && (
        <p
          data-testid="terms-error"
          className="max-w-xl rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-700"
        >
          {errorMessage}
        </p>
      )}

      {/* PIN verification — only used for the self-collect auto-handoff path */}
      <PinVerificationModal
        open={pinOpen}
        onOpenChange={(o) => {
          setPinOpen(o)
          // Three close paths:
          //   - User dismissed before verifying (cancel / X)
          //     → T&Cs are saved; manager can run Start Consult later.
          //       Send them home cleanly.
          //   - PIN verified, runStartConsult succeeded
          //     → runStartConsult already navigated home. No-op here.
          //   - PIN verified, runStartConsult failed
          //     → Stay on this page so the operator sees the error and
          //       can retry or navigate manually. DON'T navigate home.
          if (!o && !startConsultBusy && !startConsultFailed) {
            setActiveBookingId(null)
            router.push("/home")
          }
        }}
        activeUnitId={activeUnitId}
        heading="Enter your verification code to start the consultation"
        subtitle="This will hand off the patient's data to CareFirst Patient and be recorded in the audit log."
        onVerified={runStartConsult}
      />
    </div>
  )
}
