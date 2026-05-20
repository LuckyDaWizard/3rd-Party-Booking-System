"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

// =============================================================================
// DesktopRow
//
// Desktop list-row container used on every dashboard list page. Hidden
// below md: (the mobile DataCard takes over); a CSS grid on md+.
//
// Consolidates the inline class string copied across 4 list pages:
//   hidden md:grid grid-cols-[...] items-center gap-X rounded-xl bg-white px-6 py-5
//
// Only the grid template + gap differ per page; everything else is the
// same. We pass the grid template as a CSS variable (not an arbitrary
// Tailwind value) so the template can vary at runtime without forcing
// Tailwind to safelist every possible column combination.
//
// Usage:
//   <DesktopRow
//     gridTemplate="160px 1fr 1fr 1fr 1fr 140px"
//     testId={`patient-row-${patient.id}`}
//   >
//     {statusBadge}
//     <div>Unit Name</div>
//     ...
//   </DesktopRow>
// =============================================================================

export interface DesktopRowProps {
  /** CSS grid-template-columns value, e.g. "160px 1fr 1fr 1fr 1fr 140px". */
  gridTemplate: string
  /** Tailwind gap class. Defaults to "gap-8". */
  gap?: string
  className?: string
  testId?: string
  children: React.ReactNode
}

export function DesktopRow({
  gridTemplate,
  gap = "gap-8",
  className,
  testId,
  children,
}: DesktopRowProps) {
  return (
    <div
      data-testid={testId}
      className={cn(
        "hidden items-center rounded-xl bg-white px-6 py-5 md:grid",
        gap,
        className
      )}
      style={{ gridTemplateColumns: gridTemplate }}
    >
      {children}
    </div>
  )
}
