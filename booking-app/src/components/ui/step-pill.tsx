"use client"

import * as React from "react"
import { CheckCircle, FileText } from "lucide-react"
import { cn } from "@/lib/utils"

// =============================================================================
// StepPill
//
// Step indicator pill used in multi-step flows. Three states:
//
//   - active     → soft client-accent fill + accent text + FileText icon
//   - completed  → soft green fill + green text + CheckCircle icon
//   - inactive   → no fill + gray text + FileText icon
//
// Consolidates two inline copies:
//   - patient-details booking flow (4 steps, .map() over STEP_LABELS)
//   - client-management Add wizard (4 hand-rolled <div>s, lines 1322-1383)
//
// Usage:
//   <StepPill state="completed">Basic Info</StepPill>
//   <StepPill state="active">Payment Type</StepPill>
//   <StepPill state="inactive">Verification</StepPill>
// =============================================================================

export type StepPillState = "active" | "completed" | "inactive"

export interface StepPillProps {
  state: StepPillState
  /** Step label. */
  children: React.ReactNode
  /** Optional override of the icon. Defaults: CheckCircle for completed,
   *  FileText otherwise. */
  icon?: React.ComponentType<{ className?: string }>
  /** Extra classes appended to the outer pill. */
  className?: string
  /** data-testid passthrough. */
  testId?: string
}

const STATE_STYLES: Record<StepPillState, string> = {
  active: "bg-[var(--client-primary-10)] text-[var(--client-primary)]",
  completed: "bg-green-100 text-green-500",
  inactive: "text-gray-400",
}

export function StepPill({
  state,
  children,
  icon,
  className,
  testId,
}: StepPillProps) {
  const Icon = icon ?? (state === "completed" ? CheckCircle : FileText)
  return (
    <div
      data-testid={testId}
      className={cn(
        "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
        STATE_STYLES[state],
        className
      )}
    >
      <Icon className="size-4" />
      {children}
    </div>
  )
}
