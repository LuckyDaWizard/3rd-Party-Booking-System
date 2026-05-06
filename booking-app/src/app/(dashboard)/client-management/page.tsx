"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, Search, Plus, ChevronDown, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { useClientStore, type ClientStatus, type ClientRecord } from "@/lib/client-store"
import { ListPagination, usePagination } from "@/components/list-pagination"
import { DataCard } from "@/components/data-card"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getStatusStyle(status: ClientStatus): string {
  switch (status) {
    case "Active":
      return "bg-green-100 text-green-600 border-transparent"
    case "Disabled":
      return "bg-yellow-100 text-yellow-800 border-transparent"
  }
}

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

      {/* Delete success banner. The delete is a hard delete — the button
          below does NOT restore the original row (its ID, associated units,
          audit history, etc. are gone). It's a convenience shortcut that
          recreates a fresh client record pre-filled with the deleted one's
          details, which saves typing if the delete was a mistake. Wording
          is explicit about that so staff aren't misled. */}
      {deleteBanner && (
        <div className="flex items-start justify-between rounded-xl border border-green-200 bg-green-50 px-6 py-5">
          <div className="flex flex-col gap-2">
            <span className="text-base font-bold text-gray-900">
              {deleteBanner.name} Deleted
            </span>
            <p className="text-sm text-gray-500">
              The client has been permanently removed. If this was a mistake,
              you can quickly recreate a new client record with the same
              details. Note: units, bookings, and audit history from the
              original record are not recoverable.
            </p>
            <Button
              data-testid="recreate-client-button"
              size="sm"
              className="w-fit rounded-lg bg-gray-900 px-4 py-2 text-xs text-white hover:bg-gray-800"
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
                : "Client Disabled"}
            </span>
            <p className="text-sm text-gray-500">
              {statusBanner.type === "activated"
                ? "Access has been restored and the client is now active on the system."
                : `${statusBanner.name}'s access to all associated units and users has been paused.`}
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

      {/* Heading — on desktop (sm+) the button sits on the right of the title;
          on mobile the button is rendered separately below the subtitle (see below). */}
      <div className="flex items-center justify-between">
        <h1
          data-testid="page-heading"
          className="text-2xl font-bold text-gray-900 sm:text-3xl"
        >
          Client Management
        </h1>
        <Button
          data-testid="new-client-button"
          className="hidden justify-center gap-2 rounded-xl bg-[var(--client-primary)] px-8 py-6 text-sm font-medium text-white hover:bg-[var(--client-primary-90)] sm:inline-flex"
          size="lg"
          onClick={() => router.push("/client-management/add")}
        >
          New Client
          <Plus className="ml-1 size-4" />
        </Button>
      </div>
      <p
        data-testid="page-subtitle"
        className="-mt-6 text-base text-gray-500"
      >
        Add, update, and manage client status in one central place.
      </p>

      {/* Mobile-only primary action — sits between subtitle and filters on
          phones/small screens, where the desktop-placed button is hidden. */}
      <Button
        data-testid="new-client-button-mobile"
        className="w-full justify-center gap-2 rounded-xl bg-[var(--client-primary)] px-6 py-5 text-sm font-medium text-white hover:bg-[var(--client-primary-90)] sm:hidden"
        size="lg"
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
          <button
            type="button"
            data-testid="filter-all"
            onClick={() => setActiveFilter("all")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeFilter === "all"
                ? "bg-[var(--client-primary)] text-white"
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
                ? "bg-[var(--client-primary)] text-white"
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
                ? "bg-[var(--client-primary)] text-white"
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

        <div className="flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center">
          {/* Select Client dropdown */}
          <div ref={dropdownRef} className="relative w-full sm:w-48 sm:shrink-0">
            <button
              type="button"
              data-testid="select-client-dropdown"
              onClick={() => setIsClientDropdownOpen(!isClientDropdownOpen)}
              className={`flex h-8 w-full items-center justify-between rounded-lg border bg-white px-2.5 py-2 text-sm transition-colors hover:border-ring ${
                selectedClient ? "text-gray-900 border-gray-900" : "text-muted-foreground border-input"
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
                    className={`w-full rounded-lg px-4 py-3 text-left text-sm text-gray-900 transition-colors hover:bg-[var(--client-primary-15)] ${
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
                      className={`w-full rounded-lg px-4 py-3 text-left text-sm text-gray-900 transition-colors hover:bg-[var(--client-primary-15)] ${
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
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
            <Input
              data-testid="search-input"
              type="text"
              placeholder="Search Client Email"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-white py-2 pl-8"
              aria-label="Search Client Email"
            />
          </div>
        </div>
      </div>

      {/* Client Cards */}
      <div data-testid="client-table" className="flex min-w-0 flex-col gap-3 overflow-x-auto">
        {visibleClients.length === 0 ? (
          <div
            className="flex h-24 items-center justify-center rounded-xl bg-white text-gray-400"
            data-testid="empty-state"
          >
            No clients found
          </div>
        ) : (
          pagedClients.map((client) => {
            const statusBadge = (
              <Badge
                data-testid={`status-badge-${client.id}`}
                className={`w-full rounded-full border px-4 py-5 text-center text-xs font-medium ${getStatusStyle(client.status)}`}
              >
                {client.status}
              </Badge>
            )
            const manageButton = (
              <Button
                data-testid={`manage-button-${client.id}`}
                className="w-full justify-center gap-2 rounded-xl bg-gray-900 px-4 py-5 text-sm font-medium text-white hover:bg-gray-800"
                size="lg"
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

                {/* Desktop row — md: and up. Existing layout, unchanged. */}
                <div
                  data-testid={`client-row-${client.id}`}
                  className="hidden md:grid grid-cols-[160px_1fr_1fr_1fr_1fr_140px] items-center gap-8 rounded-xl bg-white px-6 py-5"
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
                      <span className="text-xs font-bold text-gray-900">Client Name</span>
                      <span className="truncate text-sm text-gray-600" title={client.clientName}>{client.clientName}</span>
                    </div>
                  </div>

                  {/* Units */}
                  <div className="flex min-w-0 flex-col gap-0.5 text-left">
                    <span className="text-xs font-bold text-gray-900">Units</span>
                    <span className="truncate text-sm text-gray-600" title={client.units}>{client.units}</span>
                  </div>

                  {/* Email */}
                  <div className="flex min-w-0 flex-col gap-0.5 text-left">
                    <span className="text-xs font-bold text-gray-900">Email</span>
                    <span className="truncate text-sm text-gray-600" title={client.email}>{client.email}</span>
                  </div>

                  {/* Number */}
                  <div className="flex min-w-0 flex-col gap-0.5 text-left">
                    <span className="text-xs font-bold text-gray-900">Number</span>
                    <span className="truncate text-sm text-gray-600" title={client.number}>{client.number}</span>
                  </div>

                  {/* Action */}
                  <div className="flex">{manageButton}</div>
                </div>
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
