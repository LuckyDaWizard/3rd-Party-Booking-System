"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

// =============================================================================
// list-pagination.tsx
//
// Shared client-side pagination for list/table pages. Visual style matches the
// existing implementation in patient-history/page.tsx so all paginated pages
// look identical.
//
// Two exports:
//   - usePagination(items, pageSize?)  → hook that handles state + slicing
//   - <ListPagination ... />           → footer component (Showing X-Y of Z + buttons)
//
// Usage:
//   const { visible, currentPage, setCurrentPage, totalPages, totalItems } =
//     usePagination(filteredItems)
//
//   // ...render visible instead of filteredItems...
//
//   <ListPagination
//     currentPage={currentPage}
//     totalPages={totalPages}
//     totalItems={totalItems}
//     pageSize={10}
//     onPageChange={setCurrentPage}
//   />
//
// The footer auto-hides when totalItems <= pageSize (matches patient-history).
// =============================================================================

const DEFAULT_PAGE_SIZE = 10

/**
 * Slice an array into the current page and provide handlers. The page number
 * resets to 1 whenever the items array reference changes (e.g. when a search
 * filter narrows the list and the previous page would be out of bounds).
 */
export function usePagination<T>(items: T[], pageSize: number = DEFAULT_PAGE_SIZE) {
  const [currentPage, setCurrentPage] = React.useState(1)

  const totalItems = items.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))

  // Reset to page 1 when the underlying list shrinks (e.g. after a filter
  // change) so the user doesn't end up on an empty page past the new end.
  React.useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(1)
    }
  }, [totalPages, currentPage])

  const visible = React.useMemo(
    () => items.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [items, currentPage, pageSize]
  )

  return {
    visible,
    currentPage,
    setCurrentPage,
    totalPages,
    totalItems,
    pageSize,
  }
}

interface ListPaginationProps {
  currentPage: number
  totalPages: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
}

/**
 * Compute which page numbers to render given a current page and total.
 *
 * Up to 7 visible page buttons:
 *   - Always page 1
 *   - Always last page (totalPages)
 *   - currentPage and 1 neighbour each side
 *   - Ellipses where there are gaps
 *
 * Examples (current=9, total=50): [1, "…", 7, 8, 9, 10, 11, "…", 50]
 * Examples (current=1, total=50): [1, 2, 3, 4, 5, "…", 50]
 * Examples (current=50, total=50): [1, "…", 46, 47, 48, 49, 50]
 *
 * Previously this rendered one button per page, so a tenant with 500
 * bookings (50 pages) saw 50 buttons wrap to many rows and push the
 * table off-screen. Bounded at 7 buttons + ellipses regardless of total.
 */
export function computePageWindow(
  currentPage: number,
  totalPages: number
): Array<number | "ellipsis"> {
  // Small total — just show every page.
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }

  const pages: Array<number | "ellipsis"> = [1]

  // Left ellipsis when currentPage is far enough right.
  if (currentPage > 4) {
    pages.push("ellipsis")
  }

  // Neighbours window: clamp so we don't repeat 1 or totalPages.
  const windowStart = Math.max(2, currentPage - 1)
  const windowEnd = Math.min(totalPages - 1, currentPage + 1)
  for (let p = windowStart; p <= windowEnd; p += 1) {
    pages.push(p)
  }

  // Right ellipsis when currentPage is far enough left.
  if (currentPage < totalPages - 3) {
    pages.push("ellipsis")
  }

  pages.push(totalPages)
  return pages
}

export function ListPagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
}: ListPaginationProps) {
  // Hide entirely when there's nothing to paginate.
  if (totalItems <= pageSize) {
    return null
  }

  const start = (currentPage - 1) * pageSize + 1
  const end = Math.min(currentPage * pageSize, totalItems)

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
      <p className="text-sm text-ink-muted">
        Showing {start}–{end} of {totalItems}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className={`flex size-9 items-center justify-center rounded-lg border transition-colors ${
            currentPage === 1
              ? "border-gray-200 text-gray-300 cursor-not-allowed"
              : "border-gray-300 text-ink-muted hover:bg-gray-100"
          }`}
        >
          <ChevronLeft className="size-4" />
        </button>

        {computePageWindow(currentPage, totalPages).map((entry, idx) =>
          entry === "ellipsis" ? (
            <span
              // Ellipses can repeat across the row; index keys are fine since
              // the windowing is deterministic for a given (currentPage, totalPages).
              key={`ellipsis-${idx}`}
              className="flex size-9 items-center justify-center text-sm text-gray-400"
              aria-hidden="true"
            >
              …
            </span>
          ) : (
            <button
              key={entry}
              type="button"
              onClick={() => onPageChange(entry)}
              className={`flex size-9 items-center justify-center rounded-lg text-sm font-medium transition-colors ${
                entry === currentPage
                  ? "bg-[var(--client-primary)] text-white"
                  : "border border-gray-300 text-ink-muted hover:bg-gray-100"
              }`}
            >
              {entry}
            </button>
          )
        )}

        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className={`flex size-9 items-center justify-center rounded-lg border transition-colors ${
            currentPage === totalPages
              ? "border-gray-200 text-gray-300 cursor-not-allowed"
              : "border-gray-300 text-ink-muted hover:bg-gray-100"
          }`}
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  )
}
