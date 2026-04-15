"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronDown } from "lucide-react"

// =============================================================================
// FloatingSelect
//
// A custom dropdown with a floating label, matching FloatingInput's visual
// style. Opens upward (bottom-full) to avoid clipping at the bottom of
// forms.
//
// Consolidates 6 copy-pasted variants from:
//   - user-management/{add,manage}
//   - client-management/add
//   - unit-management/{add,manage}
//   - create-booking/patient-details
//
// Features:
//   - Click-outside to close
//   - Keyboard accessible (click target is a <button>)
//   - Optional per-option data-testid via testIdPrefix prop
// =============================================================================

export interface FloatingSelectOption {
  value: string
  label: string
}

export interface FloatingSelectProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  options: FloatingSelectOption[]
  className?: string
  /** data-testid on the trigger button. */
  "data-testid"?: string
  /**
   * If set, each option gets `data-testid={`${testIdPrefix}-${option.value}`}`.
   * Used by the patient-details page's test suite.
   */
  testIdPrefix?: string
}

export function FloatingSelect({
  id,
  label,
  value,
  onChange,
  options,
  className = "",
  "data-testid": dataTestId,
  testIdPrefix,
}: FloatingSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const selectedLabel = options.find((o) => o.value === value)?.label ?? ""
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside)
    }
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isOpen])

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        id={id}
        type="button"
        data-testid={dataTestId}
        onClick={() => setIsOpen(!isOpen)}
        className={`flex h-14 w-full items-center rounded-lg border bg-white px-4 text-left text-sm outline-none transition-colors ${
          isOpen ? "border-gray-900" : "border-gray-300"
        }`}
      >
        <span className={value ? "text-gray-900" : "text-transparent"}>
          {selectedLabel || label}
        </span>
      </button>
      <label
        className={`pointer-events-none absolute left-3 bg-white px-1 text-sm transition-all ${
          value || isOpen
            ? "top-0 -translate-y-1/2 text-xs text-gray-500"
            : "top-1/2 -translate-y-1/2 text-gray-400"
        }`}
      >
        {label}
      </label>
      <ChevronDown
        className={`pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-gray-400 transition-transform ${
          isOpen ? "rotate-180" : ""
        }`}
      />

      {isOpen && (
        <div className="absolute left-0 bottom-full z-10 mb-1 max-h-96 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="mx-2 my-2 flex max-h-80 flex-col gap-1 overflow-y-auto">
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                data-testid={testIdPrefix ? `${testIdPrefix}-${opt.value}` : undefined}
                onClick={() => {
                  onChange(opt.value)
                  setIsOpen(false)
                }}
                className={`w-full rounded-lg px-5 py-4 text-left text-base text-gray-900 transition-colors hover:bg-[#3ea3db]/15 ${
                  opt.value === value ? "bg-[#3ea3db]/15 font-medium" : ""
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
