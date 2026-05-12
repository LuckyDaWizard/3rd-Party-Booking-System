"use client"

import * as React from "react"
import { Monitor, Mail, ArrowRight } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

// =============================================================================
// ConsultDeliveryModal
//
// Two-option picker shown when the operator clicks "Select Option" on a
// Payment Complete booking. The operator chooses how to deliver the
// CareFirst consultation link to the patient:
//
//   1. "Start on this device" — open the SSO URL in a new tab on the
//      operator's machine. The current default.
//   2. "Send link via email" — email the SSO URL to the patient's
//      email address so they can join from their own device.
//
// The choice is returned via onSelect; the consuming page is responsible
// for the next step (PIN verification + handoff API call).
//
// "Send link via email" is disabled when the booking has no email on
// file — there'd be nowhere to send it.
// =============================================================================

export type ConsultDeliveryMode = "device" | "email"

export interface ConsultDeliveryModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Patient name for context in the modal title. */
  patientName: string
  /** Patient email — gates the email option when missing. */
  patientEmail: string | null
  /** Called with the chosen mode after the operator clicks an option. */
  onSelect: (mode: ConsultDeliveryMode) => void
}

export function ConsultDeliveryModal({
  open,
  onOpenChange,
  patientName,
  patientEmail,
  onSelect,
}: ConsultDeliveryModalProps) {
  const emailDisabled = !patientEmail || patientEmail.trim() === ""

  function pick(mode: ConsultDeliveryMode) {
    onOpenChange(false)
    onSelect(mode)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-2xl p-6 sm:max-w-xl">
        <DialogHeader className="flex flex-col items-center gap-1 text-center">
          <DialogTitle className="mx-4 text-xl font-bold text-gray-900">
            How should the consultation be delivered?
          </DialogTitle>
          <p className="text-sm text-gray-500">
            Choose how to send the CareFirst consultation link to{" "}
            <span className="font-semibold text-gray-700">{patientName}</span>.
            Either option records the consultation as started in the audit log.
          </p>
        </DialogHeader>

        <div className="mt-4 flex flex-col gap-3">
          <DeliveryOptionCard
            icon={<Monitor className="size-5" />}
            title="Start on this device"
            description="Open the consultation in a new browser tab right now. The patient joins from this device."
            onClick={() => pick("device")}
          />

          <DeliveryOptionCard
            icon={<Mail className="size-5" />}
            title="Send link via email"
            description={
              emailDisabled
                ? "No email address on file for this booking — add one before using this option."
                : `Email the consultation link to ${patientEmail}. The patient joins from their own device.`
            }
            disabled={emailDisabled}
            onClick={() => !emailDisabled && pick("email")}
          />
        </div>

        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="mt-2 text-sm font-medium text-[#FF3A69] hover:text-[#FF3A69]/80"
        >
          Cancel
        </button>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Single option card — matches the visual language of the booking-flow's
 * payment-type and (former) booking-type pickers: rounded-xl card, soft
 * border, brand-tinted icon chip, hover-to-accent border.
 */
function DeliveryOptionCard({
  icon,
  title,
  description,
  disabled,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  description: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`group flex w-full items-start gap-4 rounded-xl border px-5 py-4 text-left transition-colors ${
        disabled
          ? "cursor-not-allowed border-gray-200 bg-gray-50 opacity-60"
          : "border-gray-200 bg-white hover:border-[var(--client-primary)] hover:bg-[var(--client-primary-10)]"
      }`}
    >
      <span
        className={`mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full ${
          disabled
            ? "bg-gray-100 text-gray-400"
            : "bg-[var(--client-primary-10)] text-[var(--client-primary-90)] group-hover:bg-white"
        }`}
      >
        {icon}
      </span>
      <span className="flex flex-1 flex-col gap-1">
        <span className="flex items-center justify-between gap-3">
          <span className="text-base font-bold text-gray-900">{title}</span>
          {!disabled && (
            <ArrowRight className="size-4 shrink-0 text-gray-400 transition-colors group-hover:text-[var(--client-primary)]" />
          )}
        </span>
        <span className="text-sm leading-relaxed text-gray-500">
          {description}
        </span>
      </span>
    </button>
  )
}
