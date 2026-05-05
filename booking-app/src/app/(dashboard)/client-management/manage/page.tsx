"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
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
  const { activeUnitId } = useAuth()

  const client = getClient(clientId)

  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [isStatusOpen, setIsStatusOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [toggling, setToggling] = useState(false)
  // PIN re-verification required for client deletion (destructive).
  const [pinOpen, setPinOpen] = useState(false)
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
      })
      router.push("/client-management")
    } catch {
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
    } catch {
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

        {/* Form */}
        <div className="flex w-full max-w-md flex-col gap-4">
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

          {/* Branding — uploads fire immediately on file pick. The "Update
              Information" button below is for the text fields only; logo /
              favicon don't need to wait for a save. */}
          <div className="mt-2 flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
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
        </div>

        {/* Actions */}
        <div className="flex w-full max-w-md flex-col items-center gap-3">
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
        {/* Native colour picker. The visible swatch is the input itself —
            we just style the surrounding box. */}
        <label
          htmlFor="accent-color"
          className="flex h-14 w-40 cursor-pointer items-center gap-3 rounded-lg border border-gray-200 bg-white px-3"
        >
          <span
            className="size-8 shrink-0 rounded border border-gray-200"
            style={{ backgroundColor: accent }}
            aria-hidden="true"
          />
          <span className="font-mono text-xs uppercase text-gray-700">{accent}</span>
        </label>
        <input
          id="accent-color"
          data-testid="input-accent-color"
          type="color"
          value={accent}
          onChange={(e) => onChange(e.target.value)}
          className="hidden"
          aria-label="Accent colour"
        />
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
