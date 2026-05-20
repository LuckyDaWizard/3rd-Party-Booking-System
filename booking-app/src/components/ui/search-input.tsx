"use client"

import * as React from "react"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

// =============================================================================
// SearchInput
//
// List-page search field. A relative-positioned wrapper holds the search icon
// (top-left) and the Input itself. Consolidates 6 inline copies across:
//   - patient-history, audit-log, user-management, unit-management,
//     client-management, and the security sign-in-history tab.
//
// Usage:
//   <SearchInput
//     value={searchQuery}
//     onChange={setSearchQuery}
//     placeholder="Search Patient Name or ID Number"
//   />
//
// The aria-label defaults to the placeholder. Pass an explicit `ariaLabel`
// to override (e.g. when the placeholder is shorter than the field's purpose).
// =============================================================================

export interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder: string
  /** Optional override — defaults to `placeholder` when unset. */
  ariaLabel?: string
  /** Optional data-testid for tests. */
  testId?: string
  /** Override for the outer wrapper width / positioning. Defaults to `w-full sm:w-72`. */
  className?: string
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  testId,
  className,
}: SearchInputProps) {
  return (
    <div className={cn("relative w-full sm:w-72", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
      <Input
        data-testid={testId}
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-white py-2 pl-8"
        aria-label={ariaLabel ?? placeholder}
      />
    </div>
  )
}
