"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

// =============================================================================
// EmptyState
//
// "No results" placeholder for list views. Two modes:
//
//   1. Minimal (default, matches the existing inline pattern):
//      <EmptyState>No patients found</EmptyState>
//      → renders a 96px tall white card with grey text in the middle.
//
//   2. Rich (optional, for richer placeholders):
//      <EmptyState
//        icon={Search}
//        title="No results found"
//        description="Try adjusting your filters."
//      />
//      → renders a taller card with a centered icon, title, and description.
//
// Consolidates 5 inline copies across patient-history, audit-log, and
// user/unit/client-management list views.
// =============================================================================

export interface EmptyStateProps {
  /** Simple inline message. Use this for the minimal variant. Mutually
   *  exclusive with title/description (which trigger the rich variant). */
  children?: React.ReactNode
  /** Title for the rich variant. */
  title?: string
  /** Description below the title for the rich variant. */
  description?: string
  /** Optional icon for the rich variant. */
  icon?: React.ComponentType<{ className?: string }>
  /** data-testid passthrough. Defaults to "empty-state". */
  testId?: string
  /** Extra classes appended to the outer container. */
  className?: string
}

export function EmptyState({
  children,
  title,
  description,
  icon: Icon,
  testId = "empty-state",
  className,
}: EmptyStateProps) {
  const isRich = Boolean(title || description || Icon)

  if (!isRich) {
    return (
      <div
        data-testid={testId}
        className={cn(
          "flex h-24 items-center justify-center rounded-xl bg-white text-gray-400",
          className
        )}
      >
        {children}
      </div>
    )
  }

  return (
    <div
      data-testid={testId}
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border border-dashed border-gray-200 bg-white p-12 text-center",
        className
      )}
    >
      {Icon && <Icon className="size-8 text-gray-300" />}
      {title && (
        <span className="text-base font-medium text-ink">{title}</span>
      )}
      {description && (
        <p className="text-sm text-ink-muted">{description}</p>
      )}
    </div>
  )
}
