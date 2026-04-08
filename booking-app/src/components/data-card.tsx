import * as React from "react"

// =============================================================================
// data-card.tsx
//
// Mobile/tablet representation of a list row. Each list page (client, unit,
// user management) renders one of these per record below the `md:` breakpoint
// while keeping its existing desktop grid row above `md:` (wrapped in
// `hidden md:grid`).
//
// Shape:
//
//   ┌─────────────────────────────────┐
//   │  [Status]              [Action] │
//   │                                 │
//   │  Label 1                        │
//   │  Value 1                        │
//   │                                 │
//   │  Label 2                        │
//   │  Value 2                        │
//   │                                 │
//   │  ...                            │
//   └─────────────────────────────────┘
//
// Field labels match the design language already used by the desktop rows
// (small bold label, value below in muted text), just stacked instead of
// laid out in a horizontal grid.
// =============================================================================

export interface DataCardField {
  /** Bold field name shown above the value. */
  label: string
  /** Field value. String-only on purpose — keeps the API simple and avoids
   *  styling drift between pages. If a page needs richer rendering, fall back
   *  to a per-page mobile layout instead of bending DataCard. */
  value: string
}

export interface DataCardProps {
  /** Top-left corner — typically a status Badge. */
  status: React.ReactNode
  /** Top-right corner — typically a Manage button. */
  action: React.ReactNode
  /** Stacked label/value pairs rendered between status and action. */
  fields: DataCardField[]
  /** Optional test id for E2E selectors. */
  "data-testid"?: string
}

export function DataCard({
  status,
  action,
  fields,
  "data-testid": testId,
}: DataCardProps) {
  return (
    <div
      data-testid={testId}
      className="flex flex-col gap-4 rounded-xl bg-white p-4"
    >
      {/* Status + action row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center">{status}</div>
        <div className="flex items-center">{action}</div>
      </div>

      {/* Stacked fields */}
      <div className="flex flex-col gap-3">
        {fields.map((field, i) => (
          <div key={`${field.label}-${i}`} className="flex flex-col gap-0.5">
            <span className="text-xs font-bold text-gray-900">
              {field.label}
            </span>
            <span className="break-words text-sm text-gray-600">
              {field.value || "-"}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
