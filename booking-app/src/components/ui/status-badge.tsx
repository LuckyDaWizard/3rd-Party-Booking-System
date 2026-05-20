"use client"

import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

// =============================================================================
// StatusBadge
//
// Canonical status pill. Encapsulates the {bg, text} colour mapping that
// was previously copy-pasted into 4 `getStatusStyle()` helpers across the
// dashboard list pages. Knows about:
//
//   - Booking statuses (patient-history) — 5 cases.
//   - Entity statuses (user/unit/client-management) — 2 cases.
//   - Payment-Complete overrides for self-collect + monthly-invoice
//     bookings (amber / blue pills with relabel).
//
// Consolidates 4 inline mapping functions + 4 inline Badge renders.
//
// Usage:
//   <StatusBadge status={user.status} testId={`status-badge-${user.id}`} />
//
//   <StatusBadge
//     status={patient.status}
//     selfCollect={patient.selfCollect}
//     monthlyInvoice={patient.monthlyInvoice}
//     testId={`status-badge-${patient.id}`}
//   />
//
// The default label for "Abandoned" is "Incomplete Booking" and for
// "Successful" is "Booking Successful" — matching the existing user-facing
// strings on the patient-history list. Pass `label` to override.
// =============================================================================

type BookingStatus =
  | "Payment Complete"
  | "In Progress"
  | "Abandoned"
  | "Successful"
  | "Discarded"

type EntityStatus = "Active" | "Disabled"

export type StatusBadgeStatus = BookingStatus | EntityStatus

// Style + user-facing label for each status. Booking-statuses that show
// differently from their enum value (e.g. "Abandoned" → "Incomplete Booking")
// have their display label set here.
const STATUS_MAP: Record<StatusBadgeStatus, { style: string; label: string }> = {
  "Payment Complete": {
    style: "bg-yellow-100 text-yellow-800 border-transparent",
    label: "Payment Complete",
  },
  // System blue regardless of client theme — status meaning stays
  // visually identical across clients. The #CDE5F2 / #3ea3db pair is the
  // only brand-coloured status; the rest are semantic.
  "In Progress": {
    style: "bg-[#CDE5F2] text-[#3ea3db] border-transparent",
    label: "In Progress",
  },
  Abandoned: {
    style: "bg-[#FF3A69] text-white border-transparent",
    label: "Incomplete Booking",
  },
  Successful: {
    style: "bg-green-100 text-green-600 border-transparent",
    label: "Booking Successful",
  },
  Discarded: {
    style: "bg-gray-900 text-white border-transparent",
    label: "Discarded",
  },
  Active: {
    style: "bg-green-100 text-green-600 border-transparent",
    label: "Active",
  },
  Disabled: {
    style: "bg-yellow-100 text-yellow-800 border-transparent",
    label: "Disabled",
  },
}

// Payment-Complete sub-type overrides. Only applied when status === "Payment Complete".
const SELF_COLLECT_OVERRIDE = {
  style: "bg-amber-100 text-amber-800 border-transparent",
  label: "Self-Collect",
}

const MONTHLY_INVOICE_OVERRIDE = {
  style: "bg-blue-100 text-blue-800 border-transparent",
  label: "Monthly Invoice",
}

export interface StatusBadgeProps {
  status: StatusBadgeStatus
  /** When TRUE and status is "Payment Complete", renders the amber
   *  "Self-Collect" override pill. */
  selfCollect?: boolean
  /** When TRUE and status is "Payment Complete", renders the blue
   *  "Monthly Invoice" override pill. */
  monthlyInvoice?: boolean
  /** Optional override for the rendered text. Defaults to the
   *  status-specific label in STATUS_MAP. */
  label?: string
  /** Extra classes appended to the Badge — typically used to set width
   *  for the row-grid column. */
  className?: string
  /** data-testid passthrough. */
  testId?: string
}

export function StatusBadge({
  status,
  selfCollect,
  monthlyInvoice,
  label,
  className,
  testId,
}: StatusBadgeProps) {
  const isSelfCollect = Boolean(selfCollect) && status === "Payment Complete"
  const isMonthlyInvoice =
    Boolean(monthlyInvoice) && status === "Payment Complete"

  const entry = isSelfCollect
    ? SELF_COLLECT_OVERRIDE
    : isMonthlyInvoice
      ? MONTHLY_INVOICE_OVERRIDE
      : STATUS_MAP[status]

  return (
    <Badge
      data-testid={testId}
      data-self-collect={isSelfCollect ? "true" : undefined}
      data-monthly-invoice={isMonthlyInvoice ? "true" : undefined}
      className={cn(
        "w-full rounded-full border px-4 py-5 text-center text-xs font-medium",
        entry.style,
        className
      )}
    >
      {label ?? entry.label}
    </Badge>
  )
}
