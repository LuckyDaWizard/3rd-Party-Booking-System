"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

// =============================================================================
// TabStrip
//
// Horizontal tab navigation for switching between page sections. Two visual
// variants:
//
//   - underline → security/page.tsx — flat border-b strip, active tab has
//     a 2px accent underline.
//   - pill      → client-management/manage — soft tinted pill on active,
//     supports an optional count badge on the right of each tab.
//
// State is controlled by the parent; the component is purely a visual
// selector. Use the returned `value` to render whichever panel is active.
//
// Usage:
//   const [tab, setTab] = useState<"attempts" | "sessions">("attempts")
//
//   <TabStrip
//     variant="underline"
//     value={tab}
//     onChange={setTab}
//     tabs={[
//       { value: "attempts", label: "Failed Attempts", icon: ShieldAlert },
//       { value: "sessions", label: "Active Sessions", icon: Monitor },
//     ]}
//   />
//
//   {tab === "attempts" && <FailedAttemptsTab />}
//   {tab === "sessions" && <ActiveSessionsTab />}
// =============================================================================

export type TabStripVariant = "underline" | "pill"

export interface TabStripTab<T extends string> {
  value: T
  label: string
  /** Optional left-aligned icon. */
  icon?: React.ComponentType<{ className?: string }>
  /** Optional count badge, rendered on the right of the label (pill variant). */
  count?: number
  /** data-testid passthrough for the individual tab. */
  testId?: string
}

export interface TabStripProps<T extends string> {
  variant?: TabStripVariant
  tabs: TabStripTab<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
  /** aria-label on the outer container. */
  ariaLabel?: string
  /** data-testid on the outer container. */
  testId?: string
}

export function TabStrip<T extends string>({
  variant = "underline",
  tabs,
  value,
  onChange,
  className,
  ariaLabel,
  testId,
}: TabStripProps<T>) {
  return (
    <div
      data-testid={testId}
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        variant === "underline"
          ? "flex flex-wrap gap-2 border-b border-gray-200"
          : "flex flex-wrap items-center justify-center gap-x-8 gap-y-2",
        className
      )}
    >
      {tabs.map((tab) => {
        const active = tab.value === value
        const Icon = tab.icon
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            data-testid={tab.testId}
            onClick={() => onChange(tab.value)}
            className={cn(
              variant === "underline"
                ? cn(
                    "inline-flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors",
                    active
                      ? "-mb-px border-b-2 border-[var(--client-primary)] text-[var(--client-primary)]"
                      : "text-ink-muted hover:text-ink"
                  )
                : cn(
                    "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-[var(--client-primary-10)] text-[var(--client-primary)]"
                      : "text-gray-400 hover:text-ink-muted"
                  )
            )}
          >
            {Icon && <Icon className="size-4" />}
            {tab.label}
            {typeof tab.count === "number" && tab.count > 0 && (
              <span
                className={cn(
                  "ml-1 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold",
                  active
                    ? "bg-[var(--client-primary)] text-white"
                    : "bg-gray-200 text-ink-muted"
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
