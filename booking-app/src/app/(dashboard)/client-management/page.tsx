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
import { useClientStore, type ClientRecord } from "@/lib/client-store"
import { ListPagination, usePagination } from "@/components/list-pagination"
import { DataCard } from "@/components/data-card"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countByFilter(
  clients: ClientRecord[],
  filter: "all" | "active" | "disabled"
): number {
  if (filter === "all") return clients.length
  if (filter === "active")
    return clients.filter((c) => c.status === "Active").length
  return clients.filter((c) => c.status === "Disabled").length
}

function filterClients(
  clients: ClientRecord[],
  filter: "all" | "active" | "disabled",
  search: string
): ClientRecord[] {
  let filtered = clients

  if (filter === "active") {
    filtered = filtered.filter((c) => c.status === "Active")
  } else if (filter === "disabled") {
    filtered = filtered.filter((c) => c.status === "Disabled")
  }

  if (search.trim()) {
    const q = search.toLowerCase()
    filtered = filtered.filter(
      (c) =>
        c.clientName.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q)
    )
  }

  return filtered
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ClientManagementPage() {
  const [activeFilter, setActiveFilter] = React.useState<
    "all" | "active" | "disabled"
  >("all")
  const [searchQuery, setSearchQuery] = React.useState("")
  const [selectedClient, setSelectedClient] = React.useState("")
  const [isClientDropdownOpen, setIsClientDropdownOpen] = React.useState(false)
  const [deleteBanner, setDeleteBanner] = React.useState<{ name: string; data: string } | null>(null)
  const [statusBanner, setStatusBanner] = React.useState<{ type: "activated" | "disabled"; name: string } | null>(null)
  const dropdownRef = React.useRef<HTMLDivElement>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { clients, loading, addClient } = useClientStore()

  // Check for banners from URL params
  React.useEffect(() => {
    const deletedName = searchParams.get("deleted")
    const deletedData = searchParams.get("data")
    const statusChanged = searchParams.get("statusChanged")
    const clientName = searchParams.get("clientName")

    if (deletedName) {
      setDeleteBanner({ name: deletedName, data: deletedData ?? "" })
    }
    if (statusChanged && clientName) {
      setStatusBanner({ type: statusChanged as "activated" | "disabled", name: clientName })
    }
    if (deletedName || statusChanged) {
      window.history.replaceState({}, "", "/client-management")
    }
  }, [searchParams])

  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsClientDropdownOpen(false)
      }
    }
    if (isClientDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside)
    }
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isClientDropdownOpen])

  const uniqueClientNames = Array.from(new Set(clients.map((c) => c.clientName)))

  const allCount = countByFilter(clients, "all")
  const activeCount = countByFilter(clients, "active")
  const disabledCount = countByFilter(clients, "disabled")

  const filteredByStatus = filterClients(clients, activeFilter, searchQuery)
  const visibleClients = selectedClient
    ? filteredByStatus.filter((c) => c.clientName === selectedClient)
    : filteredByStatus

  const {
    visible: pagedClients,
    currentPage,
    setCurrentPage,
    totalPages,
    totalItems,
    pageSize,
  } = usePagination(visibleClients)

  return (
    <div data-testid="client-management-page" className="flex flex-col gap-8">
      {/* Top bar */}
      <SubNav backHref="/home" backTestId="back-button" />

      {/* Delete success banner. The delete is a hard delete — the button
          below does NOT restore the original row (its ID, associated units,
          audit history, etc. are gone). It's a convenience shortcut that
          recreates a fresh client record pre-filled with the deleted one's
          details, which saves typing if the delete was a mistake. Wording
          is explicit about that so staff aren't misled. */}
      {deleteBanner && (
        <Banner
          title={`${deleteBanner.name} Deleted`}
          description="The client has been permanently removed. If this was a mistake, you can quickly recreate a new client record with the same details. Note: units, bookings, and audit history from the original record are not recoverable."
          onDismiss={() => setDeleteBanner(null)}
        >
          <Button
            data-testid="recreate-client-button"
            size="sm"
            className="mt-1 w-fit rounded-lg bg-gray-900 px-4 py-2 text-xs text-white hover:bg-gray-800"
            onClick={async () => {
              try {
                const data = JSON.parse(deleteBanner.data)
                await addClient({
                  clientName: data.clientName,
                  contactPersonName: data.contactPersonName ?? "",
                  contactPersonSurname: data.contactPersonSurname ?? "",
                  units: data.units ?? "-",
                  email: data.email,
                  number: data.number,
                  logoUrl: null,
                  faviconUrl: null,
                  accentColor: null,
                })
                setDeleteBanner(null)
              } catch {
                setDeleteBanner(null)
              }
            }}
          >
            Recreate with same details
          </Button>
        </Banner>
      )}

      {/* Status change banner */}
      {statusBanner && (
        <Banner
          title={
            statusBanner.type === "activated"
              ? `${statusBanner.name} has been activated successfully`
              : "Client Disabled"
          }
          description={
            statusBanner.type === "activated"
              ? "Access has been restored and the client is now active on the system."
              : `${statusBanner.name}'s access to all associated units and users has been paused.`
          }
          onDismiss={() => setStatusBanner(null)}
        />
      )}

      {/* Heading — on desktop (sm+) the button sits on the right of the title;
          on mobile the button is rendered separately below the subtitle (see below). */}
      <div className="flex items-center justify-between">
        <h1
          data-testid="page-heading"
          className="text-2xl font-bold text-ink sm:text-3xl"
        >
          Client Management
        </h1>
        <Button
          data-testid="new-client-button"
          variant="accent"
          size="cta-lg"
          className="hidden sm:inline-flex"
          onClick={() => router.push("/client-management/add")}
        >
          New Client
          <Plus className="ml-1 size-4" />
        </Button>
      </div>
      <p
        data-testid="page-subtitle"
        className="-mt-6 text-base text-ink-muted"
      >
        Add, update, and manage client status in one central place.
      </p>

      {/* Mobile-only primary action — sits between subtitle and filters on
          phones/small screens, where the desktop-placed button is hidden. */}
      <Button
        data-testid="new-client-button-mobile"
        variant="accent"
        size="cta-lg"
        className="w-full sm:hidden"
        onClick={() => router.push("/client-management/add")}
      >
        New Client
        <Plus className="ml-1 size-4" />
      </Button>

      {/* Filters + Select + Search */}
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
          {/* Select Client dropdown */}
          <div ref={dropdownRef} className="relative w-full sm:w-48 sm:shrink-0">
            <button
              type="button"
              data-testid="select-client-dropdown"
              onClick={() => setIsClientDropdownOpen(!isClientDropdownOpen)}
              className={`flex h-8 w-full items-center justify-between rounded-lg border bg-white px-2.5 py-2 text-sm transition-colors hover:border-ring ${
                selectedClient ? "text-ink border-gray-900" : "text-muted-foreground border-input"
              }`}
            >
              <span className="truncate">{selectedClient || "Select Client"}</span>
              <ChevronDown className={`size-4 shrink-0 text-gray-400 transition-transform ${isClientDropdownOpen ? "rotate-180" : ""}`} />
            </button>

            {isClientDropdownOpen && (
              <div className="absolute left-0 top-full z-10 mt-1 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
                <div className="mx-2 my-2 flex max-h-64 flex-col gap-1 overflow-y-auto">
                  {/* All option to clear filter */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedClient("")
                      setIsClientDropdownOpen(false)
                    }}
                    className={`w-full rounded-lg px-4 py-3 text-left text-sm text-ink transition-colors hover:bg-[var(--client-primary-15)] ${
                      selectedClient === "" ? "bg-[var(--client-primary-15)] font-medium" : ""
                    }`}
                  >
                    All Clients
                  </button>
                  {uniqueClientNames.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => {
                        setSelectedClient(name)
                        setIsClientDropdownOpen(false)
                      }}
                      className={`w-full rounded-lg px-4 py-3 text-left text-sm text-ink transition-colors hover:bg-[var(--client-primary-15)] ${
                        selectedClient === name ? "bg-[var(--client-primary-15)] font-medium" : ""
                      }`}
                    >
                      {name}
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
            placeholder="Search Client Email"
            testId="search-input"
          />
        </div>
      </div>

      {/* Client Cards */}
      <div data-testid="client-table" className="flex min-w-0 flex-col gap-3 overflow-x-auto">
        {visibleClients.length === 0 ? (
          <EmptyState>No clients found</EmptyState>
        ) : (
          pagedClients.map((client) => {
            const statusBadge = (
              <StatusBadge
                status={client.status}
                testId={`status-badge-${client.id}`}
              />
            )
            const manageButton = (
              <Button
                data-testid={`manage-button-${client.id}`}
                variant="primary"
                size="cta"
                className="w-full"
                onClick={() => router.push(`/client-management/manage?id=${client.id}`)}
              >
                Manage
              </Button>
            )

            return (
              <React.Fragment key={client.id}>
                {/* Mobile / tablet card — below md: */}
                <div className="md:hidden">
                  <DataCard
                    data-testid={`client-card-${client.id}`}
                    status={statusBadge}
                    action={manageButton}
                    media={
                      client.faviconUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={client.faviconUrl}
                          alt=""
                          className="size-10 shrink-0 rounded-md border border-gray-200 bg-white object-cover"
                        />
                      ) : (
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-[9px] font-medium uppercase tracking-wider text-gray-400">
                          Icon
                        </div>
                      )
                    }
                    fields={[
                      { label: "Client Name", value: client.clientName },
                      { label: "Units", value: client.units },
                      { label: "Email", value: client.email },
                      { label: "Number", value: client.number },
                    ]}
                  />
                </div>

                {/* Desktop row — md: and up. */}
                <DesktopRow
                  testId={`client-row-${client.id}`}
                  gridTemplate="160px 1fr 1fr 1fr 1fr 140px"
                >
                  {/* Status badge */}
                  <div className="flex items-center">{statusBadge}</div>

                  {/* Client Name (with favicon thumbnail — favicons are
                      square so they sit better than wide logos in a 36px
                      slot. Strict swap: no fallback to logo here, the empty
                      placeholder nudges admins to upload a favicon.) */}
                  <div className="flex min-w-0 items-center gap-3 text-left">
                    {client.faviconUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={client.faviconUrl}
                        alt=""
                        className="size-9 shrink-0 rounded-md border border-gray-200 bg-white object-cover"
                      />
                    ) : (
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-[9px] font-medium uppercase tracking-wider text-gray-400">
                        Icon
                      </div>
                    )}
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-xs font-bold text-ink">Client Name</span>
                      <span className="truncate text-sm text-ink-muted" title={client.clientName}>{client.clientName}</span>
                    </div>
                  </div>

                  {/* Units */}
                  <div className="flex min-w-0 flex-col gap-0.5 text-left">
                    <span className="text-xs font-bold text-ink">Units</span>
                    <span className="truncate text-sm text-ink-muted" title={client.units}>{client.units}</span>
                  </div>

                  {/* Email */}
                  <div className="flex min-w-0 flex-col gap-0.5 text-left">
                    <span className="text-xs font-bold text-ink">Email</span>
                    <span className="truncate text-sm text-ink-muted" title={client.email}>{client.email}</span>
                  </div>

                  {/* Number */}
                  <div className="flex min-w-0 flex-col gap-0.5 text-left">
                    <span className="text-xs font-bold text-ink">Number</span>
                    <span className="truncate text-sm text-ink-muted" title={client.number}>{client.number}</span>
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
