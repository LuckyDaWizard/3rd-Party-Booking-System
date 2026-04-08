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
      <p className="text-sm text-gray-500">
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
              : "border-gray-300 text-gray-600 hover:bg-gray-100"
          }`}
        >
          <ChevronLeft className="size-4" />
        </button>

        {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
          <button
            key={page}
            type="button"
            onClick={() => onPageChange(page)}
            className={`flex size-9 items-center justify-center rounded-lg text-sm font-medium transition-colors ${
              page === currentPage
                ? "bg-[#3ea3db] text-white"
                : "border border-gray-300 text-gray-600 hover:bg-gray-100"
            }`}
          >
            {page}
          </button>
        ))}

        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className={`flex size-9 items-center justify-center rounded-lg border transition-colors ${
            currentPage === totalPages
              ? "border-gray-200 text-gray-300 cursor-not-allowed"
              : "border-gray-300 text-gray-600 hover:bg-gray-100"
          }`}
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  )
}
