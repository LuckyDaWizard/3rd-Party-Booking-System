"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  ArrowRight,
  FileText,
  X,
  CheckCircle,
  ChevronDown,
  User as UserIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { FloatingInput } from "@/components/ui/floating-input"
import { FloatingSelect } from "@/components/ui/floating-select"
import { useClientStore } from "@/lib/client-store"
import { useUnitStore } from "@/lib/unit-store"
import { useUserStore } from "@/lib/user-store"
import { useAuth } from "@/lib/auth-store"
import { supabase } from "@/lib/supabase"
import { validateImageMinDimensions } from "@/lib/image-dimensions"
import { checkAccentAgainstWhite } from "@/lib/color-contrast"

// ---------------------------------------------------------------------------
// Success Banner
// ---------------------------------------------------------------------------

function SuccessBanner({
  clientName,
  onDismiss,
}: {
  clientName: string
  onDismiss: () => void
}) {
  return (
    <div
      data-testid="success-banner"
      className="flex items-start justify-between rounded-xl bg-green-50 border border-green-200 px-6 py-4"
    >
      <div className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-gray-900">
          Client Successfully Added
        </span>
        <span className="text-sm text-gray-600">
          {clientName} has been added successfully. You can add a unit to this
          client or skip this step for now.
        </span>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="ml-4 shrink-0 rounded-full p-0.5 text-gray-400 hover:text-gray-600"
        aria-label="Dismiss"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ClientDetails {
  clientName: string
  contactPersonName: string
  contactPersonSurname: string
  emailAddress: string
  contactNumber: string
  /** Logo file selected by the user; uploaded after the client is created. */
  logoFile: File | null
  logoPreviewUrl: string | null
  /** Favicon file selected by the user; uploaded after the client is created. */
  faviconFile: File | null
  faviconPreviewUrl: string | null
  /** Brand accent colour. Defaults to the system value; sent as null to the
   *  server when left at default so the row stays clean. */
  accentColor: string
}

const DEFAULT_ACCENT = "#3ea3db"

const TOTAL_STEPS = 4
const LOGO_MAX_BYTES = 2 * 1024 * 1024
const LOGO_ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml"
const FAVICON_ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon,image/vnd.microsoft.icon"
// Minimum pixel dimensions — guard against tiny uploads that would scale up
// poorly. Vector + ICO formats skip the check (see lib/image-dimensions.ts).
const LOGO_MIN_WIDTH = 200
const LOGO_MIN_HEIGHT = 60
const FAVICON_MIN_WIDTH = 64
const FAVICON_MIN_HEIGHT = 64
// User avatar — same constraints as the standalone Add User page so a
// fresh-from-wizard user looks identical to one created via /user-management/add.
const AVATAR_MIN_WIDTH = 80
const AVATAR_MIN_HEIGHT = 80
const AVATAR_MAX_BYTES = 2 * 1024 * 1024
const AVATAR_ACCEPT = "image/png,image/jpeg,image/webp"

const PROVINCES = [
  { value: "eastern-cape", label: "Eastern Cape" },
  { value: "free-state", label: "Free State" },
  { value: "gauteng", label: "Gauteng" },
  { value: "kwazulu-natal", label: "KwaZulu-Natal" },
  { value: "limpopo", label: "Limpopo" },
  { value: "mpumalanga", label: "Mpumalanga" },
  { value: "north-west", label: "North West" },
  { value: "northern-cape", label: "Northern Cape" },
  { value: "western-cape", label: "Western Cape" },
]

// ---------------------------------------------------------------------------
// Step 1 — Client Details
// ---------------------------------------------------------------------------

function StepClientDetails({
  data,
  onChange,
}: {
  data: ClientDetails
  onChange: (updated: ClientDetails) => void
}) {
  function handleChange(field: keyof ClientDetails, value: string) {
    onChange({ ...data, [field]: value })
  }

  function handleClear(field: keyof ClientDetails) {
    onChange({ ...data, [field]: "" })
  }

  return (
    <div
      data-testid="step-client-details"
      className="flex w-full max-w-md flex-col items-center gap-6"
    >
      <div className="flex flex-col items-center gap-1 text-center">
        <h1
          data-testid="step-heading"
          className="text-3xl font-bold text-gray-900"
        >
          Add new client
        </h1>
        <p className="text-base text-gray-500">
          Please provide the client&apos;s details below
        </p>
      </div>

      <div className="flex w-full flex-col gap-4">
        <FloatingInput
          id="client-name"
          data-testid="input-client-name"
          label="Client Name"
          value={data.clientName}
          onChange={(v) => handleChange("clientName", v)}
          onClear={() => handleClear("clientName")}
        />

        <div className="flex w-full flex-col gap-4 sm:flex-row">
          <FloatingInput
            id="contact-person-name"
            data-testid="input-contact-person-name"
            label="Contact Person Name"
            value={data.contactPersonName}
            onChange={(v) => handleChange("contactPersonName", v)}
            onClear={() => handleClear("contactPersonName")}
            className="flex-1"
          />
          <FloatingInput
            id="contact-person-surname"
            data-testid="input-contact-person-surname"
            label="Contact Person Surname"
            value={data.contactPersonSurname}
            onChange={(v) => handleChange("contactPersonSurname", v)}
            onClear={() => handleClear("contactPersonSurname")}
            className="flex-1"
          />
        </div>

        <FloatingInput
          id="email-address"
          data-testid="input-email-address"
          label="Email Address"
          type="email"
          value={data.emailAddress}
          onChange={(v) => handleChange("emailAddress", v)}
          onClear={() => handleClear("emailAddress")}
        />

        <FloatingInput
          id="contact-number"
          data-testid="input-contact-number"
          label="Contact Number"
          type="tel"
          value={data.contactNumber}
          onChange={(v) => handleChange("contactNumber", v)}
          onClear={() => handleClear("contactNumber")}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 2 — Branding (optional)
// ---------------------------------------------------------------------------

function StepBranding({
  data,
  onChange,
}: {
  data: ClientDetails
  onChange: (updated: ClientDetails) => void
}) {
  return (
    <div
      data-testid="step-branding"
      className="flex w-full max-w-md flex-col items-center gap-6"
    >
      <div className="flex flex-col items-center gap-1 text-center">
        <h1
          data-testid="step-heading"
          className="text-3xl font-bold text-gray-900"
        >
          Branding
        </h1>
        <p className="text-base text-gray-500">
          Optional. Add a logo, favicon, and accent colour for this client.
        </p>
      </div>

      <div className="flex w-full flex-col gap-4">
        {/* Logo + favicon files are uploaded after the client is created
            (we need an id first); previews use object URLs. */}
        <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
          {/* Logo */}
          <FilePickerRow
            kind="logo"
            label="logo"
            accept={LOGO_ACCEPT}
            minWidth={LOGO_MIN_WIDTH}
            minHeight={LOGO_MIN_HEIGHT}
            previewUrl={data.logoPreviewUrl}
            file={data.logoFile}
            onPick={(file) => {
              if (data.logoPreviewUrl) URL.revokeObjectURL(data.logoPreviewUrl)
              onChange({
                ...data,
                logoFile: file,
                logoPreviewUrl: file ? URL.createObjectURL(file) : null,
              })
            }}
            sizeClass="h-14 w-40"
            shapeClass="rounded-lg"
            placeholderLabel="Logo"
            footnote="Horizontal. Displays at up to 180×48 px in the sidebar — recommend 360×96 px (about 4:1) or wider, transparent background. PNG, JPEG, WEBP, or SVG. Max 2 MB."
          />

          {/* Favicon */}
          <FilePickerRow
            kind="favicon"
            label="favicon"
            accept={FAVICON_ACCEPT}
            minWidth={FAVICON_MIN_WIDTH}
            minHeight={FAVICON_MIN_HEIGHT}
            previewUrl={data.faviconPreviewUrl}
            file={data.faviconFile}
            onPick={(file) => {
              if (data.faviconPreviewUrl) URL.revokeObjectURL(data.faviconPreviewUrl)
              onChange({
                ...data,
                faviconFile: file,
                faviconPreviewUrl: file ? URL.createObjectURL(file) : null,
              })
            }}
            sizeClass="size-12"
            shapeClass="rounded-md"
            placeholderLabel="Icon"
            footnote="Square (1:1). Displays at 36×36 px in the collapsed sidebar and client list — recommend 128×128 px or larger, transparent background. PNG / SVG / ICO. Max 2 MB."
          />

          {/* Accent colour — sent with the create payload. */}
          <AccentPickerRow
            accent={data.accentColor}
            onChange={(next) => onChange({ ...data, accentColor: next })}
            defaultAccent={DEFAULT_ACCENT}
          />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// FilePickerRow — small inline file-picker used for logo + favicon. Pure
// presentational; the parent owns the File state and preview URL lifecycle.
// ---------------------------------------------------------------------------

function FilePickerRow({
  kind,
  label,
  accept,
  minWidth,
  minHeight,
  previewUrl,
  file,
  onPick,
  sizeClass,
  shapeClass,
  placeholderLabel,
  footnote,
}: {
  kind: string
  label: string
  accept: string
  minWidth?: number
  minHeight?: number
  previewUrl: string | null
  file: File | null
  onPick: (file: File | null) => void
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
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt={`${label} preview`} className="size-full object-cover" />
          ) : (
            <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
              {placeholderLabel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <label
            htmlFor={inputId}
            className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
          >
            {file ? `Replace ${label}` : `Upload ${label}`}
          </label>
          <input
            id={inputId}
            data-testid={`input-${kind}-file`}
            type="file"
            accept={accept}
            className="hidden"
            onChange={async (e) => {
              const picked = e.target.files?.[0] ?? null
              e.target.value = ""
              if (!picked) {
                onPick(null)
                return
              }
              if (picked.size > LOGO_MAX_BYTES) {
                alert(`${placeholderLabel} must be 2 MB or smaller.`)
                return
              }
              if (minWidth && minHeight) {
                const dimsError = await validateImageMinDimensions(
                  picked,
                  minWidth,
                  minHeight
                )
                if (dimsError) {
                  alert(dimsError)
                  return
                }
              }
              onPick(picked)
            }}
          />
          {file && (
            <button
              type="button"
              data-testid={`${kind}-remove-button`}
              onClick={() => onPick(null)}
              className="text-xs text-red-600 hover:underline"
            >
              Remove
            </button>
          )}
        </div>
      </div>
      <span className="text-[11px] text-gray-500">{footnote}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// AccentPickerRow — same UX as the Manage page's row, scaled down for the
// create flow. Shows the current swatch + hex, lets admin open the native
// colour input, displays a live WCAG-against-white verdict.
// ---------------------------------------------------------------------------

function AccentPickerRow({
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
      verdictLabel = `Contrast ${check.ratio.toFixed(2)}:1 — AA`
      verdictTone = "text-green-700"
    } else if (check.verdict === "aa-large") {
      verdictLabel = `Contrast ${check.ratio.toFixed(2)}:1 — AA Large only`
      verdictTone = "text-amber-700"
    } else {
      verdictLabel = `Contrast ${check.ratio.toFixed(2)}:1 — Fails WCAG AA`
      verdictTone = "text-red-700"
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap items-center gap-3">
        {/* Swatch tile with the native colour input positioned over it
            (opacity-0). This anchors the browser's picker dialog to the
            swatch instead of the page top-left, which is what happens
            when the input is `display: none`. */}
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
          {isAtDefault ? "Pick accent" : "Change accent"}
        </label>
        {!isAtDefault && (
          <button
            type="button"
            data-testid="accent-reset-button"
            onClick={() => onChange(defaultAccent)}
            className="text-xs text-gray-600 hover:underline"
          >
            Reset
          </button>
        )}
      </div>
      <span className="text-[11px] text-gray-500">
        Optional. Brand accent used for active filters, primary buttons, and
        the sidebar.
      </span>
      {check && (
        <span className={`text-[11px] ${verdictTone}`} aria-live="polite">
          {verdictLabel}
        </span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 2 — Unit Details
// ---------------------------------------------------------------------------

interface UnitDetails {
  unitName: string
  contactPersonName: string
  contactPersonSurname: string
  emailAddress: string
  province: string
}

function StepUnitDetails({
  clientName,
  data,
  onChange,
}: {
  clientName: string
  data: UnitDetails
  onChange: (updated: UnitDetails) => void
}) {
  function handleChange(field: keyof UnitDetails, value: string) {
    onChange({ ...data, [field]: value })
  }

  return (
    <div
      data-testid="step-unit-details"
      className="flex w-full max-w-md flex-col items-center gap-6"
    >
      <div className="flex flex-col items-center gap-1 text-center">
        <h1
          data-testid="step-heading"
          className="text-3xl font-bold text-gray-900"
        >
          Add unit
        </h1>
        <p className="text-base text-gray-500">
          Please provide the unit&apos;s details below
        </p>
      </div>

      <div className="flex w-full flex-col gap-4">
        {/* Client — pre-filled, read-only */}
        <FloatingInput
          id="client"
          data-testid="input-client"
          label="Client"
          value={clientName}
          onChange={() => {}}
          onClear={() => {}}
          readOnly
        />

        <FloatingInput
          id="unit-name"
          data-testid="input-unit-name"
          label="Unit Name"
          value={data.unitName}
          onChange={(v) => handleChange("unitName", v)}
          onClear={() => handleChange("unitName", "")}
        />

        <div className="flex w-full flex-col gap-4 sm:flex-row">
          <FloatingInput
            id="unit-contact-person-name"
            data-testid="input-unit-contact-person-name"
            label="Contact Person Name"
            value={data.contactPersonName}
            onChange={(v) => handleChange("contactPersonName", v)}
            onClear={() => handleChange("contactPersonName", "")}
            className="flex-1"
          />
          <FloatingInput
            id="unit-contact-person-surname"
            data-testid="input-unit-contact-person-surname"
            label="Contact Person Surname"
            value={data.contactPersonSurname}
            onChange={(v) => handleChange("contactPersonSurname", v)}
            onClear={() => handleChange("contactPersonSurname", "")}
            className="flex-1"
          />
        </div>

        <FloatingInput
          id="unit-email-address"
          data-testid="input-unit-email-address"
          label="Email Address"
          type="email"
          value={data.emailAddress}
          onChange={(v) => handleChange("emailAddress", v)}
          onClear={() => handleChange("emailAddress", "")}
        />

        <FloatingSelect
          id="province"
          data-testid="select-province"
          label="Select Province"
          value={data.province}
          onChange={(v) => handleChange("province", v)}
          options={PROVINCES}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 4 — User Details
//
// Mirrors /user-management/add: avatar upload, contact form, role select,
// unit multi-select. The unit multi-select is pre-filtered to units owned
// by the new client (just-created in step 3, plus any earlier units if the
// admin came back through). Optional — the admin can Skip and add users
// later from User Management.
// ---------------------------------------------------------------------------

interface UserDetails {
  firstNames: string
  surname: string
  emailAddress: string
  contactNumber: string
  role: string
  unitIds: string[]
  avatarFile: File | null
  avatarPreviewUrl: string | null
}

function ClientScopedUnitMultiSelect({
  selectedIds,
  onChange,
  units,
}: {
  selectedIds: string[]
  onChange: (unitIds: string[]) => void
  units: { id: string; unitName: string }[]
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState("")
  const ref = useRef<HTMLDivElement>(null)

  const available = units.filter((u) => !selectedIds.includes(u.id))
  const filtered = search.trim()
    ? available.filter((u) =>
        u.unitName.toLowerCase().includes(search.toLowerCase())
      )
    : available
  const selectedUnits = units.filter((u) => selectedIds.includes(u.id))

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isOpen])

  return (
    <div ref={ref} className="flex flex-col gap-2">
      <div className="relative">
        <button
          type="button"
          data-testid="user-unit-multi-select"
          onClick={() => setIsOpen(!isOpen)}
          disabled={units.length === 0}
          className={`flex h-14 w-full items-center rounded-lg border bg-white px-4 text-left text-sm outline-none transition-colors ${
            isOpen ? "border-gray-900" : "border-gray-300"
          } ${units.length === 0 ? "cursor-not-allowed opacity-60" : ""}`}
        >
          {/* Trigger reflects current selection state — easy to miss the
              chip strip below on small viewports otherwise. */}
          {units.length === 0 ? (
            <span className="text-gray-400">
              No units yet — add one in step 3 first
            </span>
          ) : selectedIds.length > 0 ? (
            <span className="text-gray-700">
              {selectedIds.length} unit{selectedIds.length === 1 ? "" : "s"} selected
              <span className="ml-1 text-gray-400"> — add another</span>
            </span>
          ) : (
            <span className="text-gray-400">Search unit to assign user to</span>
          )}
        </button>
        <ChevronDown
          className={`pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-gray-400 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />

        {isOpen && (
          <div className="absolute left-0 top-full z-10 mt-1 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
            <div className="border-b border-gray-100 px-4 py-3">
              <input
                type="text"
                placeholder="Search units..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
                autoFocus
              />
            </div>
            <div className="mx-2 my-2 flex max-h-64 flex-col gap-1 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="px-4 py-3 text-sm text-gray-400">
                  {available.length === 0 ? "All units assigned" : "No units found"}
                </div>
              ) : (
                filtered.map((unit) => (
                  <button
                    key={unit.id}
                    type="button"
                    onClick={() => {
                      onChange([...selectedIds, unit.id])
                      setSearch("")
                    }}
                    className="w-full rounded-lg px-5 py-4 text-left text-base text-gray-900 transition-colors hover:bg-[var(--client-primary-15)]"
                  >
                    {unit.unitName}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {selectedUnits.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedUnits.map((unit) => (
            <span
              key={unit.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--client-primary-30)] bg-[var(--client-primary-10)] px-3 py-1 text-sm text-[var(--client-primary)]"
            >
              {unit.unitName}
              <button
                type="button"
                onClick={() =>
                  onChange(selectedIds.filter((id) => id !== unit.id))
                }
                className="rounded-full p-0.5 text-[var(--client-primary)] hover:bg-[var(--client-primary-20)]"
                aria-label={`Remove ${unit.unitName}`}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function StepUserDetails({
  clientName,
  clientUnits,
  data,
  onChange,
  emailError,
  contactError,
  onCheckEmail,
  onCheckContact,
}: {
  clientName: string
  clientUnits: { id: string; unitName: string }[]
  data: UserDetails
  onChange: (updated: UserDetails) => void
  emailError: string
  contactError: string
  onCheckEmail: (email: string) => void
  onCheckContact: (contact: string) => void
}) {
  return (
    <div
      data-testid="step-user-details"
      className="flex w-full max-w-md flex-col items-center gap-6"
    >
      <div className="flex flex-col items-center gap-1 text-center">
        <h1
          data-testid="step-heading"
          className="text-3xl font-bold text-gray-900"
        >
          Add user
        </h1>
        <p className="text-base text-gray-500">
          Optional. Create a user assigned to {clientName}&apos;s units.
        </p>
      </div>

      {/* Avatar */}
      <div className="flex flex-col items-center gap-3">
        <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-gray-50">
          {data.avatarPreviewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.avatarPreviewUrl}
              alt="Avatar preview"
              className="size-full object-cover"
            />
          ) : (
            <UserIcon className="size-12 text-gray-300" strokeWidth={1.5} />
          )}
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-3">
            <label
              htmlFor="user-avatar-file"
              className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
            >
              {data.avatarFile ? "Replace photo" : "Upload photo (optional)"}
            </label>
            <input
              id="user-avatar-file"
              data-testid="input-user-avatar-file"
              type="file"
              accept={AVATAR_ACCEPT}
              className="hidden"
              onChange={async (e) => {
                const picked = e.target.files?.[0] ?? null
                e.target.value = ""
                if (!picked) return
                if (picked.size > AVATAR_MAX_BYTES) {
                  alert("Photo must be 2 MB or smaller.")
                  return
                }
                const dimsError = await validateImageMinDimensions(
                  picked,
                  AVATAR_MIN_WIDTH,
                  AVATAR_MIN_HEIGHT
                )
                if (dimsError) {
                  alert(dimsError)
                  return
                }
                if (data.avatarPreviewUrl) URL.revokeObjectURL(data.avatarPreviewUrl)
                onChange({
                  ...data,
                  avatarFile: picked,
                  avatarPreviewUrl: URL.createObjectURL(picked),
                })
              }}
            />
            {data.avatarFile && (
              <button
                type="button"
                onClick={() => {
                  if (data.avatarPreviewUrl) URL.revokeObjectURL(data.avatarPreviewUrl)
                  onChange({ ...data, avatarFile: null, avatarPreviewUrl: null })
                }}
                className="text-xs text-red-600 hover:underline"
              >
                Remove
              </button>
            )}
          </div>
          <span className="text-[11px] text-gray-500">
            PNG, JPEG, or WEBP. Max 2 MB.
          </span>
        </div>
      </div>

      {/* Form */}
      <div className="flex w-full flex-col gap-4">
        {/* No-units hint — without a unit the user can't be assigned, so
            Submit will be blocked. Make the path forward (Back to step 3
            and add one, or Skip the user step) explicit instead of
            leaving the admin to puzzle out why Submit won't activate. */}
        {clientUnits.length === 0 && (
          <div
            data-testid="no-units-hint"
            className="flex flex-col gap-1 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            <span className="font-semibold text-gray-900">
              No units linked to this client yet
            </span>
            <span className="text-xs">
              A user must be assigned to at least one unit. Click{" "}
              <strong>Back</strong> to add a unit, or{" "}
              <strong>Skip this step for now</strong> to finish without
              creating a user.
            </span>
          </div>
        )}

        <ClientScopedUnitMultiSelect
          selectedIds={data.unitIds}
          onChange={(ids) => onChange({ ...data, unitIds: ids })}
          units={clientUnits}
        />

        <FloatingInput
          id="user-first-names"
          data-testid="input-user-first-names"
          label="First Names"
          value={data.firstNames}
          onChange={(v) => onChange({ ...data, firstNames: v })}
          onClear={() => onChange({ ...data, firstNames: "" })}
        />

        <FloatingInput
          id="user-surname"
          data-testid="input-user-surname"
          label="Surname"
          value={data.surname}
          onChange={(v) => onChange({ ...data, surname: v })}
          onClear={() => onChange({ ...data, surname: "" })}
        />

        <FloatingInput
          id="user-email-address"
          data-testid="input-user-email-address"
          label="Email Address"
          type="email"
          value={data.emailAddress}
          onChange={(v) => onChange({ ...data, emailAddress: v })}
          onClear={() => onChange({ ...data, emailAddress: "" })}
          onBlur={() => onCheckEmail(data.emailAddress)}
          error={emailError}
        />

        <FloatingInput
          id="user-contact-number"
          data-testid="input-user-contact-number"
          label="Contact Number"
          type="tel"
          value={data.contactNumber}
          onChange={(v) => onChange({ ...data, contactNumber: v })}
          onClear={() => onChange({ ...data, contactNumber: "" })}
          onBlur={() => onCheckContact(data.contactNumber)}
          error={contactError}
        />

        <FloatingSelect
          id="user-role"
          data-testid="select-user-role"
          label="Select Access Role"
          value={data.role}
          onChange={(v) => onChange({ ...data, role: v })}
          options={[
            { value: "user", label: "User" },
            { value: "unit_manager", label: "Unit Manager" },
            { value: "system_admin", label: "System Admin" },
          ]}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function AddNewClientPage() {
  const router = useRouter()
  const { addClient, refreshClients } = useClientStore()
  const { addUnit, units: allUnits } = useUnitStore()
  const { addUser } = useUserStore()
  const { isSystemAdmin } = useAuth()
  const [currentStep, setCurrentStep] = useState(1)
  const [showBanner, setShowBanner] = useState(false)
  const [newClientId, setNewClientId] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [userEmailError, setUserEmailError] = useState("")
  const [userContactError, setUserContactError] = useState("")
  // Wizard-level error banner. Surfaces save failures from any step
  // (addClient on step 2, addUnit on step 3, addUser on step 4). Cleared
  // on each new Next click. Without this the outer catch swallowed
  // errors and the admin couldn't tell whether retrying would create
  // a duplicate.
  const [stepError, setStepError] = useState("")

  const [clientDetails, setClientDetails] = useState<ClientDetails>({
    clientName: "",
    contactPersonName: "",
    contactPersonSurname: "",
    emailAddress: "",
    contactNumber: "",
    logoFile: null,
    logoPreviewUrl: null,
    faviconFile: null,
    faviconPreviewUrl: null,
    accentColor: DEFAULT_ACCENT,
  })

  const [unitDetails, setUnitDetails] = useState<UnitDetails>({
    unitName: "",
    contactPersonName: "",
    contactPersonSurname: "",
    emailAddress: "",
    province: "",
  })

  const [userDetails, setUserDetails] = useState<UserDetails>({
    firstNames: "",
    surname: "",
    emailAddress: "",
    contactNumber: "",
    role: "",
    unitIds: [],
    avatarFile: null,
    avatarPreviewUrl: null,
  })

  // The Users step pre-filters its unit dropdown to units owned by the new
  // client. Recomputed each render — `allUnits` is the dashboard-layout's
  // unit-store, which we re-fetch after step 3 creates a unit.
  const clientUnitsForUser = newClientId
    ? allUnits
        .filter((u) => u.clientId === newClientId)
        .map((u) => ({ id: u.id, unitName: u.unitName }))
    : []

  // System admin can create any role; unit_manager can only create regular
  // users. Mirrors /user-management/add.
  // Note: this wizard is system_admin-only (per dashboard route guard), but
  // we keep the filter for defence-in-depth.
  const userRoleOptions = isSystemAdmin
    ? ["user", "unit_manager", "system_admin"]
    : ["user"]
  // Strip out any selected role the caller isn't allowed to set.
  const userRoleAllowed = userRoleOptions.includes(userDetails.role)

  async function checkUserEmail(email: string) {
    if (!email.trim()) {
      setUserEmailError("")
      return
    }
    const { data } = await supabase
      .from("users")
      .select("id")
      .eq("email", email.trim())
      .limit(1)
    setUserEmailError(
      data && data.length > 0
        ? "This email is already assigned to an existing user"
        : ""
    )
  }

  async function checkUserContact(contact: string) {
    if (!contact.trim()) {
      setUserContactError("")
      return
    }
    const { data } = await supabase
      .from("users")
      .select("id")
      .eq("contact_number", contact.trim())
      .limit(1)
    setUserContactError(
      data && data.length > 0
        ? "This contact number is already assigned to an existing user"
        : ""
    )
  }

  // Has the admin filled in enough to actually create a user? The Users
  // step is optional, so we don't gate Next on this — but we do gate the
  // *create*: an empty form just skips through.
  const isUserFormPopulated =
    userDetails.firstNames.trim() !== "" ||
    userDetails.surname.trim() !== "" ||
    userDetails.emailAddress.trim() !== "" ||
    userDetails.contactNumber.trim() !== "" ||
    userDetails.role.trim() !== "" ||
    userDetails.unitIds.length > 0 ||
    userDetails.avatarFile !== null

  const isUserFormValid =
    userDetails.firstNames.trim() !== "" &&
    userDetails.surname.trim() !== "" &&
    userDetails.role.trim() !== "" &&
    userRoleAllowed &&
    userDetails.unitIds.length > 0 &&
    !userEmailError &&
    !userContactError

  const isStep1Complete =
    clientDetails.clientName.trim() !== "" &&
    clientDetails.contactPersonName.trim() !== "" &&
    clientDetails.contactPersonSurname.trim() !== "" &&
    clientDetails.emailAddress.trim() !== "" &&
    clientDetails.contactNumber.trim() !== ""

  async function handleNext() {
    setSubmitting(true)
    setStepError("")
    try {
      if (currentStep === 1 && isStep1Complete) {
        // Step 1 → 2: just advance to the Branding step. The client row is
        // not created until the admin commits to the branding choices on
        // step 2, so they can still edit the contact details by going back.
        setCurrentStep(2)
        setSubmitting(false)
      } else if (currentStep === 2) {
        // Step 2 → 3: create the client row + upload any selected assets.
        const id = await addClient({
          clientName: clientDetails.clientName,
          contactPersonName: clientDetails.contactPersonName,
          contactPersonSurname: clientDetails.contactPersonSurname,
          units: "-",
          email: clientDetails.emailAddress,
          number: clientDetails.contactNumber,
          logoUrl: null,
          faviconUrl: null,
          // Send null when left at the system default so the row stays
          // clean and inherits any future bumps to the system accent.
          accentColor:
            clientDetails.accentColor.toLowerCase() === DEFAULT_ACCENT.toLowerCase()
              ? null
              : clientDetails.accentColor,
        })
        // Upload logo + favicon (if either selected) now that we have an id.
        // Best-effort — if either fails the client still exists; admin can
        // retry from Manage Client.
        async function uploadAsset(kind: "logo" | "favicon", file: File) {
          try {
            const fd = new FormData()
            fd.append("file", file)
            const uploadRes = await fetch(`/api/admin/clients/${id}/${kind}`, {
              method: "POST",
              body: fd,
            })
            if (!uploadRes.ok) {
              const { error } = await uploadRes.json().catch(() => ({}))
              alert(`Client created, but ${kind} upload failed: ${error ?? uploadRes.statusText}. You can upload it from Manage Client.`)
            }
          } catch (uploadErr) {
            console.warn(`${kind} upload failed:`, uploadErr)
          }
        }
        if (clientDetails.logoFile) {
          await uploadAsset("logo", clientDetails.logoFile)
        }
        if (clientDetails.faviconFile) {
          await uploadAsset("favicon", clientDetails.faviconFile)
        }
        if (clientDetails.logoFile || clientDetails.faviconFile) {
          await refreshClients()
        }
        setNewClientId(id)
        setCurrentStep(3)
        setShowBanner(true)
        setSubmitting(false)
      } else if (currentStep === 3) {
        // Step 3 → 4: optionally create the unit, then advance to Users.
        // Empty unit form just advances (admin can add units later from
        // Unit Management).
        if (unitDetails.unitName.trim() && newClientId) {
          await addUnit({
            unitName: unitDetails.unitName,
            clientId: newClientId,
            clientName: clientDetails.clientName,
            contactPersonName: unitDetails.contactPersonName,
            contactPersonSurname: unitDetails.contactPersonSurname,
            email: unitDetails.emailAddress,
            province: unitDetails.province,
          })
          await refreshClients()
        }
        setCurrentStep(4)
        setSubmitting(false)
      } else if (currentStep === 4) {
        // Step 4 → finish: optionally create the user, then exit to list.
        // Empty form just exits. A populated-but-incomplete form blocks
        // (we can't half-create a user).
        if (isUserFormPopulated) {
          if (!isUserFormValid) {
            setSubmitting(false)
            return
          }
          const firstUnitId = userDetails.unitIds[0]
          const firstUnit = allUnits.find((u) => u.id === firstUnitId)
          const { id: newUserId, pin: newPin } = await addUser({
            firstNames: userDetails.firstNames,
            surname: userDetails.surname,
            email: userDetails.emailAddress,
            contactNumber: userDetails.contactNumber,
            role: userDetails.role,
            unitIds: userDetails.unitIds,
            clientId: firstUnit?.clientId ?? newClientId,
          })
          try {
            sessionStorage.setItem("carefirst_new_user_pin", newPin)
          } catch {
            // SSR / private mode — ignore
          }
          // Avatar upload (best-effort, same pattern as logo/favicon).
          if (userDetails.avatarFile && newUserId) {
            try {
              const fd = new FormData()
              fd.append("file", userDetails.avatarFile)
              const uploadRes = await fetch(`/api/users/${newUserId}/avatar`, {
                method: "POST",
                body: fd,
              })
              if (!uploadRes.ok) {
                const { error } = await uploadRes.json().catch(() => ({}))
                alert(
                  `User created, but avatar upload failed: ${error ?? uploadRes.statusText}. You can upload it from Manage User.`
                )
              }
            } catch (uploadErr) {
              console.warn("Avatar upload failed:", uploadErr)
            }
          }
          // Route to /user-management?added=<name> — that page reads the
          // sessionStorage PIN we just stashed and shows it once in a
          // success banner. Without this redirect target the auto-generated
          // PIN is silently dropped and the admin has no way to see it
          // (their only recovery is to trigger Reset PIN).
          const addedName = `${userDetails.firstNames} ${userDetails.surname}`.trim()
          const params = new URLSearchParams({ added: addedName })
          router.push(`/user-management?${params.toString()}`)
          return
        }
        router.push("/client-management")
      }
    } catch (err) {
      // Surface the failure so the admin doesn't sit on the same screen
      // wondering whether retrying will create a duplicate. We tag the
      // step so the banner copy can disambiguate (client vs unit vs user).
      console.error("Wizard step failed:", err)
      const stepLabel =
        currentStep === 2
          ? "client"
          : currentStep === 3
            ? "unit"
            : currentStep === 4
              ? "user"
              : "step"
      setStepError(
        err instanceof Error
          ? `Failed to save ${stepLabel}: ${err.message}`
          : `Failed to save ${stepLabel}. Please try again.`
      )
      setSubmitting(false)
    }
  }

  function handleSkip() {
    router.push("/client-management")
  }

  function handleTopBack() {
    // Step 2 is pre-create — rewind to step 1.
    // Step 4 → step 3 — adding a unit is non-destructive, and an admin
    //   on step 4 with no available units is otherwise stuck (Submit
    //   blocked, no escape but Skip).
    // Step 3 is post-create — going back from here can't undo the
    //   create, so we send to the client list. The unit is the only
    //   thing not yet saved on step 3, and the admin can always add
    //   more units later from Unit Management.
    // Step 1 — same as cancel.
    if (currentStep === 2) {
      setCurrentStep(1)
    } else if (currentStep === 4) {
      setCurrentStep(3)
      setStepError("")
    } else {
      router.push("/client-management")
    }
  }

  // Step 4's Next button is enabled when (a) the form is empty (skip-through)
  // OR (b) the form is fully valid. A populated-but-invalid form disables
  // Next so the admin sees their pending validation errors.
  const isNextEnabled =
    currentStep === 1
      ? isStep1Complete
      : currentStep === 4
        ? !isUserFormPopulated || isUserFormValid
        : true

  return (
    <div
      data-testid="add-new-client-page"
      className="flex flex-1 flex-col gap-4"
    >
      {/* Top bar */}
      <div className="flex items-center justify-between rounded-xl bg-white px-6 py-4">
        <Button
          data-testid="top-back-button"
          variant="outline"
          size="sm"
          onClick={handleTopBack}
          className="rounded-lg border-black px-6 py-2 gap-3"
        >
          <ArrowLeft className="size-4" />
          Back
        </Button>
      </div>

      {/* Success banner */}
      {showBanner && currentStep === 3 && (
        <SuccessBanner
          clientName={clientDetails.clientName}
          onDismiss={() => setShowBanner(false)}
        />
      )}

      {/* Step-error banner — shown when addClient / addUnit / addUser
          throws. Replaces the silent console-error that previously left
          the admin guessing whether their data was saved. */}
      {stepError && (
        <div
          data-testid="step-error-banner"
          className="flex items-start justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-6 py-4"
        >
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-gray-900">
              Save failed
            </span>
            <span className="text-sm text-gray-700">{stepError}</span>
          </div>
          <button
            type="button"
            onClick={() => setStepError("")}
            className="shrink-0 rounded-full p-0.5 text-gray-400 hover:text-gray-600"
            aria-label="Dismiss"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Content area */}
      <div className="flex flex-1 flex-col items-center justify-center gap-8 py-8">
        {/* Step indicators */}
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2">
          <div
            data-testid="step-indicator-1"
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${
              currentStep === 1
                ? "bg-[var(--client-primary-10)] text-[var(--client-primary)]"
                : currentStep > 1
                  ? "bg-green-100 text-green-500"
                  : "text-gray-400"
            }`}
          >
            {currentStep > 1 ? (
              <CheckCircle className="size-4" />
            ) : (
              <FileText className="size-4" />
            )}
            Client Details
          </div>
          <div
            data-testid="step-indicator-2"
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${
              currentStep === 2
                ? "bg-[var(--client-primary-10)] text-[var(--client-primary)]"
                : currentStep > 2
                  ? "bg-green-100 text-green-500"
                  : "text-gray-400"
            }`}
          >
            {currentStep > 2 ? (
              <CheckCircle className="size-4" />
            ) : (
              <FileText className="size-4" />
            )}
            Branding
          </div>
          <div
            data-testid="step-indicator-3"
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${
              currentStep === 3
                ? "bg-[var(--client-primary-10)] text-[var(--client-primary)]"
                : currentStep > 3
                  ? "bg-green-100 text-green-500"
                  : "text-gray-400"
            }`}
          >
            {currentStep > 3 ? (
              <CheckCircle className="size-4" />
            ) : (
              <FileText className="size-4" />
            )}
            Unit Details
          </div>
          <div
            data-testid="step-indicator-4"
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${
              currentStep === 4
                ? "bg-[var(--client-primary-10)] text-[var(--client-primary)]"
                : "text-gray-400"
            }`}
          >
            <FileText className="size-4" />
            Users
          </div>
        </div>

        {/* Step content */}
        {currentStep === 1 && (
          <StepClientDetails
            data={clientDetails}
            onChange={setClientDetails}
          />
        )}

        {currentStep === 2 && (
          <StepBranding
            data={clientDetails}
            onChange={setClientDetails}
          />
        )}

        {currentStep === 3 && (
          <StepUnitDetails
            clientName={clientDetails.clientName}
            data={unitDetails}
            onChange={setUnitDetails}
          />
        )}

        {currentStep === 4 && (
          <StepUserDetails
            clientName={clientDetails.clientName}
            clientUnits={clientUnitsForUser}
            data={userDetails}
            onChange={setUserDetails}
            emailError={userEmailError}
            contactError={userContactError}
            onCheckEmail={checkUserEmail}
            onCheckContact={checkUserContact}
          />
        )}

        {/* Next button */}
        <div className="flex w-full max-w-md flex-col items-center gap-3">
          <Button
            data-testid="next-button"
            onClick={handleNext}
            disabled={!isNextEnabled || submitting}
            className={`h-11 w-full rounded-xl ${
              isNextEnabled && !submitting
                ? "bg-gray-900 text-white hover:bg-gray-800"
                : "bg-gray-300 text-gray-600"
            }`}
          >
            {submitting ? (
              <>
                {currentStep === 4
                  ? isUserFormPopulated
                    ? "Adding User..."
                    : "Finishing..."
                  : "Saving..."}
                <svg className="ml-2 size-4 animate-spin" viewBox="0 0 40 40" fill="none">
                  <circle cx="20" cy="20" r="15" stroke="#6b7280" strokeWidth="5" strokeLinecap="round" />
                  <circle cx="20" cy="20" r="15" stroke="white" strokeWidth="5" strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset="70" />
                </svg>
              </>
            ) : (
              <>
                {currentStep === TOTAL_STEPS
                  ? isUserFormPopulated
                    ? "Add User"
                    : "Submit"
                  : "Next"}
                <ArrowRight className="ml-1 size-4" />
              </>
            )}
          </Button>

          {/* Skip link — visible on the optional post-create steps (3 and 4).
              The client and its branding are already saved by this point;
              skipping just leaves the client without a unit / user. */}
          {(currentStep === 3 || currentStep === 4) && (
            <button
              type="button"
              data-testid="skip-button"
              onClick={handleSkip}
              className="text-sm font-semibold text-gray-900 hover:underline"
            >
              Skip this step for now
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
