"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown } from "lucide-react"

// =============================================================================
// FloatingSelect
//
// A custom dropdown with a floating label, matching FloatingInput's visual
// style. Opens upward (bottom-full) to avoid clipping at the bottom of forms.
//
// Consolidates 6 copy-pasted variants from:
//   - user-management/{add,manage}
//   - client-management/add
//   - unit-management/{add,manage}
//   - create-booking/patient-details
//
// Keyboard + ARIA support (audit item #8 — WCAG 2.1 Level A):
//
//   Trigger (closed):
//     - Enter / Space / ArrowDown / ArrowUp → open listbox
//     - Tab moves normally (no interception)
//
//   Listbox (open):
//     - ArrowDown / ArrowUp        → move active option (wraps)
//     - Home / End                 → jump to first / last option
//     - Enter / Space              → select active option, close, refocus
//                                    trigger
//     - Escape / Tab               → close without selecting, refocus trigger
//     - Typeahead (letters)        → jump to next option starting with the
//                                    accumulated buffer (cleared after 500ms
//                                    of no keystrokes)
//
//   ARIA contract:
//     - Combobox:  role="combobox" aria-haspopup="listbox" aria-expanded
//                  aria-controls  aria-activedescendant
//     - Listbox:   role="listbox"
//     - Option:    role="option" aria-selected
//
//   Focus model:
//     - DOM focus stays on the combobox button the whole time
//     - Which option is "focused" is communicated via aria-activedescendant
//     - The active option is also highlighted visually and scrolled into view
//
// Click-outside closes without selecting. The public API (props) is unchanged
// from the mouse-only version so the 6 consumer pages need no updates.
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
  /**
   * When TRUE, the select is uneditable: the listbox never opens and the
   * trigger renders with the same grey styling as `FloatingInput readOnly`.
   * Used to lock identity fields (idType, gender, nationality, title) on
   * a booking that's linked to an existing patient record.
   */
  readOnly?: boolean
}

const TYPEAHEAD_RESET_MS = 500

export function FloatingSelect({
  id,
  label,
  value,
  onChange,
  options,
  className = "",
  "data-testid": dataTestId,
  testIdPrefix,
  readOnly = false,
}: FloatingSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState<number>(-1)
  const selectedLabel = options.find((o) => o.value === value)?.label ?? ""

  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listboxRef = useRef<HTMLUListElement>(null)
  const optionRefs = useRef<(HTMLLIElement | null)[]>([])
  const typeaheadBufferRef = useRef<string>("")
  const typeaheadTimerRef = useRef<number | null>(null)

  const listboxId = `${id}-listbox`
  // Memoise the per-option DOM ids so ARIA references stay stable across
  // renders.
  const optionIds = useMemo(
    () => options.map((o) => `${id}-option-${o.value}`),
    [id, options]
  )

  const selectedIndex = options.findIndex((o) => o.value === value)

  // Close on click outside.
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside)
    }
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isOpen])

  // When the listbox opens, put the active cursor on the currently selected
  // option (or the first option if nothing is selected yet) so keyboard users
  // start from a sensible place.
  useEffect(() => {
    if (isOpen) {
      setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0)
    }
    // Intentionally not depending on selectedIndex — we only seed this once
    // per open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // Scroll the active option into view when it changes.
  useEffect(() => {
    if (!isOpen || activeIndex < 0) return
    const el = optionRefs.current[activeIndex]
    if (el) el.scrollIntoView({ block: "nearest" })
  }, [activeIndex, isOpen])

  const openMenu = useCallback(() => {
    setIsOpen(true)
  }, [])

  const closeAndRefocus = useCallback(() => {
    setIsOpen(false)
    // Return DOM focus to the trigger so Tab continues from the right place.
    // Defer to next tick so the listbox unmounting doesn't race the focus.
    setTimeout(() => triggerRef.current?.focus(), 0)
  }, [])

  const selectAtIndex = useCallback(
    (index: number) => {
      const opt = options[index]
      if (!opt) return
      onChange(opt.value)
      closeAndRefocus()
    },
    [options, onChange, closeAndRefocus]
  )

  // Typeahead: on printable-character keys, accumulate into a buffer and
  // jump to the next option whose label starts with the buffer.
  const handleTypeahead = useCallback(
    (char: string) => {
      if (typeaheadTimerRef.current !== null) {
        window.clearTimeout(typeaheadTimerRef.current)
      }
      typeaheadBufferRef.current = (typeaheadBufferRef.current + char).toLowerCase()
      typeaheadTimerRef.current = window.setTimeout(() => {
        typeaheadBufferRef.current = ""
        typeaheadTimerRef.current = null
      }, TYPEAHEAD_RESET_MS)

      const buffer = typeaheadBufferRef.current
      // Search from position after the current active, so repeated presses
      // cycle through matches.
      const startFrom = Math.max(0, activeIndex + 1)
      const rotated = [
        ...options.slice(startFrom),
        ...options.slice(0, startFrom),
      ]
      const matchInRotated = rotated.findIndex((o) =>
        o.label.toLowerCase().startsWith(buffer)
      )
      if (matchInRotated !== -1) {
        const actualIndex = (matchInRotated + startFrom) % options.length
        setActiveIndex(actualIndex)
      }
    },
    [activeIndex, options]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      // When closed, these keys open the listbox.
      if (!isOpen) {
        if (
          e.key === "Enter" ||
          e.key === " " ||
          e.key === "ArrowDown" ||
          e.key === "ArrowUp"
        ) {
          e.preventDefault()
          openMenu()
        }
        return
      }

      // When open:
      switch (e.key) {
        case "Escape":
          e.preventDefault()
          closeAndRefocus()
          break
        case "Tab":
          // Don't trap Tab — close the listbox and let focus move naturally.
          setIsOpen(false)
          break
        case "Enter":
        case " ":
          e.preventDefault()
          if (activeIndex >= 0) selectAtIndex(activeIndex)
          break
        case "ArrowDown":
          e.preventDefault()
          setActiveIndex((prev) =>
            options.length === 0 ? -1 : (prev + 1) % options.length
          )
          break
        case "ArrowUp":
          e.preventDefault()
          setActiveIndex((prev) =>
            options.length === 0
              ? -1
              : (prev - 1 + options.length) % options.length
          )
          break
        case "Home":
          e.preventDefault()
          if (options.length > 0) setActiveIndex(0)
          break
        case "End":
          e.preventDefault()
          if (options.length > 0) setActiveIndex(options.length - 1)
          break
        default:
          // Typeahead for any single printable character.
          if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault()
            handleTypeahead(e.key)
          }
      }
    },
    [isOpen, openMenu, closeAndRefocus, activeIndex, selectAtIndex, options.length, handleTypeahead]
  )

  const activeOptionId =
    isOpen && activeIndex >= 0 && activeIndex < options.length
      ? optionIds[activeIndex]
      : undefined

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        data-testid={dataTestId}
        onClick={() => {
          if (readOnly) return
          setIsOpen((prev) => !prev)
        }}
        onKeyDown={readOnly ? undefined : handleKeyDown}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        aria-activedescendant={activeOptionId}
        aria-labelledby={`${id}-label`}
        aria-readonly={readOnly || undefined}
        tabIndex={readOnly ? -1 : 0}
        className={`flex h-14 w-full items-center rounded-lg border px-4 text-left text-sm outline-none transition-colors ${
          readOnly
            ? "cursor-default border-gray-200 bg-gray-100 text-gray-500"
            : `bg-white focus:border-gray-900 focus-visible:ring-2 focus-visible:ring-[var(--client-primary)] ${
                isOpen ? "border-gray-900" : "border-gray-300"
              }`
        }`}
      >
        <span className={value ? "text-gray-900" : "text-transparent"}>
          {selectedLabel || label}
        </span>
      </button>
      <label
        id={`${id}-label`}
        className={`pointer-events-none absolute left-3 bg-white px-1 text-sm transition-all ${
          value || isOpen
            ? "top-0 -translate-y-1/2 text-xs text-gray-500"
            : "top-1/2 -translate-y-1/2 text-gray-400"
        }`}
      >
        {label}
      </label>
      {!readOnly && (
        <ChevronDown
          className={`pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-gray-400 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      )}

      {isOpen && (
        <div className="absolute left-0 bottom-full z-10 mb-1 max-h-96 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          <ul
            ref={listboxRef}
            id={listboxId}
            role="listbox"
            aria-labelledby={`${id}-label`}
            className="mx-2 my-2 flex max-h-80 flex-col gap-1 overflow-y-auto"
          >
            {options.map((opt, index) => {
              const isSelected = opt.value === value
              const isActive = index === activeIndex
              return (
                <li
                  key={opt.value}
                  ref={(el) => {
                    optionRefs.current[index] = el
                  }}
                  id={optionIds[index]}
                  role="option"
                  aria-selected={isSelected}
                  data-testid={
                    testIdPrefix ? `${testIdPrefix}-${opt.value}` : undefined
                  }
                  // Mouse events: hover promotes to active (keeps keyboard
                  // and mouse users in sync); click selects.
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectAtIndex(index)}
                  className={`cursor-pointer rounded-lg px-5 py-4 text-left text-base text-gray-900 transition-colors ${
                    isActive ? "bg-[var(--client-primary-15)]" : ""
                  } ${isSelected && !isActive ? "bg-[var(--client-primary-10)] font-medium" : ""} ${
                    isSelected && isActive ? "font-medium" : ""
                  }`}
                >
                  {opt.label}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
