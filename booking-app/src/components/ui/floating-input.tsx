"use client"

import { X } from "lucide-react"

// =============================================================================
// FloatingInput
//
// A text input with a label that animates from inside the field to the top
// border when the field is focused or has a value. Used across every form
// page in the app.
//
// Consolidates 8 copy-pasted variants from:
//   - user-management/{add,manage}
//   - client-management/{add,manage}
//   - unit-management/{add,manage}
//   - create-booking/{page,patient-details}
//
// Superset of features:
//   - onBlur callback (for validation)
//   - error message display (red border + helper text)
//   - readOnly mode (grey background, no clear button)
//   - data-testid passthrough
//   - className override for the outer wrapper
// =============================================================================

export interface FloatingInputProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  onClear: () => void
  onBlur?: () => void
  type?: string
  readOnly?: boolean
  error?: string
  className?: string
  /** data-testid is passed through to the <input> element. */
  "data-testid"?: string
}

export function FloatingInput({
  id,
  label,
  value,
  onChange,
  onClear,
  onBlur,
  type = "text",
  readOnly = false,
  error,
  className = "",
  "data-testid": dataTestId,
}: FloatingInputProps) {
  const hasValue = value.length > 0
  const hasError = !!error

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <div className="relative">
        <input
          id={id}
          data-testid={dataTestId}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          readOnly={readOnly}
          placeholder=" "
          className={`peer h-14 w-full rounded-lg border bg-white px-4 py-4 text-sm text-gray-900 outline-none transition-colors focus:bg-white active:bg-white autofill:bg-white ${
            hasError
              ? "border-[#FF3A69] focus:border-[#FF3A69]"
              : readOnly
                ? "border-gray-300 cursor-default bg-gray-50"
                : "border-gray-300 focus:border-gray-900"
          }`}
        />
        <label
          htmlFor={id}
          className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 bg-white px-1 text-sm transition-all peer-focus:top-0 peer-focus:-translate-y-1/2 peer-focus:text-xs peer-[:not(:placeholder-shown)]:top-0 peer-[:not(:placeholder-shown)]:-translate-y-1/2 peer-[:not(:placeholder-shown)]:text-xs ${
            hasError
              ? "text-[#FF3A69] peer-focus:text-[#FF3A69] peer-[:not(:placeholder-shown)]:text-[#FF3A69]"
              : "text-gray-400 peer-focus:text-gray-500 peer-[:not(:placeholder-shown)]:text-gray-500"
          }`}
        >
          {label}
        </label>
        {hasValue && !readOnly && (
          <button
            type="button"
            onClick={onClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-gray-400 hover:text-gray-600"
            aria-label={`Clear ${label}`}
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      {hasError && <p className="text-xs text-[#FF3A69]">{error}</p>}
    </div>
  )
}
