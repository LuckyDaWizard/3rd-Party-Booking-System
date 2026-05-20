"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, Search, Plus, ChevronDown, X, User as UserIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/ui/status-badge"
import { Input } from "@/components/ui/input"
import { SearchInput } from "@/components/ui/search-input"
import { FilterPill } from "@/components/ui/filter-pill"
import { DesktopRow } from "@/components/ui/desktop-row"
import { EmptyState } from "@/components/ui/empty-state"
import { Banner } from "@/components/ui/banner"
import { SubNav } from "@/components/ui/sub-nav"
import { useUserStore, type UserRecord } from "@/lib/user-store"
import { useClientStore } from "@/lib/client-store"
import { useAuth } from "@/lib/auth-store"
import { ListPagination, usePagination } from "@/components/list-pagination"
import { DataCard } from "@/components/data-card"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
      <SubNav backHref="/home" backTestId="back-button" />

      {/* User added banner */}
      {addedBanner && (
        <Banner
          title="User Successfully Added"
          description={`${addedBanner.name} has been added to the system successfully.`}
          onDismiss={() => setAddedBanner(null)}
        >
          {addedBanner.pin && (
            <p className="mt-1 text-sm font-medium text-ink">
              Access PIN: <span className="font-bold tracking-wider">{addedBanner.pin}</span>
              <span className="ml-2 text-xs text-gray-400">
                (share this with the user securely — it won&apos;t be shown again)
              </span>
            </p>
          )}
        </Banner>
      )}

      {/* Delete success banner */}
      {deleteBanner && (
        <Banner
          title={`${deleteBanner} Deleted`}
          description="The user has been successfully removed from the system."
          onDismiss={() => setDeleteBanner(null)}
        />
      )}

      {/* Status change banner */}
      {statusBanner && (
        <Banner
          title={
            statusBanner.type === "activated"
              ? `${statusBanner.name} has been activated successfully`
              : "User Disabled"
          }
          description={
            statusBanner.type === "activated"
              ? "Access has been restored and the user is now active on the system."
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
          User Management
        </h1>
        <Button
          data-testid="new-user-button"
          variant="accent"
          size="cta-lg"
          className="hidden sm:inline-flex"
          onClick={() => router.push("/user-management/add")}
        >
          New User
          <Plus className="ml-1 size-4" />
        </Button>
      </div>
      <p
        data-testid="page-subtitle"
        className="-mt-6 text-base text-ink-muted"
      >
        Manage user access, reset PINs, and assign units
      </p>

      {/* Mobile-only primary action */}
      <Button
        data-testid="new-user-button-mobile"
        variant="accent"
        size="cta-lg"
        className="w-full sm:hidden"
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
            placeholder="Search user Name"
            testId="search-input"
          />
        </div>
      </div>

      {/* User Cards */}
      <div data-testid="user-table" className="flex min-w-0 flex-col gap-3 overflow-x-auto">
        {loading ? (
          <div className="flex h-24 items-center justify-center rounded-xl bg-white text-gray-400">
            Loading users...
          </div>
        ) : visibleUsers.length === 0 ? (
          <EmptyState>No users found</EmptyState>
        ) : (
          pagedUsers.map((user) => {
            const statusBadge = (
              <StatusBadge
                status={user.status}
                testId={`status-badge-${user.id}`}
              />
            )
            const manageButton = (
              <Button
                data-testid={`manage-button-${user.id}`}
                variant="primary"
                size="cta"
                className="w-full"
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
                    media={
                      <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-gray-50">
                        {user.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={user.avatarUrl}
                            alt=""
                            className="size-full object-cover"
                          />
                        ) : (
                          <UserIcon className="size-6 text-gray-300" strokeWidth={1.5} />
                        )}
                      </div>
                    }
                    fields={[
                      { label: "First Names", value: user.firstNames },
                      { label: "Surname", value: user.surname },
                      { label: "Unit", value: user.unitName },
                      { label: "Email", value: user.email },
                      { label: "Number", value: user.contactNumber },
                    ]}
                  />
                </div>

                {/* Desktop row — md: and up. */}
                <DesktopRow
                  testId={`user-row-${user.id}`}
                  gridTemplate="120px 1fr 1fr 1fr 1fr 1fr 140px"
                  gap="gap-6"
                >
                  {/* Status badge */}
                  <div className="flex items-center">{statusBadge}</div>

                  {/* First Names (with avatar thumbnail) */}
                  <div className="flex min-w-0 items-center gap-3 text-left">
                    <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-gray-50">
                      {user.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={user.avatarUrl}
                          alt=""
                          className="size-full object-cover"
                        />
                      ) : (
                        <UserIcon className="size-5 text-gray-300" strokeWidth={1.5} />
                      )}
                    </div>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-xs font-bold text-ink">First Names</span>
                      <span className="truncate text-sm text-ink-muted" title={user.firstNames}>{user.firstNames}</span>
                    </div>
                  </div>

                  {/* Surname */}
                  <div className="flex min-w-0 flex-col gap-0.5 text-left">
                    <span className="text-xs font-bold text-ink">Surname</span>
                    <span className="truncate text-sm text-ink-muted" title={user.surname}>{user.surname}</span>
                  </div>

                  {/* Unit */}
                  <div className="flex min-w-0 flex-col gap-0.5 text-left">
                    <span className="text-xs font-bold text-ink">Unit</span>
                    <span className="truncate text-sm text-ink-muted" title={user.unitName}>{user.unitName}</span>
                  </div>

                  {/* Email */}
                  <div className="flex min-w-0 flex-col gap-0.5 text-left">
                    <span className="text-xs font-bold text-ink">Email</span>
                    <span className="truncate text-sm text-ink-muted" title={user.email}>{user.email}</span>
                  </div>

                  {/* Number */}
                  <div className="flex min-w-0 flex-col gap-0.5 text-left">
                    <span className="text-xs font-bold text-ink">Number</span>
                    <span className="truncate text-sm text-ink-muted" title={user.contactNumber}>{user.contactNumber}</span>
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
