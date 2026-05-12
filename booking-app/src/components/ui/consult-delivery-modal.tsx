"use client"

import * as React from "react"
import { Monitor, Mail } from "lucide-react"
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>How should the consultation be delivered?</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-gray-500">
          Choose how to send the CareFirst consultation link to{" "}
          <span className="font-semibold text-gray-700">{patientName}</span>.
          Either option records the consultation as started in the audit log.
        </p>

        <div className="mt-2 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => pick("device")}
            className="flex items-start gap-4 rounded-xl border border-gray-200 px-5 py-4 text-left transition-colors hover:border-[var(--client-primary)] hover:bg-[var(--client-primary-10)]"
          >
            <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--client-primary-10)] text-[var(--client-primary-90)]">
              <Monitor className="size-5" />
            </span>
            <span className="flex flex-col gap-1">
              <span className="text-base font-semibold text-gray-900">
                Start on this device
              </span>
              <span className="text-sm text-gray-500">
                Open the consultation in a new browser tab right now. The patient
                joins from this device.
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => !emailDisabled && pick("email")}
            disabled={emailDisabled}
            className="flex items-start gap-4 rounded-xl border border-gray-200 px-5 py-4 text-left transition-colors hover:border-[var(--client-primary)] hover:bg-[var(--client-primary-10)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-gray-200 disabled:hover:bg-transparent"
          >
            <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--client-primary-10)] text-[var(--client-primary-90)]">
              <Mail className="size-5" />
            </span>
            <span className="flex flex-col gap-1">
              <span className="text-base font-semibold text-gray-900">
                Send link via email
              </span>
              <span className="text-sm text-gray-500">
                {emailDisabled
                  ? "No email address on file for this booking — add one before using this option."
                  : `Email the consultation link to ${patientEmail}. The patient joins from their own device.`}
              </span>
            </span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
