"use client"

import * as React from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

// =============================================================================
// Banner
//
// Tinted message banner shown at the top of a page (or inline) after a
// successful action, warning, info note or error. Consolidates ~15 inline
// copies of the same pattern across the dashboard.
//
// Four kinds, each with its own bg + border tint:
//   - success   → green
//   - warning   → amber
//   - info      → blue
//   - danger    → red
//
// Usage:
//   <Banner
//     kind="success"
//     title="Patient Profile Created Successfully"
//     description="The patient's profile has been created."
//     onDismiss={() => setBanner(null)}
//   />
//
// For richer banners with action buttons inside, pass `children`:
//   <Banner kind="success" title="..." description="...">
//     <Button size="sm">Undo</Button>
//   </Banner>
// =============================================================================

export type BannerKind = "success" | "warning" | "info" | "danger"

export interface BannerProps {
  kind?: BannerKind
  title: React.ReactNode
  description?: React.ReactNode
  /** Optional dismiss callback. When provided, renders the X close button. */
  onDismiss?: () => void
  /** Extra content (e.g. action buttons) rendered below the description. */
  children?: React.ReactNode
  /** data-testid passthrough. */
  testId?: string
  className?: string
}

const KIND_STYLES: Record<BannerKind, string> = {
  success: "bg-green-50 border-green-200",
  warning: "bg-amber-50 border-amber-200",
  info: "bg-blue-50 border-blue-200",
  danger: "bg-red-50 border-red-200",
}

export function Banner({
  kind = "success",
  title,
  description,
  onDismiss,
  children,
  testId,
  className,
}: BannerProps) {
  return (
    <div
      data-testid={testId}
      className={cn(
        "flex items-start justify-between rounded-xl border px-6 py-5",
        KIND_STYLES[kind],
        className
      )}
    >
      <div className="flex flex-col gap-1">
        <span className="text-base font-bold text-ink">{title}</span>
        {description && (
          <p className="text-sm text-ink-muted">{description}</p>
        )}
        {children}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-full p-1 text-gray-400 hover:text-ink-muted"
          aria-label="Dismiss"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  )
}
