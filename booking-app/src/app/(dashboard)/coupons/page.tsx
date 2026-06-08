"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Plus, Tag } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Banner } from "@/components/ui/banner"
import { SubNav } from "@/components/ui/sub-nav"
import { SearchInput } from "@/components/ui/search-input"
import { FilterPill } from "@/components/ui/filter-pill"
import { DesktopRow } from "@/components/ui/desktop-row"
import { EmptyState } from "@/components/ui/empty-state"
import { DataCard } from "@/components/data-card"
import { ListPagination, usePagination } from "@/components/list-pagination"
import { useAuth } from "@/lib/auth-store"
import { useClientStore } from "@/lib/client-store"

// =============================================================================
// /coupons — list of all coupons (system_admin only)
// =============================================================================

interface CouponRow {
  id: string
  code: string
  description: string | null
  discount_type: "percentage" | "fixed"
  discount_value: number
  valid_from: string | null
  valid_until: string | null
  min_spend: number | null
  max_spend: number | null
  usage_limit: number | null
  usage_limit_per_email: number | null
  allowed_emails: string[] | null
  client_id: string | null
  status: "active" | "disabled"
  used_count: number
  created_at: string
}

type StatusFilter = "all" | "active" | "disabled"

function formatValue(c: CouponRow): string {
  if (c.discount_type === "percentage") return `${Number(c.discount_value)}%`
  return `R${Number(c.discount_value).toFixed(2)}`
}

function formatUsage(c: CouponRow): string {
  if (c.usage_limit === null) return `${c.used_count}`
  return `${c.used_count} / ${c.usage_limit}`
}

function formatExpiry(c: CouponRow): string {
  if (!c.valid_until) return "No expiry"
  return new Date(c.valid_until).toLocaleDateString("en-ZA", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  })
}

function isExpired(c: CouponRow): boolean {
  return Boolean(c.valid_until && new Date(c.valid_until) < new Date())
}

export default function CouponsListPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isSystemAdmin, loading: authLoading } = useAuth()
  const { clients } = useClientStore()
  const clientNameById = React.useMemo(
    () => new Map(clients.map((c) => [c.id, c.clientName])),
    [clients]
  )
  const faviconByClient = React.useMemo(
    () => new Map(clients.map((c) => [c.id, c.faviconUrl])),
    [clients]
  )

  const [coupons, setCoupons] = React.useState<CouponRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<string | null>(null)

  const [activeFilter, setActiveFilter] = React.useState<StatusFilter>("all")
  const [searchQuery, setSearchQuery] = React.useState("")
  const [createdBanner, setCreatedBanner] = React.useState<string | null>(null)
  const [deletedBanner, setDeletedBanner] = React.useState<string | null>(null)

  // Layout-level redirect — only system_admins land here. If a non-admin
  // pops in via URL, the dashboard layout already gates it; this is belt+braces.
  React.useEffect(() => {
    if (!authLoading && !isSystemAdmin) router.replace("/home")
  }, [authLoading, isSystemAdmin, router])

  const load = React.useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch("/api/admin/coupons", { cache: "no-store" })
      const data = (await res.json().catch(() => ({}))) as {
        data?: CouponRow[]
        error?: string
      }
      if (!res.ok) throw new Error(data.error ?? "Failed to load coupons")
      setCoupons(data.data ?? [])
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load coupons")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  // Surface a created/deleted banner if URL params say so (from the add/
  // manage pages' redirect). Read via useSearchParams() rather than
  // window.location.search so client-side nav updates trigger this effect
  // — matches what the Manage page already does. (Previous version only
  // ran on mount because window.location was outside React's awareness.)
  React.useEffect(() => {
    const created = searchParams.get("created")
    const deleted = searchParams.get("deleted")
    if (created) setCreatedBanner(created)
    if (deleted) setDeletedBanner(deleted)
  }, [searchParams])

  // Counts per status pill. Previously this function ran three times per
  // render (one filter pass each) — visibly snappier past a few hundred
  // coupons to compute all three in one pass.
  const counts = React.useMemo(() => {
    let active = 0
    let disabled = 0
    for (const c of coupons) {
      if (c.status === "active") active += 1
      else if (c.status === "disabled") disabled += 1
    }
    return { all: coupons.length, active, disabled }
  }, [coupons])

  const filtered = React.useMemo(() => {
    let list = coupons
    if (activeFilter !== "all") {
      list = list.filter((c) => c.status === activeFilter)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      list = list.filter(
        (c) =>
          c.code.toLowerCase().includes(q) ||
          (c.description ?? "").toLowerCase().includes(q)
      )
    }
    return list
  }, [coupons, activeFilter, searchQuery])

  const PAGE_SIZE = 15
  const { visible, currentPage, setCurrentPage, totalPages, totalItems } =
    usePagination(filtered, PAGE_SIZE)

  React.useEffect(() => {
    setCurrentPage(1)
  }, [activeFilter, searchQuery, setCurrentPage])

  return (
    <div className="flex flex-col gap-8">
      <SubNav backHref="/home" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">
          Coupons
        </h1>
        <Link href="/coupons/add">
          <Button variant="accent" size="cta-lg" data-testid="add-coupon-button">
            Add Coupon
            <Plus className="size-4" />
          </Button>
        </Link>
      </div>
      <p className="-mt-6 text-base text-ink-muted">
        Discount codes patients can enter at the payment step. WooCommerce-style
        constraints &mdash; percentage or fixed, expiry, usage limits, allowed emails.
      </p>

      {createdBanner && (
        <Banner
          kind="success"
          title={`Coupon "${createdBanner}" created.`}
          onDismiss={() => setCreatedBanner(null)}
        />
      )}
      {deletedBanner && (
        <Banner
          kind="success"
          title={`Coupon "${deletedBanner}" deleted.`}
          onDismiss={() => setDeletedBanner(null)}
        />
      )}
      {loadError && (
        <Banner
          kind="danger"
          title="Couldn't load coupons"
          description={loadError}
          onDismiss={() => setLoadError(null)}
        />
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {(["all", "active", "disabled"] as const).map((k) => (
            <FilterPill
              key={k}
              active={activeFilter === k}
              label={k === "all" ? "All" : k === "active" ? "Active" : "Disabled"}
              count={counts[k]}
              onClick={() => setActiveFilter(k)}
              testId={`filter-${k}`}
            />
          ))}
        </div>
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search code or description"
          className="w-full sm:max-w-xs"
        />
      </div>

      <div className="flex min-w-0 flex-col gap-3 overflow-x-auto">
        {loading ? (
          <div className="flex h-24 items-center justify-center rounded-xl bg-white text-gray-400">
            Loading coupons…
          </div>
        ) : visible.length === 0 ? (
          <EmptyState>
            {coupons.length === 0
              ? "No coupons yet. Click “Add Coupon” to create the first one."
              : "No coupons match the current filter."}
          </EmptyState>
        ) : (
          visible.map((c) => {
            const expired = isExpired(c)
            const statusLabel =
              c.status === "disabled"
                ? "Disabled"
                : expired
                  ? "Expired"
                  : "Active"
            const statusClass =
              c.status === "disabled"
                ? "bg-gray-200 text-gray-700"
                : expired
                  ? "bg-amber-100 text-amber-800"
                  : "bg-emerald-100 text-emerald-800"

            return (
              <React.Fragment key={c.id}>
                <div className="md:hidden">
                  <DataCard
                    status={
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass}`}
                      >
                        {statusLabel}
                      </span>
                    }
                    action={
                      <Link href={`/coupons/manage?id=${c.id}`}>
                        <Button variant="primary" size="cta" className="w-full">
                          Manage
                        </Button>
                      </Link>
                    }
                    media={(() => {
                      // Match the desktop row's favicon swatch so the mobile
                      // card stays visually consistent with the management
                      // pages (client/unit/user). "Any client" coupons have
                      // no media block — same as how the desktop row hides
                      // the favicon for unscoped coupons.
                      if (!c.client_id) return undefined
                      const favicon = faviconByClient.get(c.client_id) ?? null
                      return favicon ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={favicon}
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
                      { label: "Code", value: c.code },
                      { label: "Discount", value: formatValue(c) },
                      {
                        label: "Scope",
                        value: c.client_id
                          ? clientNameById.get(c.client_id) ?? "Specific client"
                          : "Any client",
                      },
                      { label: "Used", value: formatUsage(c) },
                      { label: "Expires", value: formatExpiry(c) },
                    ]}
                  />
                </div>
                <DesktopRow gridTemplate="100px 1.4fr 1fr 1.2fr 1fr 1fr 140px">
                  <div className="flex items-center">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass}`}
                    >
                      {statusLabel}
                    </span>
                  </div>
                  <div className="flex min-w-0 items-center gap-3 text-left">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-gray-50">
                      <Tag className="size-4 text-gray-500" />
                    </div>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-xs font-bold text-ink">Code</span>
                      <span className="truncate font-mono text-sm text-ink">
                        {c.code}
                      </span>
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-col gap-0.5 text-left">
                    <span className="text-xs font-bold text-ink">Discount</span>
                    <span className="truncate text-sm text-ink-muted">
                      {formatValue(c)} {c.discount_type === "percentage" ? "off" : ""}
                    </span>
                  </div>
                  {(() => {
                    const scopedName = c.client_id
                      ? clientNameById.get(c.client_id) ?? "Specific client"
                      : "Any client"
                    const scopedFavicon = c.client_id
                      ? faviconByClient.get(c.client_id) ?? null
                      : null
                    return (
                      <div className="flex min-w-0 items-center gap-2 text-left">
                        {c.client_id ? (
                          scopedFavicon ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={scopedFavicon}
                              alt=""
                              className="size-7 shrink-0 rounded-md border border-gray-200 bg-white object-cover"
                            />
                          ) : (
                            <div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-[8px] font-medium uppercase tracking-wider text-gray-400">
                              Icon
                            </div>
                          )
                        ) : null}
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="text-xs font-bold text-ink">Scope</span>
                          <span className="truncate text-sm text-ink-muted" title={scopedName}>
                            {scopedName}
                          </span>
                        </div>
                      </div>
                    )
                  })()}
                  <div className="flex min-w-0 flex-col gap-0.5 text-left">
                    <span className="text-xs font-bold text-ink">Used</span>
                    <span className="truncate text-sm text-ink-muted">
                      {formatUsage(c)}
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-col gap-0.5 text-left">
                    <span className="text-xs font-bold text-ink">Expires</span>
                    <span className="truncate text-sm text-ink-muted">
                      {formatExpiry(c)}
                    </span>
                  </div>
                  <div className="flex">
                    <Link href={`/coupons/manage?id=${c.id}`} className="w-full">
                      <Button variant="primary" size="cta" className="w-full">
                        Manage
                      </Button>
                    </Link>
                  </div>
                </DesktopRow>
              </React.Fragment>
            )
          })
        )}
      </div>

      <ListPagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        pageSize={PAGE_SIZE}
        onPageChange={setCurrentPage}
      />
    </div>
  )
}
