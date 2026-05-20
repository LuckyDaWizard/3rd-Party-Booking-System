"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

// =============================================================================
// YesNoToggle
//
// Inline Yes / No radio pair used inside questions like "Would you like to
// script this to another email address". Renders two `<button>` elements
// side-by-side, each with a label and a circular indicator that fills with
// the active client accent when selected.
//
// Consolidates the two copy-pasted inline blocks at
//   booking-app/src/app/(dashboard)/create-booking/patient-details/page.tsx
// (Step 3 Contact Details + Step 4 Verify Details).
//
// Usage:
//   <YesNoToggle
//     value={contactInfo.scriptToAnotherEmail}
//     onChange={(v) => setContactInfo({ ...contactInfo, scriptToAnotherEmail: v })}
//   />
// =============================================================================

export interface YesNoToggleProps {
  value: boolean
  onChange: (value: boolean) => void
  /** Label for the truthy option. Defaults to "Yes". */
  yesLabel?: string
  /** Label for the falsy option. Defaults to "No". */
  noLabel?: string
  /** Optional override for the outer flex wrapper. */
  className?: string
  /** Render name for tests / a11y — added to each button as data-testid prefix. */
  testIdPrefix?: string
}

export function YesNoToggle({
  value,
  onChange,
  yesLabel = "Yes",
  noLabel = "No",
  className,
  testIdPrefix,
}: YesNoToggleProps) {
  return (
    <div className={cn("flex items-center gap-4", className)}>
      <Option
        active={value}
        label={yesLabel}
        onClick={() => onChange(true)}
        testId={testIdPrefix ? `${testIdPrefix}-yes` : undefined}
      />
      <Option
        active={!value}
        label={noLabel}
        onClick={() => onChange(false)}
        testId={testIdPrefix ? `${testIdPrefix}-no` : undefined}
      />
    </div>
  )
}

function Option({
  active,
  label,
  onClick,
  testId,
}: {
  active: boolean
  label: string
  onClick: () => void
  testId?: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      data-testid={testId}
      onClick={onClick}
      className="flex cursor-pointer items-center gap-2 text-sm text-ink"
    >
      {label}
      <span className="flex size-5 items-center justify-center rounded-full border-2 border-gray-300">
        {active && (
          <span className="size-3 rounded-full bg-[var(--client-primary)]" />
        )}
      </span>
    </button>
  )
}
