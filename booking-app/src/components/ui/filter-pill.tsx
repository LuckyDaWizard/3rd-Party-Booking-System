"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

// =============================================================================
// FilterPill
//
// List-page filter chip: a white card with a colour-coded count badge on the
// left and a label on the right. Used at the top of every list page to
// filter by status. The active state is signalled solely by the badge
// colour (blue for active, gray for inactive) — the card itself stays
// the same colour either way.
//
// Consolidates the inline copies in:
//   - patient-history (4 pills, already in a .map)
//   - user-management (3 hand-rolled buttons — older inline-flip-fill style)
//   - unit-management (3 hand-rolled buttons — same)
//   - client-management (3 hand-rolled buttons — same)
//
// As part of the consolidation the 3 management pages are brought onto
// the same visual as patient-history.
//
// Usage:
//   <FilterPill
//     active={activeFilter === "all"}
//     label="All"
//     count={allCount}
//     onClick={() => setActiveFilter("all")}
//     testId="filter-all"
//   />
// =============================================================================

export interface FilterPillProps {
  active: boolean
  label: string
  count: number
  onClick: () => void
  /** data-testid passthrough. */
  testId?: string
  /** Extra classes appended to the outer button. */
  className?: string
}

export function FilterPill({
  active,
  label,
  count,
  onClick,
  testId,
  className,
}: FilterPillProps) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg bg-[#FCFAF9] px-4 py-2 text-sm font-medium transition-colors hover:bg-[#F4F0EE]",
        className
      )}
    >
      <span
        className={cn(
          "inline-flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-semibold transition-colors",
          active
            ? "bg-[var(--client-primary)] text-white"
            : "bg-gray-200 text-ink"
        )}
      >
        {count}
      </span>
      <span className="text-ink">{label}</span>
    </button>
  )
}
