"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, Search, Plus, ChevronDown, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { useUnitStore, type UnitStatus, type UnitRecord } from "@/lib/unit-store"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getStatusStyle(status: UnitStatus): string {
  switch (status) {
    case "Active":
      return "bg-green-100 text-green-600 border-transparent"
    case "Disabled":
      return "bg-yellow-100 text-yellow-700 border-transparent"
  }
}

function countByFilter(
  units: UnitRecord[],
  filter: "all" | "active" | "disabled"
): number {
  if (filter === "all") return units.length
  if (filter === "active")
    return units.filter((u) => u.status === "Active").length
  return units.filter((u) => u.status === "Disabled").length
}

function filterUnits(
  units: UnitRecord[],
  filter: "all" | "active" | "disabled",
  search: string,
  selectedProvince: string
): UnitRecord[] {
  let filtered = units

  if (filter === "active") {
    filtered = filtered.filter((u) => u.status === "Active")
  } else if (filter === "disabled") {
    filtered = filtered.filter((u) => u.status === "Disabled")
  }

  if (selectedProvince) {
    filtered = filtered.filter((u) => u.province === selectedProvince)
  }

  if (search.trim()) {
    const q = search.toLowerCase()
    filtered = filtered.filter(
      (u) =>
        u.unitName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.clientName.toLowerCase().includes(q)
    )
  }

  return filtered
}

const PROVINCES = [
  "Eastern Cape",
  "Free State",
  "Gauteng",
  "KwaZulu-Natal",
  "Limpopo",
  "Mpumalanga",
  "North West",
  "Northern Cape",
  "Western Cape",
]

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function UnitManagementPage() {
  const [activeFilter, setActiveFilter] = React.useState<
    "all" | "active" | "disabled"
  >("all")
  const [searchQuery, setSearchQuery] = React.useState("")
  const [selectedProvince, setSelectedProvince] = React.useState("")
  const [isProvinceDropdownOpen, setIsProvinceDropdownOpen] = React.useState(false)
  const [addedBanner, setAddedBanner] = React.useState<string | null>(null)
  const [deleteBanner, setDeleteBanner] = React.useState<string | null>(null)
  const [statusBanner, setStatusBanner] = React.useState<{ type: "activated" | "disabled"; name: string } | null>(null)
  const dropdownRef = React.useRef<HTMLDivElement>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { units, loading } = useUnitStore()

  // Check for banners from URL params
  React.useEffect(() => {
    const addedName = searchParams.get("added")
    const deletedName = searchParams.get("deleted")
    const statusChanged = searchParams.get("statusChanged")
    const unitName = searchParams.get("unitName")

    if (addedName) {
      setAddedBanner(addedName)
    }
    if (deletedName) {
      setDeleteBanner(deletedName)
    }
    if (statusChanged && unitName) {
      setStatusBanner({ type: statusChanged as "activated" | "disabled", name: unitName })
    }
    if (addedName || deletedName || statusChanged) {
      window.history.replaceState({}, "", "/unit-management")
    }
  }, [searchParams])

  // Click outside to close dropdown
  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsProvinceDropdownOpen(false)
      }
    }
    if (isProvinceDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside)
    }
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isProvinceDropdownOpen])

  const allCount = countByFilter(units, "all")
  const activeCount = countByFilter(units, "active")
  const disabledCount = countByFilter(units, "disabled")

  const visibleUnits = filterUnits(units, activeFilter, searchQuery, selectedProvince)

  return (
    <div data-testid="unit-management-page" className="flex flex-col gap-8">
      {/* Top bar */}
      <div className="flex items-center justify-between rounded-xl bg-white px-6 py-4">
        <Link href="/home">
          <Button
            data-testid="back-button"
            variant="outline"
            size="sm"
            className="rounded-lg border-black px-6 py-2 gap-3"
          >
            <ArrowLeft className="size-4" />
            Back
          </Button>
        </Link>
      </div>

      {/* Unit added banner */}
      {addedBanner && (
        <div className="flex items-start justify-between rounded-xl border border-green-200 bg-green-50 px-6 py-5">
          <div className="flex flex-col gap-1">
            <span className="text-base font-bold text-gray-900">
              Unit Successfully Added
            </span>
            <p className="text-sm text-gray-500">
              {addedBanner} has been added to the system successfully.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAddedBanner(null)}
            className="shrink-0 rounded-full p-1 text-gray-400 hover:text-gray-600"
            aria-label="Dismiss"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Delete success banner */}
      {deleteBanner && (
        <div className="flex items-start justify-between rounded-xl border border-green-200 bg-green-50 px-6 py-5">
          <div className="flex flex-col gap-2">
            <span className="text-base font-bold text-gray-900">
              {deleteBanner} Deleted
            </span>
            <p className="text-sm text-gray-500">
              The unit has been successfully removed from the system.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDeleteBanner(null)}
            className="shrink-0 rounded-full p-1 text-gray-400 hover:text-gray-600"
            aria-label="Dismiss"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Status change banner */}
      {statusBanner && (
        <div className="flex items-start justify-between rounded-xl border border-green-200 bg-green-50 px-6 py-5">
          <div className="flex flex-col gap-1">
            <span className="text-base font-bold text-gray-900">
              {statusBanner.type === "activated"
                ? `${statusBanner.name} has been activated successfully`
                : "Unit Disabled"}
            </span>
            <p className="text-sm text-gray-500">
              {statusBanner.type === "activated"
                ? "Access has been restored and the unit is now active on the system."
                : `${statusBanner.name}'s access has been paused.`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="shrink-0 rounded-full p-1 text-gray-400 hover:text-gray-600"
            aria-label="Dismiss"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Heading */}
      <div className="flex items-center justify-between">
        <h1
          data-testid="page-heading"
          className="text-3xl font-bold text-gray-900"
        >
          Unit Management
        </h1>
        <Button
          data-testid="new-unit-button"
          className="w-auto justify-center gap-2 rounded-xl bg-[#3ea3db] px-8 py-6 text-sm font-medium text-white hover:bg-[#3ea3db]/90"
          size="lg"
          onClick={() => router.push("/unit-management/add")}
        >
          New Unit
          <Plus className="ml-1 size-4" />
        </Button>
      </div>
      <p
        data-testid="page-subtitle"
        className="-mt-6 text-base text-gray-500"
      >
        Add new units and link them to clients from one central place
      </p>

      {/* Filters + Select Province + Search */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div
          data-testid="filter-tabs"
          className="flex items-center gap-2"
        >
          <button
            type="button"
            data-testid="filter-all"
            onClick={() => setActiveFilter("all")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeFilter === "all"
                ? "bg-[#3ea3db] text-white"
                : "text-gray-600 hover:bg-gray-200"
            }`}
          >
            All
            <span
              className={`inline-flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-semibold ${
                activeFilter === "all"
                  ? "bg-white text-gray-900"
                  : "bg-gray-300 text-gray-700"
              }`}
            >
              {allCount}
            </span>
          </button>

          <button
            type="button"
            data-testid="filter-active"
            onClick={() => setActiveFilter("active")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeFilter === "active"
                ? "bg-[#3ea3db] text-white"
                : "text-gray-600 hover:bg-gray-200"
            }`}
          >
            Active
            <span
              className={`inline-flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-semibold ${
                activeFilter === "active"
                  ? "bg-white text-gray-900"
                  : "bg-gray-300 text-gray-700"
              }`}
            >
              {activeCount}
            </span>
          </button>

          <button
            type="button"
            data-testid="filter-disabled"
            onClick={() => setActiveFilter("disabled")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeFilter === "disabled"
                ? "bg-[#3ea3db] text-white"
                : "text-gray-600 hover:bg-gray-200"
            }`}
          >
            Disabled
            <span
              className={`inline-flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-semibold ${
                activeFilter === "disabled"
                  ? "bg-white text-gray-900"
                  : "bg-gray-300 text-gray-700"
              }`}
            >
              {disabledCount}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          {/* Select Province dropdown */}
          <div ref={dropdownRef} className="relative w-48 shrink-0">
            <button
              type="button"
              data-testid="select-province-dropdown"
              onClick={() => setIsProvinceDropdownOpen(!isProvinceDropdownOpen)}
              className={`flex h-8 w-full items-center justify-between rounded-lg border bg-white px-2.5 py-2 text-sm transition-colors hover:border-ring ${
                selectedProvince ? "text-gray-900 border-gray-900" : "text-muted-foreground border-input"
              }`}
            >
              <span className="truncate">{selectedProvince || "Select Province"}</span>
              <ChevronDown className={`size-4 shrink-0 text-gray-400 transition-transform ${isProvinceDropdownOpen ? "rotate-180" : ""}`} />
            </button>

            {isProvinceDropdownOpen && (
              <div className="absolute left-0 top-full z-10 mt-1 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
                <div className="mx-2 my-2 flex max-h-64 flex-col gap-1 overflow-y-auto">
                  {/* All option to clear filter */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedProvince("")
                      setIsProvinceDropdownOpen(false)
                    }}
                    className={`w-full rounded-lg px-4 py-3 text-left text-sm text-gray-900 transition-colors hover:bg-[#3ea3db]/15 ${
                      selectedProvince === "" ? "bg-[#3ea3db]/15 font-medium" : ""
                    }`}
                  >
                    All Provinces
                  </button>
                  {PROVINCES.map((province) => (
                    <button
                      key={province}
                      type="button"
                      onClick={() => {
                        setSelectedProvince(province)
                        setIsProvinceDropdownOpen(false)
                      }}
                      className={`w-full rounded-lg px-4 py-3 text-left text-sm text-gray-900 transition-colors hover:bg-[#3ea3db]/15 ${
                        selectedProvince === province ? "bg-[#3ea3db]/15 font-medium" : ""
                      }`}
                    >
                      {province}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Search */}
          <div className="relative w-72">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
            <Input
              data-testid="search-input"
              type="text"
              placeholder="Search Unit Name"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-white py-2 pl-8"
              aria-label="Search Unit Name"
            />
          </div>
        </div>
      </div>

      {/* Unit Cards */}
      <div data-testid="unit-table" className="flex min-w-0 flex-col gap-3 overflow-x-auto">
        {loading ? (
          <div className="flex h-24 items-center justify-center rounded-xl bg-white text-gray-400">
            Loading units...
          </div>
        ) : visibleUnits.length === 0 ? (
          <div
            className="flex h-24 items-center justify-center rounded-xl bg-white text-gray-400"
            data-testid="empty-state"
          >
            No units found
          </div>
        ) : (
          visibleUnits.map((unit) => (
            <div
              key={unit.id}
              data-testid={`unit-row-${unit.id}`}
              className="grid grid-cols-[160px_1fr_1fr_1fr_1fr_140px] items-center gap-8 rounded-xl bg-white px-6 py-5"
            >
              {/* Status badge */}
              <div className="flex items-center">
                <Badge
                  data-testid={`status-badge-${unit.id}`}
                  className={`w-full rounded-full border px-4 py-5 text-center text-xs font-medium ${getStatusStyle(unit.status)}`}
                >
                  {unit.status}
                </Badge>
              </div>

              {/* Unit Name */}
              <div className="flex flex-col gap-0.5 text-left">
                <span className="text-xs font-bold text-gray-900">Unit Name</span>
                <span className="truncate text-sm text-gray-600">{unit.unitName}</span>
              </div>

              {/* Client */}
              <div className="flex flex-col gap-0.5 text-left">
                <span className="text-xs font-bold text-gray-900">Client</span>
                <span className="truncate text-sm text-gray-600">{unit.clientName}</span>
              </div>

              {/* Email */}
              <div className="flex flex-col gap-0.5 text-left">
                <span className="text-xs font-bold text-gray-900">Email</span>
                <span className="truncate text-sm text-gray-600">{unit.email || "-"}</span>
              </div>

              {/* Province */}
              <div className="flex flex-col gap-0.5 text-left">
                <span className="text-xs font-bold text-gray-900">Province</span>
                <span className="truncate text-sm text-gray-600">{unit.province || "-"}</span>
              </div>

              {/* Action */}
              <div className="flex">
                <Button
                  data-testid={`manage-button-${unit.id}`}
                  className="w-full justify-center gap-2 rounded-xl bg-gray-900 px-4 py-5 text-sm font-medium text-white hover:bg-gray-800"
                  size="lg"
                  onClick={() => router.push(`/unit-management/manage?id=${unit.id}`)}
                >
                  Manage
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
