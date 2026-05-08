"use client"

import { useEffect, useRef, useState } from "react"
import { Clock, ChevronDown, X } from "lucide-react"
import { Button } from "@/components/ui/button"

// =============================================================================
// TimePickerField
//
// Mirrors DatePickerField's UX: a styled trigger button with a floating
// label that opens a modal containing an inline picker. Where DatePicker
// uses a calendar grid, this uses two scrollable dropdowns (hour + minute)
// rendered in the modal.
//
// Value contract: "HH:mm" 24-hour format (matches the native <input
// type="time"> format), so the parent can combine it with a YYYY-MM-DD
// date string from DatePickerField via `new Date(\`\${date}T\${time}\`)`.
// =============================================================================

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => ({
  value: String(i).padStart(2, "0"),
  label: String(i).padStart(2, "0"),
}))

// Minute granularity at 5-min increments — keeps the dropdown short and
// matches typical clinic-slot scheduling. If we need finer granularity
// later, this is the only place to bump.
const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i * 5).padStart(2, "0"),
  label: String(i * 5).padStart(2, "0"),
}))

// Local copy of the dropdown pattern from date-picker-dialog.tsx — kept
// separate so the two files don't have to import each other for an
// internal helper.
function PickerDropdown({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selectedLabel = options.find((o) => o.value === value)?.label ?? ""

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isOpen])

  return (
    <div ref={ref} className="relative flex-1">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex h-11 w-full items-center justify-between rounded-lg border bg-white px-4 text-sm font-semibold text-gray-900 outline-none transition-colors ${
          isOpen ? "border-gray-900" : "border-gray-300"
        }`}
      >
        {selectedLabel}
        <ChevronDown
          className={`size-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-10 mt-1 max-h-52 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="max-h-52 overflow-y-auto">
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value)
                  setIsOpen(false)
                }}
                className={`w-full px-4 py-2.5 text-left text-sm text-gray-900 transition-colors hover:bg-[var(--client-primary-15)] ${
                  opt.value === value ? "bg-[var(--client-primary-15)] font-medium" : ""
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

interface TimePickerFieldProps {
  id: string
  label: string
  /** "HH:mm" 24-hour format, or empty string when unset. */
  value: string
  onChange: (value: string) => void
  onClear: () => void
  "data-testid"?: string
  className?: string
  readOnly?: boolean
}

export function TimePickerField({
  id,
  label,
  value,
  onChange,
  onClear,
  "data-testid": dataTestId,
  className = "",
  readOnly = false,
}: TimePickerFieldProps) {
  const [isOpen, setIsOpen] = useState(false)
  const hasValue = value.length > 0

  // Split the incoming "HH:mm" into temp pieces so the modal can stage
  // changes without touching the parent until Confirm. Default to the
  // current value if set, otherwise to "08:00" — a reasonable starting
  // point for a clinical-day scheduler.
  const initialHour = hasValue ? value.split(":")[0] : "08"
  const initialMinute = hasValue ? value.split(":")[1] : "00"
  const [tempHour, setTempHour] = useState(initialHour)
  const [tempMinute, setTempMinute] = useState(initialMinute)

  function handleOpen() {
    // Re-seed temp state from the current committed value each time
    // the modal opens. Otherwise stale temp state from a previous
    // cancel could leak into the next open.
    setTempHour(hasValue ? value.split(":")[0] : "08")
    // Snap the current minute to the nearest 5-minute step so the
    // dropdown selection always shows the active highlight.
    if (hasValue) {
      const m = parseInt(value.split(":")[1] ?? "0", 10)
      const snapped = Math.round(m / 5) * 5
      setTempMinute(String(Math.min(55, snapped)).padStart(2, "0"))
    } else {
      setTempMinute("00")
    }
    setIsOpen(true)
  }

  function handleConfirm() {
    onChange(`${tempHour}:${tempMinute}`)
    setIsOpen(false)
  }

  function handleCancel() {
    setIsOpen(false)
  }

  return (
    <>
      {/* Trigger field — same shape as DatePickerField for visual
          alignment when they sit side-by-side. */}
      <div className={`relative ${className}`}>
        <button
          id={id}
          type="button"
          data-testid={dataTestId}
          onClick={readOnly ? undefined : handleOpen}
          aria-readonly={readOnly || undefined}
          tabIndex={readOnly ? -1 : 0}
          className={`flex h-14 w-full items-center rounded-lg border px-4 text-left text-sm outline-none transition-colors ${
            readOnly
              ? "cursor-default border-gray-200 bg-gray-100 text-gray-500"
              : "border-gray-300 bg-white hover:border-gray-900"
          }`}
        >
          <span className={hasValue ? "text-gray-900" : "text-transparent"}>
            {value || label}
          </span>
        </button>
        <label
          className={`pointer-events-none absolute left-3 bg-white px-1 text-sm transition-all ${
            hasValue
              ? "top-0 -translate-y-1/2 text-xs text-gray-500"
              : "top-1/2 -translate-y-1/2 text-gray-400"
          }`}
        >
          {label}
        </label>
        <Clock
          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-gray-400"
        />
        {hasValue && !readOnly && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onClear()
            }}
            className="absolute right-9 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-gray-400 hover:text-gray-600"
            aria-label={`Clear ${label}`}
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {/* Picker modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex w-full max-w-md flex-col items-center gap-6 rounded-2xl bg-white p-6 sm:p-8">
            <h2 className="text-center text-xl font-bold text-gray-900">
              Select {label}
            </h2>

            {/* Selected time display — matches the date-picker preview
                line in tone + position. */}
            <p className="text-2xl font-bold tabular-nums text-gray-900">
              {tempHour}:{tempMinute}
            </p>

            {/* Hour + Minute dropdowns. 5-minute granularity on minutes
                keeps the list short; if finer is ever needed, bump
                MINUTE_OPTIONS at the top of this file. */}
            <div className="flex w-full items-center gap-3">
              <div className="flex flex-1 flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Hour
                </span>
                <PickerDropdown
                  value={tempHour}
                  onChange={setTempHour}
                  options={HOUR_OPTIONS}
                />
              </div>
              <div className="flex flex-1 flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Minute
                </span>
                <PickerDropdown
                  value={tempMinute}
                  onChange={setTempMinute}
                  options={MINUTE_OPTIONS}
                />
              </div>
            </div>

            <Button
              onClick={handleConfirm}
              className="h-12 w-full gap-2 rounded-xl bg-gray-900 text-base font-semibold text-white hover:bg-gray-800"
            >
              Confirm
            </Button>

            <button
              type="button"
              onClick={handleCancel}
              className="text-sm font-semibold text-[#FF3A69] hover:opacity-80"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  )
}
