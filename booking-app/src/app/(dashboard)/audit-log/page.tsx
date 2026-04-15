"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowLeft, Search, ChevronDown, ChevronLeft, ChevronRight, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuditEntry {
  id: string
  createdAt: string
  actorName: string
  actorRole: string
  action: string
  entityType: string
  entityId: string
  entityName: string | null
  changes: Record<string, { old?: unknown; new?: unknown }> | null
  ipAddress: string | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PAGE_SIZE = 10

function getActionStyle(action: string): string {
  switch (action) {
    case "create":
      return "bg-green-100 text-green-700 border-transparent"
    case "update":
      return "bg-blue-100 text-blue-600 border-transparent"
    case "delete":
      return "bg-pink-100 text-pink-600 border-transparent"
    case "reset_pin":
      return "bg-yellow-100 text-yellow-800 border-transparent"
    case "toggle_status":
      return "bg-purple-100 text-purple-600 border-transparent"
    default:
      return "bg-gray-100 text-gray-600 border-transparent"
  }
}

function getEntityStyle(entityType: string): string {
  switch (entityType) {
    case "user":
      return "bg-blue-50 text-blue-600 border-transparent"
    case "client":
      return "bg-green-50 text-green-600 border-transparent"
    case "unit":
      return "bg-orange-50 text-orange-600 border-transparent"
    default:
      return "bg-gray-50 text-gray-600 border-transparent"
  }
}

function formatAction(action: string): string {
  return action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return "-"
  if (Array.isArray(val)) return val.join(", ") || "-"
  return String(val)
}

function formatRole(role: string): string {
  return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type EntityFilter = "" | "user" | "client" | "unit"
type ActionFilter = "" | "create" | "update" | "delete" | "reset_pin" | "toggle_status"

export default function AuditLogPage() {
  const [entries, setEntries] = React.useState<AuditEntry[]>([])
  const [loading, setLoading] = React.useState(true)
  const [total, setTotal] = React.useState(0)
  const [page, setPage] = React.useState(1)

  const [entityFilter, setEntityFilter] = React.useState<EntityFilter>("")
  const [actionFilter, setActionFilter] = React.useState<ActionFilter>("")
  const [search, setSearch] = React.useState("")
  const [debouncedSearch, setDebouncedSearch] = React.useState("")

  const [expandedId, setExpandedId] = React.useState<string | null>(null)

  const [exporting, setExporting] = React.useState(false)

  // Action dropdown
  const [actionDropdownOpen, setActionDropdownOpen] = React.useState(false)
  const actionDropdownRef = React.useRef<HTMLDivElement>(null)

  // Export all matching entries (respects current filters) as CSV download.
  async function handleExportCsv() {
    setExporting(true)
    try {
      // Fetch ALL matching entries (up to 10 000) — not just the current page.
      const params = new URLSearchParams()
      params.set("page", "1")
      params.set("pageSize", "10000")
      if (entityFilter) params.set("entityType", entityFilter)
      if (actionFilter) params.set("action", actionFilter)
      if (debouncedSearch) params.set("search", debouncedSearch)

      const res = await fetch(`/api/admin/audit-log?${params}`)
      if (!res.ok) throw new Error("Failed to fetch")
      const json = await res.json()
      const rows: AuditEntry[] = json.data

      // Build CSV content.
      const csvHeaders = ["Date", "Who", "Role", "Action", "Entity Type", "Target", "Changes"]
      const csvRows = rows.map((r) => {
        const changesStr = r.changes
          ? Object.entries(r.changes)
              .map(([field, diff]) => {
                const oldVal = formatValue(diff.old)
                const newVal = formatValue(diff.new)
                return diff.old !== undefined
                  ? `${field}: ${oldVal} → ${newVal}`
                  : `${field}: ${newVal}`
              })
              .join("; ")
          : ""

        return [
          formatDate(r.createdAt),
          r.actorName,
          formatRole(r.actorRole),
          formatAction(r.action),
          r.entityType,
          r.entityName ?? "",
          changesStr,
        ].map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
      })

      const csv = [csvHeaders.join(","), ...csvRows.map((r) => r.join(","))].join("\n")

      // Trigger download.
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
      link.click()
      URL.revokeObjectURL(url)
    } catch {
      // Silently fail — the user will see the button stop spinning.
    } finally {
      setExporting(false)
    }
  }

  // Debounce search
  React.useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  // Reset page on filter change
  React.useEffect(() => {
    setPage(1)
  }, [entityFilter, actionFilter])

  // Fetch data
  React.useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const params = new URLSearchParams()
      params.set("page", String(page))
      params.set("pageSize", String(PAGE_SIZE))
      if (entityFilter) params.set("entityType", entityFilter)
      if (actionFilter) params.set("action", actionFilter)
      if (debouncedSearch) params.set("search", debouncedSearch)

      try {
        const res = await fetch(`/api/admin/audit-log?${params}`)
        if (!res.ok) throw new Error("Failed to fetch")
        const json = await res.json()
        if (!cancelled) {
          setEntries(json.data)
          setTotal(json.total)
        }
      } catch {
        if (!cancelled) {
          setEntries([])
          setTotal(0)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [page, entityFilter, actionFilter, debouncedSearch])

  // Click outside to close dropdown
  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (actionDropdownRef.current && !actionDropdownRef.current.contains(e.target as Node)) {
        setActionDropdownOpen(false)
      }
    }
    if (actionDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside)
    }
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [actionDropdownOpen])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const entityTabs: { label: string; value: EntityFilter }[] = [
    { label: "All", value: "" },
    { label: "Users", value: "user" },
    { label: "Clients", value: "client" },
    { label: "Units", value: "unit" },
  ]

  const actionOptions: { label: string; value: ActionFilter }[] = [
    { label: "All Actions", value: "" },
    { label: "Create", value: "create" },
    { label: "Update", value: "update" },
    { label: "Delete", value: "delete" },
    { label: "Reset PIN", value: "reset_pin" },
    { label: "Toggle Status", value: "toggle_status" },
  ]

  return (
    <div className="flex flex-col gap-8">
      {/* Top bar */}
      <div className="flex items-center justify-between rounded-xl bg-white px-6 py-4">
        <Link href="/home">
          <Button
            variant="outline"
            size="sm"
            className="rounded-lg border-black px-6 py-2 gap-3"
          >
            <ArrowLeft className="size-4" />
            Back
          </Button>
        </Link>
      </div>

      {/* Heading */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
          Audit Log
        </h1>
        <Button
          className="hidden justify-center gap-2 rounded-xl bg-[#3ea3db] px-8 py-6 text-sm font-medium text-white hover:bg-[#3ea3db]/90 sm:inline-flex"
          size="lg"
          onClick={handleExportCsv}
          disabled={exporting || entries.length === 0}
        >
          {exporting ? (
            <>
              Exporting...
              <svg className="ml-1 size-4 animate-spin" viewBox="0 0 40 40" fill="none">
                <circle cx="20" cy="20" r="15" stroke="#d1d5db" strokeWidth="5" strokeLinecap="round" />
                <circle cx="20" cy="20" r="15" stroke="white" strokeWidth="5" strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset="70" />
              </svg>
            </>
          ) : (
            <>
              Export CSV
              <Download className="ml-1 size-4" />
            </>
          )}
        </Button>
      </div>
      <p className="-mt-6 text-base text-gray-500">
        View a record of all administrative actions
      </p>

      {/* Mobile-only export button */}
      <Button
        className="w-full justify-center gap-2 rounded-xl bg-[#3ea3db] px-6 py-5 text-sm font-medium text-white hover:bg-[#3ea3db]/90 sm:hidden"
        size="lg"
        onClick={handleExportCsv}
        disabled={exporting || entries.length === 0}
      >
        {exporting ? "Exporting..." : "Export CSV"}
        <Download className="ml-1 size-4" />
      </Button>

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Entity type tabs */}
        <div className="flex items-center gap-2">
          {entityTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setEntityFilter(tab.value)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                entityFilter === tab.value
                  ? "bg-[#3ea3db] text-white"
                  : "text-gray-600 hover:bg-gray-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center">
          {/* Action dropdown */}
          <div ref={actionDropdownRef} className="relative w-full sm:w-48 sm:shrink-0">
            <button
              type="button"
              onClick={() => setActionDropdownOpen(!actionDropdownOpen)}
              className={`flex h-8 w-full items-center justify-between rounded-lg border bg-white px-2.5 py-2 text-sm transition-colors hover:border-ring ${
                actionFilter ? "text-gray-900 border-gray-900" : "text-muted-foreground border-input"
              }`}
            >
              <span className="truncate">
                {actionOptions.find((o) => o.value === actionFilter)?.label ?? "All Actions"}
              </span>
              <ChevronDown className={`size-4 shrink-0 text-gray-400 transition-transform ${actionDropdownOpen ? "rotate-180" : ""}`} />
            </button>

            {actionDropdownOpen && (
              <div className="absolute left-0 top-full z-10 mt-1 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
                <div className="mx-2 my-2 flex max-h-64 flex-col gap-1 overflow-y-auto">
                  {actionOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setActionFilter(opt.value)
                        setActionDropdownOpen(false)
                      }}
                      className={`w-full rounded-lg px-4 py-3 text-left text-sm text-gray-900 transition-colors hover:bg-[#3ea3db]/15 ${
                        actionFilter === opt.value ? "bg-[#3ea3db]/15 font-medium" : ""
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Search */}
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
            <Input
              type="text"
              placeholder="Search by name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-white py-2 pl-8"
              aria-label="Search audit log"
            />
          </div>
        </div>
      </div>

      {/* Entries */}
      <div className="relative flex min-w-0 flex-col gap-3">
        {/* Loading overlay — shows spinner over existing content during page/filter changes */}
        {loading && entries.length > 0 && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/70">
            <svg className="size-10 animate-spin" viewBox="0 0 40 40" fill="none">
              <circle cx="20" cy="20" r="15" stroke="#d1d5db" strokeWidth="5" strokeLinecap="round" />
              <circle cx="20" cy="20" r="15" stroke="#3ea3db" strokeWidth="5" strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset="70" />
            </svg>
          </div>
        )}

        {/* Initial load spinner — no entries yet */}
        {loading && entries.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-3 rounded-xl bg-white">
            <svg className="size-10 animate-spin" viewBox="0 0 40 40" fill="none">
              <circle cx="20" cy="20" r="15" stroke="#d1d5db" strokeWidth="5" strokeLinecap="round" />
              <circle cx="20" cy="20" r="15" stroke="#3ea3db" strokeWidth="5" strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset="70" />
            </svg>
            <span className="text-sm text-gray-400">Loading audit log...</span>
          </div>
        ) : !loading && entries.length === 0 ? (
          <div className="flex h-24 items-center justify-center rounded-xl bg-white text-gray-400">
            No entries found
          </div>
        ) : (
          entries.map((entry) => {
            const isExpanded = expandedId === entry.id
            const hasChanges = entry.changes && Object.keys(entry.changes).length > 0

            return (
              <React.Fragment key={entry.id}>
                {/* Mobile card — below md: */}
                <div className="flex flex-col gap-3 rounded-xl bg-white p-4 md:hidden">
                  {/* Top row: action + entity badges */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={`rounded-full border px-3 py-1 text-xs font-medium ${getActionStyle(entry.action)}`}>
                      {formatAction(entry.action)}
                    </Badge>
                    <Badge className={`rounded-full border px-3 py-1 text-xs font-medium ${getEntityStyle(entry.entityType)}`}>
                      {entry.entityType}
                    </Badge>
                  </div>

                  {/* Fields */}
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-bold text-gray-900">When</span>
                      <span className="text-sm text-gray-600">{formatDate(entry.createdAt)}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-bold text-gray-900">Who</span>
                      <span className="text-sm text-gray-600">{entry.actorName} ({formatRole(entry.actorRole)})</span>
                    </div>
                    {entry.entityName && (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-bold text-gray-900">Target</span>
                        <span className="text-sm text-gray-600">{entry.entityName}</span>
                      </div>
                    )}
                  </div>

                  {/* Expandable changes */}
                  {hasChanges && (
                    <>
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                        className="self-start text-xs font-medium text-[#3ea3db] hover:underline"
                      >
                        {isExpanded ? "Hide details" : "Show details"}
                      </button>
                      {isExpanded && (
                        <div className="rounded-lg bg-gray-50 p-3">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-left text-gray-500">
                                <th className="pb-1 pr-2 font-medium">Field</th>
                                <th className="pb-1 pr-2 font-medium">Old</th>
                                <th className="pb-1 font-medium">New</th>
                              </tr>
                            </thead>
                            <tbody>
                              {Object.entries(entry.changes!).map(([field, diff]) => (
                                <tr key={field} className="border-t border-gray-200">
                                  <td className="py-1 pr-2 font-medium text-gray-700">{field}</td>
                                  <td className="py-1 pr-2 text-red-500">{formatValue(diff.old)}</td>
                                  <td className="py-1 text-green-600">{formatValue(diff.new)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Desktop row — md: and up */}
                <div className="hidden md:block rounded-xl bg-white px-6 py-4">
                  <div
                    className="grid grid-cols-[160px_1fr_100px_80px_1fr_80px] items-center gap-4 cursor-pointer"
                    onClick={() => hasChanges && setExpandedId(isExpanded ? null : entry.id)}
                  >
                    {/* Timestamp */}
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-bold text-gray-900">When</span>
                      <span className="text-xs text-gray-600">{formatDate(entry.createdAt)}</span>
                    </div>

                    {/* Actor */}
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-bold text-gray-900">Who</span>
                      <span className="truncate text-sm text-gray-600">
                        {entry.actorName}
                        <span className="ml-1 text-xs text-gray-400">({entry.actorRole.replace(/_/g, " ")})</span>
                      </span>
                    </div>

                    {/* Action badge */}
                    <div>
                      <Badge className={`rounded-full border px-3 py-1 text-xs font-medium ${getActionStyle(entry.action)}`}>
                        {formatAction(entry.action)}
                      </Badge>
                    </div>

                    {/* Entity type badge */}
                    <div>
                      <Badge className={`rounded-full border px-3 py-1 text-xs font-medium ${getEntityStyle(entry.entityType)}`}>
                        {entry.entityType}
                      </Badge>
                    </div>

                    {/* Entity name */}
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-bold text-gray-900">Target</span>
                      <span className="truncate text-sm text-gray-600">{entry.entityName ?? "-"}</span>
                    </div>

                    {/* Expand indicator */}
                    <div className="flex justify-end">
                      {hasChanges && (
                        <span className="text-xs text-[#3ea3db]">
                          {isExpanded ? "Hide" : "Details"}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Expanded changes diff */}
                  {isExpanded && hasChanges && (
                    <div className="mt-3 rounded-lg bg-gray-50 p-4">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-gray-500">
                            <th className="pb-2 pr-4 font-medium">Field</th>
                            <th className="pb-2 pr-4 font-medium">Old Value</th>
                            <th className="pb-2 font-medium">New Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(entry.changes!).map(([field, diff]) => (
                            <tr key={field} className="border-t border-gray-200">
                              <td className="py-2 pr-4 font-medium text-gray-700">{field}</td>
                              <td className="py-2 pr-4 text-red-500">{formatValue(diff.old)}</td>
                              <td className="py-2 text-green-600">{formatValue(diff.new)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </React.Fragment>
            )
          })
        )}
      </div>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
          <p className="text-sm text-gray-500">
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className={`flex size-9 items-center justify-center rounded-lg border transition-colors ${
                page === 1
                  ? "border-gray-200 text-gray-300 cursor-not-allowed"
                  : "border-gray-300 text-gray-600 hover:bg-gray-100"
              }`}
            >
              <ChevronLeft className="size-4" />
            </button>

            {(() => {
              // Windowed pagination: show first, last, and a window around the current page.
              const pages: (number | "ellipsis")[] = []
              if (totalPages <= 7) {
                for (let i = 1; i <= totalPages; i++) pages.push(i)
              } else {
                pages.push(1)
                if (page > 3) pages.push("ellipsis")
                const start = Math.max(2, page - 1)
                const end = Math.min(totalPages - 1, page + 1)
                for (let i = start; i <= end; i++) pages.push(i)
                if (page < totalPages - 2) pages.push("ellipsis")
                pages.push(totalPages)
              }

              return pages.map((p, idx) =>
                p === "ellipsis" ? (
                  <span
                    key={`ellipsis-${idx}`}
                    className="flex size-9 items-center justify-center text-sm text-gray-400"
                  >
                    ...
                  </span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPage(p)}
                    className={`flex size-9 items-center justify-center rounded-lg text-sm font-medium transition-colors ${
                      p === page
                        ? "bg-[#3ea3db] text-white"
                        : "border border-gray-300 text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    {p}
                  </button>
                )
              )
            })()}

            <button
              type="button"
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className={`flex size-9 items-center justify-center rounded-lg border transition-colors ${
                page === totalPages
                  ? "border-gray-200 text-gray-300 cursor-not-allowed"
                  : "border-gray-300 text-gray-600 hover:bg-gray-100"
              }`}
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
