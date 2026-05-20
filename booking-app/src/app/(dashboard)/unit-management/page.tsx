"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, Search, Plus, ChevronDown, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/ui/status-badge"
import { Input } from "@/components/ui/input"
import { SearchInput } from "@/components/ui/search-input"
import { FilterPill } from "@/components/ui/filter-pill"
import { DesktopRow } from "@/components/ui/desktop-row"
import { EmptyState } from "@/components/ui/empty-state"
import { Banner } from "@/components/ui/banner"
import { SubNav } from "@/components/ui/sub-nav"
import { useUnitStore, type UnitRecord } from "@/lib/unit-store"
import { useClientStore } from "@/lib/client-store"
import { useAuth } from "@/lib/auth-store"
import { ListPagination, usePagination } from "@/components/list-pagination"
import { DataCard } from "@/components/data-card"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  const { clients } = useClientStore()
  // Unit creation is system_admin only on the server (POST /api/admin/units
  // requires that role). Hide the "New Unit" button for everyone else so
  // the action they can't complete isn't visible.
  const { isSystemAdmin } = useAuth()

  // clientId → faviconUrl lookup. Built once per render so the row map
  // doesn't repeat the find for every unit.
  const faviconByClient = React.useMemo(
    () => new Map(clients.map((c) => [c.id, c.faviconUrl])),
    [clients]
  )

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

  const {
    visible: pagedUnits,
    currentPage,
    setCurrentPage,
    totalPages,
    totalItems,
    pageSize,
  } = usePagination(visibleUnits)

  return (
    <div data-testid="unit-management-page" className="flex flex-col gap-8">
      {/* Top bar */}
      <SubNav backHref="/home" backTestId="back-button" />

      {/* Unit added banner */}
      {addedBanner && (
        <Banner
          title="Unit Successfully Added"
          description={`${addedBanner} has been added to the system successfully.`}
          onDismiss={() => setAddedBanner(null)}
        />
      )}

      {/* Delete success banner */}
      {deleteBanner && (
        <Banner
          title={`${deleteBanner} Deleted`}
          description="The unit has been successfully removed from the system."
          onDismiss={() => setDeleteBanner(null)}
        />
      )}

      {/* Status change banner */}
      {statusBanner && (
        <Banner
          title={
            statusBanner.type === "activated"
              ? `${statusBanner.name} has been activated successfully`
              : "Unit Disabled"
          }
          description={
            statusBanner.type === "activated"
              ? "Access has been restored and the unit is now active on the system."
              : `${statusBanner.name}'s access has been paused.`
          }
          onDismiss={() => setStatusBanner(null)}
        />
      )}

      {/* Heading — on desktop (sm+) the button sits on the right of the title;
          on mobile the button is rendered separately below the subtitle. */}
      <div className="flex items-center justify-between">
        <h1
          data-testid="page-heading"
          className="text-2xl font-bold text-ink sm:text-3xl"
        >
          Unit Management
        </h1>
        {isSystemAdmin && (
          <Button
            data-testid="new-unit-button"
            variant="accent"
            size="cta-lg"
            className="hidden sm:inline-flex"
            onClick={() => router.push("/unit-management/add")}
          >
            New Unit
            <Plus className="ml-1 size-4" />
          </Button>
        )}
      </div>
      <p
        data-testid="page-subtitle"
        className="-mt-6 text-base text-ink-muted"
      >
        Add new units and link them to clients from one central place
      </p>

      {/* Mobile-only primary action — same role gate as the desktop button. */}
      {isSystemAdmin && (
        <Button
          data-testid="new-unit-button-mobile"
          variant="accent"
          size="cta-lg"
          className="w-full sm:hidden"
          onClick={() => router.push("/unit-management/add")}
        >
          New Unit
          <Plus className="ml-1 size-4" />
        </Button>
      )}

      {/* Filters + Select Province + Search */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div
          data-testid="filter-tabs"
          className="flex items-center gap-2"
        >
          {([
            { key: "all", label: "All", count: allCount },
            { key: "active", label: "Active", count: activeCount },
            { key: "disabled", label: "Disabled", count: disabledCount },
          ] as const).map((tab) => (
            <FilterPill
              key={tab.key}
              active={activeFilter === tab.key}
              label={tab.label}
              count={tab.count}
              onClick={() => setActiveFilter(tab.key)}
              testId={`filter-${tab.key}`}
            />
          ))}
        </div>

        <div className="flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center">
          {/* Select Province dropdown */}
          <div ref={dropdownRef} className="relative w-full sm:w-48 sm:shrink-0">
            <button
              type="button"
              data-testid="select-province-dropdown"
              onClick={() => setIsProvinceDropdownOpen(!isProvinceDropdownOpen)}
              className={`flex h-8 w-full items-center justify-between rounded-lg border bg-white px-2.5 py-2 text-sm transition-colors hover:border-ring ${
                selectedProvince ? "text-ink border-gray-900" : "text-muted-foreground border-input"
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
                    className={`w-full rounded-lg px-4 py-3 text-left text-sm text-ink transition-colors hover:bg-[var(--client-primary-15)] ${
                      selectedProvince === "" ? "bg-[var(--client-primary-15)] font-medium" : ""
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
                      className={`w-full rounded-lg px-4 py-3 text-left text-sm text-ink transition-colors hover:bg-[var(--client-primary-15)] ${
                        selectedProvince === province ? "bg-[var(--client-primary-15)] font-medium" : ""
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
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search Unit Name"
            testId="search-input"
          />
        </div>
      </div>

      {/* Unit Cards */}
      <div data-testid="unit-table" className="flex min-w-0 flex-col gap-3 overflow-x-auto">
        {loading ? (
          <div className="flex h-24 items-center justify-center rounded-xl bg-white text-gray-400">
            Loading units...
          </div>
        ) : visibleUnits.length === 0 ? (
          <EmptyState>No units found</EmptyState>
        ) : (
          pagedUnits.map((unit) => {
            const statusBadge = (
              <StatusBadge
                status={unit.status}
                testId={`status-badge-${unit.id}`}
              />
            )
            const manageButton = (
              <Button
                data-testid={`manage-button-${unit.id}`}
                variant="primary"
                size="cta"
                className="w-full"
                onClick={() => router.push(`/unit-management/manage?id=${unit.id}`)}
              >
                Manage
              </Button>
            )

            return (
              <React.Fragment key={unit.id}>
                {/* Mobile / tablet card — below md: */}
                <div className="md:hidden">
                  <DataCard
                    data-testid={`unit-card-${unit.id}`}
                    status={statusBadge}
                    action={manageButton}
                    media={(() => {
                      const faviconUrl = faviconByClient.get(unit.clientId)
                      return faviconUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={faviconUrl}
                          alt=""
                          className="size-10 shrink-0 rounded-md border border-gray-200 bg-white object-cover"
                        />
                      ) : (
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-[9px] font-medium uppercase tracking-wider text-gray-400">
                          Icon
                        </div>
                      )
                    })()}
                    fields={[
                      { label: "Unit Name", value: unit.unitName },
                      { label: "Client", value: unit.clientName },
                      { label: "Email", value: unit.email || "-" },
                      { label: "Province", value: unit.province || "-" },
                    ]}
                  />
                </div>

                {/* Desktop row — md: and up. */}
                <DesktopRow
                  testId={`unit-row-${unit.id}`}
                  gridTemplate="160px 1fr 1fr 1fr 1fr 140px"
                >
                  {/* Status badge */}
                  <div className="flex items-center">{statusBadge}</div>

                  {/* Unit Name (with parent client favicon thumbnail —
                      surfaces who the unit belongs to at a glance, useful
                      when the same unit name appears under multiple
                      clients e.g. "Sandton" / "Sandton" / "Sandton"). */}
                  <div className="flex min-w-0 items-center gap-3 text-left">
                    {(() => {
                      const faviconUrl = faviconByClient.get(unit.clientId)
                      return faviconUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={faviconUrl}
                          alt=""
                          className="size-9 shrink-0 rounded-md border border-gray-200 bg-white object-cover"
                        />
                      ) : (
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-[9px] font-medium uppercase tracking-wider text-gray-400">
                          Icon
                        </div>
                      )
                    })()}
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-xs font-bold text-ink">Unit Name</span>
                      <span className="truncate text-sm text-ink-muted" title={unit.unitName}>{unit.unitName}</span>
                    </div>
                  </div>

                  {/* Client */}
                  <div className="flex min-w-0 flex-col gap-0.5 text-left">
                    <span className="text-xs font-bold text-ink">Client</span>
                    <span className="truncate text-sm text-ink-muted" title={unit.clientName}>{unit.clientName}</span>
                  </div>

                  {/* Email */}
                  <div className="flex min-w-0 flex-col gap-0.5 text-left">
                    <span className="text-xs font-bold text-ink">Email</span>
                    <span className="truncate text-sm text-ink-muted" title={unit.email || undefined}>{unit.email || "-"}</span>
                  </div>

                  {/* Province */}
                  <div className="flex min-w-0 flex-col gap-0.5 text-left">
                    <span className="text-xs font-bold text-ink">Province</span>
                    <span className="truncate text-sm text-ink-muted" title={unit.province || undefined}>{unit.province || "-"}</span>
                  </div>

                  {/* Action */}
                  <div className="flex">{manageButton}</div>
                </DesktopRow>
              </React.Fragment>
            )
          })
        )}
      </div>

      {/* Pagination */}
      <ListPagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
      />
    </div>
  )
}
