"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, Search, Plus, ChevronDown, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { useUserStore, type UserStatus, type UserRecord } from "@/lib/user-store"
import { useClientStore } from "@/lib/client-store"
import { useAuth } from "@/lib/auth-store"
import { ListPagination, usePagination } from "@/components/list-pagination"
import { DataCard } from "@/components/data-card"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getStatusStyle(status: UserStatus): string {
  switch (status) {
    case "Active":
      return "bg-green-100 text-green-600 border-transparent"
    case "Disabled":
      return "bg-yellow-100 text-yellow-800 border-transparent"
  }
}

function countByFilter(
  users: UserRecord[],
  filter: "all" | "active" | "disabled"
): number {
  if (filter === "all") return users.length
  if (filter === "active")
    return users.filter((u) => u.status === "Active").length
  return users.filter((u) => u.status === "Disabled").length
}

function filterUsers(
  users: UserRecord[],
  filter: "all" | "active" | "disabled",
  search: string,
  selectedClient: string
): UserRecord[] {
  let filtered = users

  if (filter === "active") {
    filtered = filtered.filter((u) => u.status === "Active")
  } else if (filter === "disabled") {
    filtered = filtered.filter((u) => u.status === "Disabled")
  }

  if (selectedClient) {
    filtered = filtered.filter((u) => u.clientName === selectedClient)
  }

  if (search.trim()) {
    const q = search.toLowerCase()
    filtered = filtered.filter(
      (u) =>
        u.firstNames.toLowerCase().includes(q) ||
        u.surname.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
    )
  }

  return filtered
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function UserManagementPage() {
  const [activeFilter, setActiveFilter] = React.useState<
    "all" | "active" | "disabled"
  >("all")
  const [searchQuery, setSearchQuery] = React.useState("")
  const [selectedClient, setSelectedClient] = React.useState("")
  const [isClientDropdownOpen, setIsClientDropdownOpen] = React.useState(false)
  const [addedBanner, setAddedBanner] = React.useState<{ name: string; pin: string | null } | null>(null)
  const [deleteBanner, setDeleteBanner] = React.useState<string | null>(null)
  const [statusBanner, setStatusBanner] = React.useState<{ type: "activated" | "disabled"; name: string } | null>(null)
  const dropdownRef = React.useRef<HTMLDivElement>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { users, loading } = useUserStore()
  const { clients } = useClientStore()
  const { user: authUser } = useAuth()

  // Hide the logged-in user from the list
  const listUsers = users.filter((u) => u.id !== authUser?.id)

  // Check for banners from URL params
  React.useEffect(() => {
    const addedName = searchParams.get("added")
    const deletedName = searchParams.get("deleted")
    const statusChanged = searchParams.get("statusChanged")
    const userName = searchParams.get("userName")

    if (addedName) {
      // Read the new user's PIN from sessionStorage (stored by the add page
      // to avoid leaking it in the URL). Read once and delete immediately.
      let newPin: string | null = null
      try {
        newPin = sessionStorage.getItem("carefirst_new_user_pin")
        sessionStorage.removeItem("carefirst_new_user_pin")
      } catch {
        // ignore
      }
      setAddedBanner({ name: addedName, pin: newPin })
    }
    if (deletedName) {
      setDeleteBanner(deletedName)
    }
    if (statusChanged && userName) {
      setStatusBanner({ type: statusChanged as "activated" | "disabled", name: userName })
    }
    if (addedName || deletedName || statusChanged) {
      window.history.replaceState({}, "", "/user-management")
    }
  }, [searchParams])

  // Click outside to close dropdown
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

  const allCount = countByFilter(listUsers, "all")
  const activeCount = countByFilter(listUsers, "active")
  const disabledCount = countByFilter(listUsers, "disabled")

  const visibleUsers = filterUsers(listUsers, activeFilter, searchQuery, selectedClient)

  const {
    visible: pagedUsers,
    currentPage,
    setCurrentPage,
    totalPages,
    totalItems,
    pageSize,
  } = usePagination(visibleUsers)

  return (
    <div data-testid="user-management-page" className="flex flex-col gap-8">
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

      {/* User added banner */}
      {addedBanner && (
        <div className="flex items-start justify-between rounded-xl border border-green-200 bg-green-50 px-6 py-5">
          <div className="flex flex-col gap-1">
            <span className="text-base font-bold text-gray-900">
              User Successfully Added
            </span>
            <p className="text-sm text-gray-500">
              {addedBanner.name} has been added to the system successfully.
            </p>
            {addedBanner.pin && (
              <p className="mt-1 text-sm font-medium text-gray-700">
                Access PIN: <span className="font-bold tracking-wider">{addedBanner.pin}</span>
                <span className="ml-2 text-xs text-gray-400">
                  (share this with the user securely — it won&apos;t be shown again)
                </span>
              </p>
            )}
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
              The user has been successfully removed from the system.
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
                : "User Disabled"}
            </span>
            <p className="text-sm text-gray-500">
              {statusBanner.type === "activated"
                ? "Access has been restored and the user is now active on the system."
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

      {/* Heading — on desktop (sm+) the button sits on the right of the title;
          on mobile the button is rendered separately below the subtitle. */}
      <div className="flex items-center justify-between">
        <h1
          data-testid="page-heading"
          className="text-2xl font-bold text-gray-900 sm:text-3xl"
        >
          User Management
        </h1>
        <Button
          data-testid="new-user-button"
          className="hidden justify-center gap-2 rounded-xl bg-[#3ea3db] px-8 py-6 text-sm font-medium text-white hover:bg-[#3ea3db]/90 sm:inline-flex"
          size="lg"
          onClick={() => router.push("/user-management/add")}
        >
          New User
          <Plus className="ml-1 size-4" />
        </Button>
      </div>
      <p
        data-testid="page-subtitle"
        className="-mt-6 text-base text-gray-500"
      >
        Manage user access, reset PINs, and assign units
      </p>

      {/* Mobile-only primary action */}
      <Button
        data-testid="new-user-button-mobile"
        className="w-full justify-center gap-2 rounded-xl bg-[#3ea3db] px-6 py-5 text-sm font-medium text-white hover:bg-[#3ea3db]/90 sm:hidden"
        size="lg"
        onClick={() => router.push("/user-management/add")}
      >
        New User
        <Plus className="ml-1 size-4" />
      </Button>

      {/* Filters + Select Client + Search */}
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
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedClient("")
                      setIsClientDropdownOpen(false)
                    }}
                    className={`w-full rounded-lg px-4 py-3 text-left text-sm text-gray-900 transition-colors hover:bg-[#3ea3db]/15 ${
                      selectedClient === "" ? "bg-[#3ea3db]/15 font-medium" : ""
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
                      className={`w-full rounded-lg px-4 py-3 text-left text-sm text-gray-900 transition-colors hover:bg-[#3ea3db]/15 ${
                        selectedClient === name ? "bg-[#3ea3db]/15 font-medium" : ""
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
              placeholder="Search user Name"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-white py-2 pl-8"
              aria-label="Search user Name"
            />
          </div>
        </div>
      </div>

      {/* User Cards */}
      <div data-testid="user-table" className="flex min-w-0 flex-col gap-3 overflow-x-auto">
        {loading ? (
          <div className="flex h-24 items-center justify-center rounded-xl bg-white text-gray-400">
            Loading users...
          </div>
        ) : visibleUsers.length === 0 ? (
          <div
            className="flex h-24 items-center justify-center rounded-xl bg-white text-gray-400"
            data-testid="empty-state"
          >
            No users found
          </div>
        ) : (
          pagedUsers.map((user) => {
            const statusBadge = (
              <Badge
                data-testid={`status-badge-${user.id}`}
                className={`w-full rounded-full border px-4 py-5 text-center text-xs font-medium ${getStatusStyle(user.status)}`}
              >
                {user.status}
              </Badge>
            )
            const manageButton = (
              <Button
                data-testid={`manage-button-${user.id}`}
                className="w-full justify-center gap-2 rounded-xl bg-gray-900 px-4 py-5 text-sm font-medium text-white hover:bg-gray-800"
                size="lg"
                onClick={() => router.push(`/user-management/manage?id=${user.id}`)}
              >
                Manage
              </Button>
            )

            return (
              <React.Fragment key={user.id}>
                {/* Mobile / tablet card — below md: */}
                <div className="md:hidden">
                  <DataCard
                    data-testid={`user-card-${user.id}`}
                    status={statusBadge}
                    action={manageButton}
                    fields={[
                      { label: "First Names", value: user.firstNames },
                      { label: "Surname", value: user.surname },
                      { label: "Unit", value: user.unitName },
                      { label: "Email", value: user.email },
                      { label: "Number", value: user.contactNumber },
                    ]}
                  />
                </div>

                {/* Desktop row — md: and up. Existing layout, unchanged. */}
                <div
                  data-testid={`user-row-${user.id}`}
                  className="hidden md:grid grid-cols-[120px_1fr_1fr_1fr_1fr_1fr_140px] items-center gap-6 rounded-xl bg-white px-6 py-5"
                >
                  {/* Status badge */}
                  <div className="flex items-center">{statusBadge}</div>

                  {/* First Names */}
                  <div className="flex min-w-0 flex-col gap-0.5 text-left">
                    <span className="text-xs font-bold text-gray-900">First Names</span>
                    <span className="truncate text-sm text-gray-600" title={user.firstNames}>{user.firstNames}</span>
                  </div>

                  {/* Surname */}
                  <div className="flex min-w-0 flex-col gap-0.5 text-left">
                    <span className="text-xs font-bold text-gray-900">Surname</span>
                    <span className="truncate text-sm text-gray-600" title={user.surname}>{user.surname}</span>
                  </div>

                  {/* Unit */}
                  <div className="flex min-w-0 flex-col gap-0.5 text-left">
                    <span className="text-xs font-bold text-gray-900">Unit</span>
                    <span className="truncate text-sm text-gray-600" title={user.unitName}>{user.unitName}</span>
                  </div>

                  {/* Email */}
                  <div className="flex min-w-0 flex-col gap-0.5 text-left">
                    <span className="text-xs font-bold text-gray-900">Email</span>
                    <span className="truncate text-sm text-gray-600" title={user.email}>{user.email}</span>
                  </div>

                  {/* Number */}
                  <div className="flex min-w-0 flex-col gap-0.5 text-left">
                    <span className="text-xs font-bold text-gray-900">Number</span>
                    <span className="truncate text-sm text-gray-600" title={user.contactNumber}>{user.contactNumber}</span>
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
