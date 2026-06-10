"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronDown } from "lucide-react"
import { COUNTRY_CODES } from "@/lib/phone"

// =============================================================================
// CountryCodeSelect
//
// Country-code dropdown for contact-number rows. Lifted verbatim (look +
// behaviour) from the inline component that lived in create-booking/
// patient-details, now consuming the canonical COUNTRY_CODES table from
// @/lib/phone so every contact field shares one source of truth.
//
// Controlled component: `value` is the ISO-2 code (e.g. "ZA"), `onChange`
// receives the newly-selected ISO-2 code. Pair it with a FloatingInput and the
// validatePhone/formatPhoneInput/normalizeToE164 helpers from @/lib/phone.
//
// Opens UPWARD (bottom-full) like FloatingSelect, to avoid clipping at the
// bottom of forms.
// =============================================================================

export interface CountryCodeSelectProps {
  /** Currently-selected ISO-2 country code, e.g. "ZA". */
  value: string
  /** Called with the newly-selected ISO-2 country code. */
  onChange: (code: string) => void
  /** Optional id on the trigger button. */
  id?: string
  /** When true, the trigger is disabled and the listbox cannot open. */
  disabled?: boolean
}

export function CountryCodeSelect({
  value,
  onChange,
  id,
  disabled = false,
}: CountryCodeSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = COUNTRY_CODES.find((c) => c.code === value) ?? COUNTRY_CODES[0]

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  return (
    <div ref={ref} className="relative w-24">
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return
          setIsOpen(!isOpen)
        }}
        className={`flex h-14 w-full items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 ${
          disabled ? "cursor-default bg-gray-100" : "bg-white"
        }`}
      >
        <span className="text-sm font-medium text-ink">{selected.code}</span>
        <ChevronDown className={`size-3 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>
      <label className="pointer-events-none absolute left-3 top-0 -translate-y-1/2 bg-white px-1 text-xs text-ink-muted">
        Country
      </label>
      {isOpen && (
        <div className="absolute bottom-full left-0 z-50 mb-1 max-h-52 w-32 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="overflow-y-auto max-h-52 mr-1">
            {COUNTRY_CODES.map((country) => (
              <button
                key={country.code}
                type="button"
                onClick={() => {
                  onChange(country.code)
                  setIsOpen(false)
                }}
                className={`flex w-full items-center gap-2 px-3 py-2.5 text-sm transition-colors hover:bg-[var(--client-primary-15)] ${
                  value === country.code ? "bg-[var(--client-primary-15)] font-medium" : "text-ink"
                }`}
              >
                <span className="font-medium">{country.code}</span>
                <span className="text-ink-muted">{country.dial}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
