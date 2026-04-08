"use client"

import { useState, useRef, useEffect } from "react"
import { CalendarDays, ChevronDown, X } from "lucide-react"
import { Button } from "@/components/ui/button"

// ---------------------------------------------------------------------------
// Inline Calendar
// ---------------------------------------------------------------------------

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]

// Generate year options (100 years back from current year)
function getYearOptions() {
  const currentYear = new Date().getFullYear()
  const years: number[] = []
  for (let y = currentYear; y >= currentYear - 100; y--) {
    years.push(y)
  }
  return years
}

// Custom dropdown matching app style
function CalendarDropdown({
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
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside)
    }
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
                className={`w-full px-4 py-2.5 text-left text-sm text-gray-900 transition-colors hover:bg-[#3ea3db]/15 ${
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

function InlineCalendar({
  value,
  onChange,
}: {
  value: string
  onChange: (date: string) => void
}) {
  const today = new Date()
  const selected = value ? new Date(value + "T00:00:00") : null

  const [viewYear, setViewYear] = useState(selected?.getFullYear() ?? today.getFullYear())
  const [viewMonth, setViewMonth] = useState(selected?.getMonth() ?? today.getMonth())

  const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()

  function handleSelectDay(day: number) {
    const m = String(viewMonth + 1).padStart(2, "0")
    const d = String(day).padStart(2, "0")
    onChange(`${viewYear}-${m}-${d}`)
  }

  function isSelected(day: number) {
    if (!selected) return false
    return (
      selected.getFullYear() === viewYear &&
      selected.getMonth() === viewMonth &&
      selected.getDate() === day
    )
  }

  function isToday(day: number) {
    return (
      today.getFullYear() === viewYear &&
      today.getMonth() === viewMonth &&
      today.getDate() === day
    )
  }

  // Build grid cells
  const cells: (number | null)[] = []
  for (let i = 0; i < firstDayOfMonth; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  return (
    <div className="w-full">
      {/* Month/Year dropdowns */}
      <div className="flex w-full items-center gap-3 pb-4">
        <CalendarDropdown
          value={String(viewMonth)}
          onChange={(v) => setViewMonth(parseInt(v, 10))}
          options={MONTH_NAMES.map((name, i) => ({ value: String(i), label: name }))}
        />
        <CalendarDropdown
          value={String(viewYear)}
          onChange={(v) => setViewYear(parseInt(v, 10))}
          options={getYearOptions().map((y) => ({ value: String(y), label: String(y) }))}
        />
      </div>

      {/* Day labels */}
      <div className="grid grid-cols-7 gap-1 pb-1">
        {DAY_LABELS.map((d) => (
          <div key={d} className="text-center text-xs font-medium text-gray-400">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) =>
          day === null ? (
            <div key={`empty-${i}`} />
          ) : (
            <button
              key={day}
              type="button"
              onClick={() => handleSelectDay(day)}
              className={`flex size-9 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                isSelected(day)
                  ? "bg-[#3ea3db] text-white"
                  : isToday(day)
                    ? "bg-[#3ea3db]/15 text-[#3ea3db] hover:bg-[#3ea3db]/25"
                    : "text-gray-900 hover:bg-gray-100"
              }`}
            >
              {day}
            </button>
          )
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// DatePickerField
// ---------------------------------------------------------------------------

interface DatePickerDialogProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  onClear: () => void
  "data-testid"?: string
  className?: string
}

export function DatePickerField({
  id,
  label,
  value,
  onChange,
  onClear,
  "data-testid": dataTestId,
  className = "",
}: DatePickerDialogProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [tempDate, setTempDate] = useState(value)
  const hasValue = value.length > 0

  // Format display value from YYYY-MM-DD to DD/MM/YYYY
  const displayValue = value
    ? value.split("-").reverse().join("/")
    : ""

  function handleOpen() {
    setTempDate(value)
    setIsOpen(true)
  }

  function handleConfirm() {
    onChange(tempDate)
    setIsOpen(false)
  }

  function handleCancel() {
    setIsOpen(false)
  }

  return (
    <>
      {/* Trigger field */}
      <div className={`relative ${className}`}>
        <button
          id={id}
          type="button"
          data-testid={dataTestId}
          onClick={handleOpen}
          className="flex h-14 w-full items-center rounded-lg border border-gray-300 bg-white px-4 text-left text-sm outline-none transition-colors hover:border-gray-900"
        >
          <span className={hasValue ? "text-gray-900" : "text-transparent"}>
            {displayValue || label}
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
        <CalendarDays
          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-gray-400"
        />
        {hasValue && (
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

      {/* Dialog with inline calendar */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex w-full max-w-md flex-col items-center gap-6 rounded-2xl bg-white p-6 sm:p-8">
            <h2 className="text-center text-xl font-bold text-gray-900">
              Select {label}
            </h2>

            {/* Selected date display */}
            {tempDate && (
              <p className="text-sm text-gray-500">
                {tempDate.split("-").reverse().join("/")}
              </p>
            )}

            {/* Inline calendar */}
            <InlineCalendar
              value={tempDate}
              onChange={setTempDate}
            />

            <Button
              onClick={handleConfirm}
              disabled={!tempDate}
              className={`h-12 w-full gap-2 rounded-xl text-base font-semibold transition-all ${
                tempDate
                  ? "bg-gray-900 text-white hover:bg-gray-800"
                  : "bg-gray-300 text-gray-500 cursor-default"
              }`}
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
