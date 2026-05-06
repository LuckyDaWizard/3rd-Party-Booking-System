"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, ArrowRight, Building2, FileText, Palette, Users, User as UserIcon, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { FloatingInput } from "@/components/ui/floating-input"
import { PinVerificationModal } from "@/components/ui/pin-verification-modal"
import { useClientStore } from "@/lib/client-store"
import { useUnitStore } from "@/lib/unit-store"
import { useUserStore } from "@/lib/user-store"
import { useAuth } from "@/lib/auth-store"
import { validateImageMinDimensions } from "@/lib/image-dimensions"
import { checkAccentAgainstWhite } from "@/lib/color-contrast"

// System default accent — used as the picker's starting value when a client
// has no accent_color set yet. Matches globals.css `--brand`.
const DEFAULT_ACCENT = "#3ea3db"

const LOGO_MAX_BYTES = 2 * 1024 * 1024
const LOGO_ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml"
const FAVICON_ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon,image/vnd.microsoft.icon"
// Minimum pixel dimensions — guards against tiny uploads that would scale
// up unattractively in the sidebar / list. Vector and ICO formats skip the
// check (see lib/image-dimensions.ts). Numbers track the recommended sizes
// shown in the picker footnotes (recommend 360×96 / 128×128 — minimums are
// half of those).
const LOGO_MIN_WIDTH = 200
const LOGO_MIN_HEIGHT = 60
const FAVICON_MIN_WIDTH = 64
const FAVICON_MIN_HEIGHT = 64

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ManageClientPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const clientId = searchParams.get("id") ?? ""
  const { getClient, updateClient, deleteClient, toggleClientStatus, refreshClients } = useClientStore()
  const { activeUnitId, isSystemAdmin } = useAuth()

  const client = getClient(clientId)

  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [isStatusOpen, setIsStatusOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [toggling, setToggling] = useState(false)
  // PIN re-verification required for client deletion (destructive).
  const [pinOpen, setPinOpen] = useState(false)
  // Surfaces a server-side delete failure (FK constraint, missing column,
  // network error). Cleared when the user retries.
  const [deleteError, setDeleteError] = useState("")
  // Surfaces an Update Information failure (500, RLS denial, network).
  // Without this the manage page used to swallow errors silently and
  // the user couldn't tell whether their save went through.
  const [saveError, setSaveError] = useState("")
  const [clientName, setClientName] = useState("")
  const [contactPersonName, setContactPersonName] = useState("")
  const [contactPersonSurname, setContactPersonSurname] = useState("")
  const [emailAddress, setEmailAddress] = useState("")
  const [contactNumber, setContactNumber] = useState("")
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [logoBusy, setLogoBusy] = useState(false)
  const [logoError, setLogoError] = useState<string | null>(null)
  const [faviconUrl, setFaviconUrl] = useState<string | null>(null)
  const [faviconBusy, setFaviconBusy] = useState(false)
  const [faviconError, setFaviconError] = useState<string | null>(null)
  // Accent colour — kept in form state and saved with the rest of the
  // client record on "Update Information" (not via a separate immediate
  // upload, since it's just a hex string and round-trips cheaply).
  const [accentColor, setAccentColor] = useState<string>(DEFAULT_ACCENT)
  // Self-collect flag (system_admin-only). When ON, every unit under this
  // client skips the payment gateway — bookings get marked as
  // `payment_type = 'self_collect'` and the unit collects the fee
  // directly. Saved with the rest of the form on Update Information.
  const [collectPaymentAtUnit, setCollectPaymentAtUnit] = useState(false)
  // Tabbed layout — matches the Add Client flow.
  //   details  → contact form (editable)
  //   branding → logo / favicon / accent picker (editable)
  //   units    → read-only list of units under this client
  //   users    → read-only list of users assigned to any of those units
  // Update Information lives below the tabs and only renders for the
  // editable tabs. Disable Client stays visible everywhere because it's
  // a whole-client action, not a per-tab action.
  const [activeTab, setActiveTab] = useState<
    "details" | "branding" | "units" | "users"
  >("details")

  // Units list (read-only Units tab). Filtered client-side to avoid an
  // extra round-trip — the unit-store is already populated by the
  // dashboard layout's UnitStoreProvider.
  const { units: allUnits } = useUnitStore()
  const clientUnits = allUnits.filter((u) => u.clientId === clientId)

  // Users list (read-only Users tab). A user belongs to "this client"
  // if any of their assigned units is owned by this client. We use the
  // unit set rather than user.clientId because clientId is just the
  // user's primary affiliation set at create time — multi-unit users
  // can span clients, and we want the canonical view.
  const { users: allUsers } = useUserStore()
  const clientUnitIds = new Set(clientUnits.map((u) => u.id))
  const clientUsers = allUsers.filter((u) =>
    u.units.some((unit) => clientUnitIds.has(unit.unitId))
  )

  useEffect(() => {
    if (client) {
      setClientName(client.clientName)
      setContactPersonName(client.contactPersonName)
      setContactPersonSurname(client.contactPersonSurname)
      setEmailAddress(client.email)
      setContactNumber(client.number)
      setLogoUrl(client.logoUrl)
      setFaviconUrl(client.faviconUrl)
      setAccentColor(client.accentColor ?? DEFAULT_ACCENT)
      setCollectPaymentAtUnit(client.collectPaymentAtUnit)
    }
  }, [client])

  // Generic asset upload — handles both logo + favicon. Same response shape:
  //   { ok: true, logoUrl?: string, faviconUrl?: string }
  async function uploadAsset(
    kind: "logo" | "favicon",
    file: File,
    setUrl: (next: string | null) => void,
    setBusy: (b: boolean) => void,
    setError: (msg: string | null) => void
  ) {
    if (!clientId) return
    if (file.size > LOGO_MAX_BYTES) {
      setError(`${kind === "logo" ? "Logo" : "Favicon"} must be 2 MB or smaller.`)
      return
    }
    // Reject pixel-too-small uploads before they hit the server.
    const dimsError = await validateImageMinDimensions(
      file,
      kind === "logo" ? LOGO_MIN_WIDTH : FAVICON_MIN_WIDTH,
      kind === "logo" ? LOGO_MIN_HEIGHT : FAVICON_MIN_HEIGHT
    )
    if (dimsError) {
      setError(dimsError)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch(`/api/admin/clients/${clientId}/${kind}`, {
        method: "POST",
        body: fd,
      })
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        logoUrl?: string
        faviconUrl?: string
        error?: string
      }
      if (!res.ok || !data.ok) {
        setError(data.error ?? `${kind} upload failed`)
        return
      }
      setUrl((kind === "logo" ? data.logoUrl : data.faviconUrl) ?? null)
      // Refresh the client store so the list page + sidebar pick up the
      // new asset without waiting for the next page load.
      await refreshClients()
    } catch (err) {
      setError(err instanceof Error ? err.message : `${kind} upload failed`)
    } finally {
      setBusy(false)
    }
  }

  async function removeAsset(
    kind: "logo" | "favicon",
    setUrl: (next: string | null) => void,
    setBusy: (b: boolean) => void,
    setError: (msg: string | null) => void
  ) {
    if (!clientId) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/${kind}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? `Failed to remove ${kind}`)
        return
      }
      setUrl(null)
      // Refresh the client store so the list page reflects removal too.
      await refreshClients()
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to remove ${kind}`)
    } finally {
      setBusy(false)
    }
  }

  const uploadLogo = (file: File) => uploadAsset("logo", file, setLogoUrl, setLogoBusy, setLogoError)
  const removeLogo = () => removeAsset("logo", setLogoUrl, setLogoBusy, setLogoError)
  const uploadFavicon = (file: File) => uploadAsset("favicon", file, setFaviconUrl, setFaviconBusy, setFaviconError)
  const removeFavicon = () => removeAsset("favicon", setFaviconUrl, setFaviconBusy, setFaviconError)

  if (!client) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-gray-500">Client not found</p>
      </div>
    )
  }

  async function handleUpdateInformation() {
    setSaving(true)
    setSaveError("")
    try {
      await updateClient(clientId, {
        clientName,
        contactPersonName,
        contactPersonSurname,
        email: emailAddress,
        number: contactNumber,
        // Send null when the picker is back at the system default — keeps
        // the row clean and means future bumps to the system default
        // automatically apply.
        accentColor: accentColor === DEFAULT_ACCENT ? null : accentColor,
        // Only forward the self-collect flag when the caller is allowed
        // to flip it. The API is system_admin-only so this is also
        // structurally enforced server-side; the omission here just
        // avoids sending a no-op field for non-admins.
        ...(isSystemAdmin ? { collectPaymentAtUnit } : {}),
      })
      router.push("/client-management")
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to update client"
      )
      setSaving(false)
    }
  }

  async function handleDisableClient() {
    setToggling(true)
    try {
      const wasActive = client!.status === "Active"
      const name = client!.clientName
      await toggleClientStatus(clientId)
      const params = new URLSearchParams({
        statusChanged: wasActive ? "disabled" : "activated",
        clientName: name,
      })
      router.push(`/client-management?${params.toString()}`)
    } catch {
      setToggling(false)
    }
  }

  async function handleDeleteClient() {
    setDeleting(true)
    setDeleteError("")
    try {
      const deletedData = {
        clientName: client!.clientName,
        contactPersonName: client!.contactPersonName,
        contactPersonSurname: client!.contactPersonSurname,
        units: client!.units,
        email: client!.email,
        number: client!.number,
      }
      await deleteClient(clientId)
      const params = new URLSearchParams({
        deleted: client!.clientName,
        data: JSON.stringify(deletedData),
      })
      router.push(`/client-management?${params.toString()}`)
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Failed to delete client"
      )
      setDeleting(false)
    }
  }

  return (
    <div
      data-testid="manage-client-page"
      className="flex flex-1 flex-col"
    >
      {/* Top bar */}
      <div className="flex items-center justify-between rounded-xl bg-white px-6 py-4">
        <Button
          data-testid="top-back-button"
          variant="outline"
          size="sm"
          onClick={() => router.push("/client-management")}
          className="rounded-lg border-black px-6 py-2 gap-3"
        >
          <ArrowLeft className="size-4" />
          Back
        </Button>

        <Button
          data-testid="delete-client-button"
          size="sm"
          onClick={() => setIsDeleteOpen(true)}
          className="rounded-lg bg-[#FF3A69] px-6 py-2 text-white hover:bg-[#FF3A69]/90"
        >
          Delete Client
        </Button>
      </div>

      {/* Delete-failure banner — only shown after a 500 from the API.
          Replaces the misleading "test Deleted" success banner that
          previously rendered regardless of outcome. */}
      {deleteError && (
        <div
          data-testid="delete-error-banner"
          className="mx-4 mt-2 flex items-start justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-6 py-4"
        >
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-gray-900">
              Failed to delete client
            </span>
            <span className="text-sm text-gray-700">{deleteError}</span>
          </div>
          <button
            type="button"
            onClick={() => setDeleteError("")}
            className="shrink-0 rounded-full p-0.5 text-gray-400 hover:text-gray-600"
            aria-label="Dismiss"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Save-failure banner — Update Information errors. */}
      {saveError && (
        <div
          data-testid="save-error-banner"
          className="mx-4 mt-2 flex items-start justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-6 py-4"
        >
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-gray-900">
              Failed to save changes
            </span>
            <span className="text-sm text-gray-700">{saveError}</span>
          </div>
          <button
            type="button"
            onClick={() => setSaveError("")}
            className="shrink-0 rounded-full p-0.5 text-gray-400 hover:text-gray-600"
            aria-label="Dismiss"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Content area */}
      <div className="flex flex-1 flex-col items-center justify-center gap-8 py-8">
        {/* Heading */}
        <div className="flex flex-col items-center gap-1 text-center">
          <h1
            data-testid="page-heading"
            className="text-3xl font-bold text-gray-900"
          >
            Manage {client.clientName}
          </h1>
          <p className="text-base text-gray-500">
            Update client information and status below
          </p>
        </div>

        {/* Tab pills — same visual language as the step indicators on the
            Add Client page (FileText icon + accent-tinted bg when active),
            but toggleable rather than step-gated. */}
        <div
          data-testid="tabs"
          role="tablist"
          aria-label="Client sections"
          className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2"
        >
          <button
            type="button"
            role="tab"
            data-testid="tab-details"
            aria-selected={activeTab === "details"}
            onClick={() => setActiveTab("details")}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "details"
                ? "bg-[var(--client-primary-10)] text-[var(--client-primary)]"
                : "text-gray-400 hover:text-gray-600"
            }`}
          >
            <FileText className="size-4" />
            Client Details
          </button>
          <button
            type="button"
            role="tab"
            data-testid="tab-branding"
            aria-selected={activeTab === "branding"}
            onClick={() => setActiveTab("branding")}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "branding"
                ? "bg-[var(--client-primary-10)] text-[var(--client-primary)]"
                : "text-gray-400 hover:text-gray-600"
            }`}
          >
            <Palette className="size-4" />
            Branding
          </button>
          <button
            type="button"
            role="tab"
            data-testid="tab-units"
            aria-selected={activeTab === "units"}
            onClick={() => setActiveTab("units")}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "units"
                ? "bg-[var(--client-primary-10)] text-[var(--client-primary)]"
                : "text-gray-400 hover:text-gray-600"
            }`}
          >
            <Building2 className="size-4" />
            Units
            {clientUnits.length > 0 && (
              <span
                data-testid="tab-units-count"
                className={`ml-1 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold ${
                  activeTab === "units"
                    ? "bg-[var(--client-primary)] text-white"
                    : "bg-gray-200 text-gray-600"
                }`}
              >
                {clientUnits.length}
              </span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            data-testid="tab-users"
            aria-selected={activeTab === "users"}
            onClick={() => setActiveTab("users")}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "users"
                ? "bg-[var(--client-primary-10)] text-[var(--client-primary)]"
                : "text-gray-400 hover:text-gray-600"
            }`}
          >
            <Users className="size-4" />
            Users
            {clientUsers.length > 0 && (
              <span
                data-testid="tab-users-count"
                className={`ml-1 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold ${
                  activeTab === "users"
                    ? "bg-[var(--client-primary)] text-white"
                    : "bg-gray-200 text-gray-600"
                }`}
              >
                {clientUsers.length}
              </span>
            )}
          </button>
        </div>

        {/* Form — only the active tab's fields are mounted. Both share the
            "Update Information" button below; logo + favicon save
            immediately on pick and don't need it. */}
        <div className="flex w-full max-w-md flex-col gap-4">
          {activeTab === "details" && (
            <div data-testid="tab-content-details" className="flex flex-col gap-4">
              <FloatingInput
                id="client-name"
                data-testid="input-client-name"
                label="Client Name"
                value={clientName}
                onChange={setClientName}
                onClear={() => setClientName("")}
              />

              <div className="flex w-full flex-col gap-4 sm:flex-row">
                <FloatingInput
                  id="contact-person-name"
                  data-testid="input-contact-person-name"
                  label="Contact Person Name"
                  value={contactPersonName}
                  onChange={setContactPersonName}
                  onClear={() => setContactPersonName("")}
                  className="flex-1"
                />
                <FloatingInput
                  id="contact-person-surname"
                  data-testid="input-contact-person-surname"
                  label="Contact Person Surname"
                  value={contactPersonSurname}
                  onChange={setContactPersonSurname}
                  onClear={() => setContactPersonSurname("")}
                  className="flex-1"
                />
              </div>

              <FloatingInput
                id="email-address"
                data-testid="input-email-address"
                label="Email Address"
                type="email"
                value={emailAddress}
                onChange={setEmailAddress}
                onClear={() => setEmailAddress("")}
              />

              <FloatingInput
                id="contact-number"
                data-testid="input-contact-number"
                label="Contact Number"
                type="tel"
                value={contactNumber}
                onChange={setContactNumber}
                onClear={() => setContactNumber("")}
              />

              {/* Collect payment at unit (system_admin only) — applies to
                  ALL units under this client. Bookings on a self-collect
                  client skip the payment gateway entirely; the unit
                  collects the consultation fee directly. Saved with the
                  rest of the form on Update Information. */}
              {isSystemAdmin && (
                <div
                  data-testid="collect-payment-toggle-row"
                  className="flex items-start justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 p-4"
                >
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-semibold text-gray-900">
                      Collect payment at unit
                    </span>
                    <span className="text-xs text-gray-600">
                      When ON, every unit under this client skips the
                      payment gateway. Each unit is responsible for
                      collecting the consultation fee directly from the
                      patient.
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={collectPaymentAtUnit}
                    aria-label="Collect payment at unit"
                    data-testid="collect-payment-toggle"
                    onClick={() => setCollectPaymentAtUnit((v) => !v)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                      collectPaymentAtUnit
                        ? "bg-[var(--client-primary)]"
                        : "bg-gray-300"
                    }`}
                  >
                    <span
                      className={`inline-block size-5 transform rounded-full bg-white shadow transition-transform ${
                        collectPaymentAtUnit ? "translate-x-5" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === "branding" && (
            <div
              data-testid="tab-content-branding"
              className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4"
            >
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Branding</h3>
                <p className="text-xs text-gray-500">
                  Logo for headers / printouts; favicon for tight icon spaces.
                </p>
              </div>

              {/* Logo */}
              <ImmediateUploadRow
                kind="logo"
                label="logo"
                accept={LOGO_ACCEPT}
                url={logoUrl}
                busy={logoBusy}
                error={logoError}
                onUpload={uploadLogo}
                onRemove={removeLogo}
                sizeClass="h-14 w-40"
                shapeClass="rounded-lg"
                placeholderLabel="Logo"
                footnote="Horizontal. Displays at up to 180×48 px in the sidebar — recommend 360×96 px (about 4:1) or wider, transparent background. PNG, JPEG, WEBP, or SVG. Max 2 MB."
              />

              {/* Favicon */}
              <ImmediateUploadRow
                kind="favicon"
                label="favicon"
                accept={FAVICON_ACCEPT}
                url={faviconUrl}
                busy={faviconBusy}
                error={faviconError}
                onUpload={uploadFavicon}
                onRemove={removeFavicon}
                sizeClass="size-12"
                shapeClass="rounded-md"
                placeholderLabel="Icon"
                footnote="Square (1:1). Displays at 36×36 px in the collapsed sidebar and client list — recommend 128×128 px or larger, transparent background. PNG / SVG / ICO. Max 2 MB."
              />

              {/* Accent colour — saves with the rest of the form on Update. */}
              <AccentColorRow
                accent={accentColor}
                onChange={setAccentColor}
                defaultAccent={DEFAULT_ACCENT}
              />
            </div>
          )}

          {activeTab === "units" && (
            <div
              data-testid="tab-content-units"
              className="flex flex-col gap-3"
            >
              {clientUnits.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-gray-200 bg-white px-6 py-10 text-center">
                  <Building2 className="size-6 text-gray-300" strokeWidth={1.5} />
                  <span className="text-sm font-semibold text-gray-900">
                    No units yet
                  </span>
                  <span className="text-xs text-gray-500">
                    This client doesn&apos;t have any units linked yet. Add
                    one from Unit Management.
                  </span>
                </div>
              ) : (
                clientUnits.map((unit) => (
                  <button
                    key={unit.id}
                    type="button"
                    data-testid={`unit-row-${unit.id}`}
                    onClick={() =>
                      router.push(`/unit-management/manage?id=${unit.id}`)
                    }
                    className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left transition-colors hover:border-gray-300 hover:bg-gray-50"
                  >
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-sm font-semibold text-gray-900">
                        {unit.unitName}
                      </span>
                      <span className="truncate text-xs text-gray-500">
                        {unit.province || "—"}
                      </span>
                    </div>
                    <Badge
                      className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-medium ${
                        unit.status === "Active"
                          ? "bg-green-100 text-green-700 border-transparent"
                          : "bg-gray-100 text-gray-600 border-transparent"
                      }`}
                    >
                      {unit.status}
                    </Badge>
                  </button>
                ))
              )}
            </div>
          )}

          {activeTab === "users" && (
            <div
              data-testid="tab-content-users"
              className="flex flex-col gap-3"
            >
              {clientUsers.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-gray-200 bg-white px-6 py-10 text-center">
                  <Users className="size-6 text-gray-300" strokeWidth={1.5} />
                  <span className="text-sm font-semibold text-gray-900">
                    No users yet
                  </span>
                  <span className="text-xs text-gray-500">
                    No users are assigned to any unit of this client. Add
                    one from User Management.
                  </span>
                </div>
              ) : (
                clientUsers.map((u) => {
                  // Show only the unit-name pills for units that belong
                  // to *this* client. A multi-unit user spanning clients
                  // shouldn't surface units from other clients here.
                  const visibleUnits = u.units.filter((unit) =>
                    clientUnitIds.has(unit.unitId)
                  )
                  return (
                    <button
                      key={u.id}
                      type="button"
                      data-testid={`user-row-${u.id}`}
                      onClick={() =>
                        router.push(`/user-management/manage?id=${u.id}`)
                      }
                      className="flex items-start justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left transition-colors hover:border-gray-300 hover:bg-gray-50"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-gray-50">
                          {u.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={u.avatarUrl}
                              alt=""
                              className="size-full object-cover"
                            />
                          ) : (
                            <UserIcon
                              className="size-4 text-gray-300"
                              strokeWidth={1.5}
                            />
                          )}
                        </div>
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="truncate text-sm font-semibold text-gray-900">
                            {`${u.firstNames} ${u.surname}`.trim() || "Unnamed user"}
                          </span>
                          <span className="truncate text-xs text-gray-500">
                            {u.email || u.contactNumber || "—"}
                          </span>
                          {visibleUnits.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {visibleUnits.map((unit) => (
                                <span
                                  key={unit.unitId}
                                  className="inline-flex items-center rounded-full bg-[var(--client-primary-10)] px-2 py-0.5 text-[10px] font-medium text-[var(--client-primary)]"
                                >
                                  {unit.unitName}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <Badge
                          className={`rounded-full border px-3 py-1 text-[11px] font-medium ${
                            u.status === "Active"
                              ? "bg-green-100 text-green-700 border-transparent"
                              : "bg-gray-100 text-gray-600 border-transparent"
                          }`}
                        >
                          {u.status}
                        </Badge>
                        <span className="text-[10px] uppercase tracking-wider text-gray-400">
                          {u.role.replace("_", " ")}
                        </span>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        {/* Update Information applies to the editable tabs only — hiding
            it on the read-only Units / Users tabs avoids the misleading
            "did clicking this update the units?" question. Disable Client is
            a whole-client action, not a tab action, so it stays visible
            on every tab (including Units) — admins shouldn't have to
            switch tabs just to toggle status. */}
        <div className="flex w-full max-w-md flex-col items-center gap-3">
          {activeTab !== "units" && activeTab !== "users" && (
            <Button
              data-testid="update-button"
              disabled={saving}
              onClick={handleUpdateInformation}
              className="h-11 w-full rounded-xl bg-gray-300 text-gray-600 hover:bg-gray-900 hover:text-white"
            >
              {saving ? (
                <>
                  Saving...
                  <svg className="ml-1 size-4 animate-spin" viewBox="0 0 40 40" fill="none">
                    <circle cx="20" cy="20" r="15" stroke="#6b7280" strokeWidth="5" strokeLinecap="round" />
                    <circle cx="20" cy="20" r="15" stroke="white" strokeWidth="5" strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset="70" />
                  </svg>
                </>
              ) : (
                <>
                  Update Information
                  <ArrowRight className="ml-1 size-4" />
                </>
              )}
            </Button>
          )}

          <Button
            data-testid="disable-client-button"
            variant="outline"
            disabled={saving}
            onClick={() => setIsStatusOpen(true)}
            className={`h-11 w-full rounded-xl border border-black ${saving ? "disabled:opacity-50" : ""}`}
          >
            {client.status === "Active" ? "Disable Client" : "Activate Client"}
          </Button>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteOpen} onOpenChange={(v) => { if (!deleting && !toggling) setIsDeleteOpen(v) }}>
        <DialogContent className="rounded-2xl p-6 sm:p-8">
          <DialogHeader className="flex flex-col items-center gap-2 text-center">
            <DialogTitle className="text-2xl font-bold text-gray-900">
              Are you sure you want to delete {client.clientName}
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-500">
              Deleting this client will permanently remove all associated records.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-3 pt-4">
            <Button
              data-testid="confirm-delete-button"
              disabled={deleting || toggling}
              onClick={() => {
                setIsDeleteOpen(false)
                setPinOpen(true)
              }}
              className="h-11 w-full rounded-xl bg-gray-900 text-white hover:bg-gray-800"
            >
              {deleting ? (
                <>
                  Deleting...
                  <svg className="ml-1 size-4 animate-spin" viewBox="0 0 40 40" fill="none">
                    <circle cx="20" cy="20" r="15" stroke="#6b7280" strokeWidth="5" strokeLinecap="round" />
                    <circle cx="20" cy="20" r="15" stroke="white" strokeWidth="5" strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset="70" />
                  </svg>
                </>
              ) : (
                <>
                  Yes, delete client
                  <ArrowRight className="ml-1 size-4" />
                </>
              )}
            </Button>

            <Button
              data-testid="disable-instead-button"
              variant="outline"
              disabled={deleting || toggling}
              onClick={async () => {
                setToggling(true)
                try {
                  setIsDeleteOpen(false)
                  const name = client!.clientName
                  await toggleClientStatus(clientId)
                  const params = new URLSearchParams({
                    statusChanged: "disabled",
                    clientName: name,
                  })
                  router.push(`/client-management?${params.toString()}`)
                } catch {
                  setToggling(false)
                }
              }}
              className="h-11 w-full rounded-xl border border-black"
            >
              {toggling ? (
                <>
                  Disabling...
                  <svg className="ml-1 size-4 animate-spin" viewBox="0 0 40 40" fill="none">
                    <circle cx="20" cy="20" r="15" stroke="#d1d5db" strokeWidth="5" strokeLinecap="round" />
                    <circle cx="20" cy="20" r="15" stroke="#111827" strokeWidth="5" strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset="70" />
                  </svg>
                </>
              ) : (
                "Disable client instead"
              )}
            </Button>

            <button
              type="button"
              data-testid="cancel-delete-button"
              disabled={deleting || toggling}
              onClick={() => setIsDeleteOpen(false)}
              className={`text-sm font-medium text-[#FF3A69] hover:text-[#FF3A69]/80 ${deleting || toggling ? "disabled:opacity-50" : ""}`}
            >
              Cancel
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Disable / Activate Confirmation Dialog */}
      <Dialog open={isStatusOpen} onOpenChange={(v) => { if (!toggling) setIsStatusOpen(v) }}>
        <DialogContent className="rounded-2xl p-6 sm:p-8">
          <DialogHeader className="flex flex-col items-center gap-2 text-center">
            <DialogTitle className="text-2xl font-bold text-gray-900">
              {client.status === "Active" ? "Disable" : "Activate"} {client.clientName}?
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-500">
              {client.status === "Active"
                ? "Disabling this client will restrict access to all associated units and users. This can be reversed"
                : "Activating this client will restore system access and permissions."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-3 pt-4">
            <Button
              data-testid="confirm-status-button"
              disabled={toggling}
              onClick={async () => {
                setIsStatusOpen(false)
                await handleDisableClient()
              }}
              className="h-11 w-full rounded-xl bg-gray-900 text-white hover:bg-gray-800"
            >
              {toggling ? (
                <>
                  {client.status === "Active" ? "Disabling..." : "Activating..."}
                  <svg className="ml-1 size-4 animate-spin" viewBox="0 0 40 40" fill="none">
                    <circle cx="20" cy="20" r="15" stroke="#6b7280" strokeWidth="5" strokeLinecap="round" />
                    <circle cx="20" cy="20" r="15" stroke="white" strokeWidth="5" strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset="70" />
                  </svg>
                </>
              ) : (
                <>
                  Yes, {client.status === "Active" ? "disable" : "activate"} client
                  <ArrowRight className="ml-1 size-4" />
                </>
              )}
            </Button>

            <button
              type="button"
              data-testid="cancel-status-button"
              disabled={toggling}
              onClick={() => setIsStatusOpen(false)}
              className={`text-sm font-medium text-[#FF3A69] hover:text-[#FF3A69]/80 ${toggling ? "disabled:opacity-50" : ""}`}
            >
              Cancel
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* PIN verification — required before client deletion */}
      <PinVerificationModal
        open={pinOpen}
        onOpenChange={setPinOpen}
        activeUnitId={activeUnitId}
        heading="Confirm client deletion"
        subtitle="Enter your access PIN to permanently delete this client."
        onVerified={async () => {
          await handleDeleteClient()
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// ImmediateUploadRow — file picker that fires the upload as soon as a file
// is chosen. Used for logo + favicon on the Manage Client page where the
// user expects the change to take effect without an extra "save" click.
// ---------------------------------------------------------------------------

function ImmediateUploadRow({
  kind,
  label,
  accept,
  url,
  busy,
  error,
  onUpload,
  onRemove,
  sizeClass,
  shapeClass,
  placeholderLabel,
  footnote,
}: {
  kind: string
  label: string
  accept: string
  url: string | null
  busy: boolean
  error: string | null
  onUpload: (file: File) => void
  onRemove: () => void
  sizeClass: string
  shapeClass: string
  placeholderLabel: string
  footnote: string
}) {
  const inputId = `${kind}-file`
  return (
    <div className="flex flex-col items-start gap-2">
      {/* Image + buttons inline; wrap onto a second line on narrow screens
          so the buttons don't get clipped or pushed off-canvas. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div
          data-testid={`${kind}-preview`}
          className={`flex ${sizeClass} shrink-0 items-center justify-center overflow-hidden ${shapeClass} border border-gray-200 bg-white`}
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={`Client ${label}`} className="size-full object-cover" />
          ) : (
            <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
              {placeholderLabel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <label
            htmlFor={inputId}
            className={`inline-flex w-fit items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 ${
              busy ? "cursor-wait opacity-60" : "cursor-pointer hover:bg-gray-100"
            }`}
          >
            {busy ? "Uploading..." : url ? `Replace ${label}` : `Upload ${label}`}
          </label>
          <input
            id={inputId}
            data-testid={`input-${kind}-file`}
            type="file"
            accept={accept}
            disabled={busy}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ""
              if (file) onUpload(file)
            }}
          />
          {url && (
            <button
              type="button"
              data-testid={`${kind}-remove-button`}
              onClick={onRemove}
              disabled={busy}
              className="text-xs text-red-600 hover:underline disabled:opacity-50"
            >
              Remove
            </button>
          )}
        </div>
      </div>
      <span className="text-[11px] text-gray-500">{footnote}</span>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// AccentColorRow — native colour input + live WCAG contrast warning.
//
// The accent paints solid pills / buttons with white text on top throughout
// the dashboard, so contrast against #fff is the dominant concern. We show
// the ratio inline plus a verdict label so admins can see "AA" / "AA Large"
// / "Fail" without having to open a separate tool.
//
// "Reset to default" sets the picker back to DEFAULT_ACCENT — the save
// handler treats that as a sentinel to clear the DB column.
// ---------------------------------------------------------------------------

function AccentColorRow({
  accent,
  onChange,
  defaultAccent,
}: {
  accent: string
  onChange: (next: string) => void
  defaultAccent: string
}) {
  const check = checkAccentAgainstWhite(accent)
  const isAtDefault = accent.toLowerCase() === defaultAccent.toLowerCase()

  let verdictLabel = ""
  let verdictTone = "text-gray-500"
  if (check) {
    if (check.verdict === "aa-normal") {
      verdictLabel = `Contrast ${check.ratio.toFixed(2)}:1 — AA (text + UI)`
      verdictTone = "text-green-700"
    } else if (check.verdict === "aa-large") {
      verdictLabel = `Contrast ${check.ratio.toFixed(2)}:1 — AA Large only (UI / large text). Avoid for body text on this colour.`
      verdictTone = "text-amber-700"
    } else {
      verdictLabel = `Contrast ${check.ratio.toFixed(2)}:1 — Fails WCAG AA. White text on this colour will be hard to read.`
      verdictTone = "text-red-700"
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap items-center gap-3">
        {/* Swatch tile — the native colour input is positioned absolutely
            on top of this so the browser's colour picker anchors to the
            swatch (not the top-left of the page, which is what happens
            when the input is `display: none`). The input is opacity-0 so
            we keep our own visual; clicks pass through to it because it
            covers the full tile. */}
        <div className="relative h-14 w-40">
          <div className="pointer-events-none flex size-full items-center gap-3 rounded-lg border border-gray-200 bg-white px-3">
            <span
              className="size-8 shrink-0 rounded border border-gray-200"
              style={{ backgroundColor: accent }}
              aria-hidden="true"
            />
            <span className="font-mono text-xs uppercase text-gray-700">{accent}</span>
          </div>
          <input
            id="accent-color"
            data-testid="input-accent-color"
            type="color"
            value={accent}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
            aria-label="Accent colour"
          />
        </div>
        <label
          htmlFor="accent-color"
          className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
        >
          {isAtDefault ? "Pick a colour" : "Change colour"}
        </label>
        {!isAtDefault && (
          <button
            type="button"
            data-testid="accent-reset-button"
            onClick={() => onChange(defaultAccent)}
            className="text-xs text-gray-600 hover:underline"
          >
            Reset to default
          </button>
        )}
      </div>
      <span className="text-[11px] text-gray-500">
        Brand accent used for active filters, primary buttons, links, and the
        sidebar. Saved when you click Update Information.
      </span>
      {check && (
        <span
          className={`text-[11px] ${verdictTone}`}
          data-testid="accent-contrast-verdict"
          aria-live="polite"
        >
          {verdictLabel}
        </span>
      )}
    </div>
  )
}
