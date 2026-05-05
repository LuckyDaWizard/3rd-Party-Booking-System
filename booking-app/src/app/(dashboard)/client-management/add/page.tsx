"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight, FileText, X, CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FloatingInput } from "@/components/ui/floating-input"
import { FloatingSelect } from "@/components/ui/floating-select"
import { useClientStore } from "@/lib/client-store"
import { useUnitStore } from "@/lib/unit-store"
import { validateImageMinDimensions } from "@/lib/image-dimensions"

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
}

const TOTAL_STEPS = 2
const LOGO_MAX_BYTES = 2 * 1024 * 1024
const LOGO_ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml"
const FAVICON_ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon,image/vnd.microsoft.icon"
// Minimum pixel dimensions — guard against tiny uploads that would scale up
// poorly. Vector + ICO formats skip the check (see lib/image-dimensions.ts).
const LOGO_MIN_WIDTH = 200
const LOGO_MIN_HEIGHT = 60
const FAVICON_MIN_WIDTH = 64
const FAVICON_MIN_HEIGHT = 64

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

        {/* Branding (optional) — logo + favicon. Files are uploaded after the
            client is created (we need an id first); previews use object URLs. */}
        <div className="mt-2 flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Branding (optional)</h3>
            <p className="text-xs text-gray-500">
              Logo for headers / printouts; favicon for tight icon spaces.
            </p>
          </div>

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
// Main Page
// ---------------------------------------------------------------------------

export default function AddNewClientPage() {
  const router = useRouter()
  const { addClient, refreshClients } = useClientStore()
  const { addUnit } = useUnitStore()
  const [currentStep, setCurrentStep] = useState(1)
  const [showBanner, setShowBanner] = useState(false)
  const [newClientId, setNewClientId] = useState("")
  const [submitting, setSubmitting] = useState(false)

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
  })

  const [unitDetails, setUnitDetails] = useState<UnitDetails>({
    unitName: "",
    contactPersonName: "",
    contactPersonSurname: "",
    emailAddress: "",
    province: "",
  })

  const isStep1Complete =
    clientDetails.clientName.trim() !== "" &&
    clientDetails.contactPersonName.trim() !== "" &&
    clientDetails.contactPersonSurname.trim() !== "" &&
    clientDetails.emailAddress.trim() !== "" &&
    clientDetails.contactNumber.trim() !== ""

  async function handleNext() {
    setSubmitting(true)
    try {
      if (currentStep === 1 && isStep1Complete) {
        const id = await addClient({
          clientName: clientDetails.clientName,
          contactPersonName: clientDetails.contactPersonName,
          contactPersonSurname: clientDetails.contactPersonSurname,
          units: "-",
          email: clientDetails.emailAddress,
          number: clientDetails.contactNumber,
          logoUrl: null,
          faviconUrl: null,
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
        setCurrentStep(2)
        setShowBanner(true)
        setSubmitting(false)
      } else if (currentStep === 2) {
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
        router.push("/client-management")
      }
    } catch (err) {
      console.error("Failed to save client:", err)
      setSubmitting(false)
    }
  }

  function handleSkip() {
    router.push("/client-management")
  }

  function handleTopBack() {
    if (currentStep > 1) {
      setCurrentStep(1)
      setShowBanner(false)
    } else {
      router.push("/client-management")
    }
  }

  const isNextEnabled = currentStep === 1 ? isStep1Complete : true

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
      {showBanner && currentStep === 2 && (
        <SuccessBanner
          clientName={clientDetails.clientName}
          onDismiss={() => setShowBanner(false)}
        />
      )}

      {/* Content area */}
      <div className="flex flex-1 flex-col items-center justify-center gap-8 py-8">
        {/* Step indicators */}
        <div className="flex items-center gap-8">
          <div
            data-testid="step-indicator-1"
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${
              currentStep === 1
                ? "bg-[#3ea3db]/10 text-[#3ea3db]"
                : "bg-green-100 text-green-500"
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
                ? "bg-[#3ea3db]/10 text-[#3ea3db]"
                : "text-gray-400"
            }`}
          >
            <FileText className="size-4" />
            Unit Details
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
          <StepUnitDetails
            clientName={clientDetails.clientName}
            data={unitDetails}
            onChange={setUnitDetails}
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
                {currentStep === TOTAL_STEPS ? "Adding Client..." : "Saving..."}
                <svg className="ml-2 size-4 animate-spin" viewBox="0 0 40 40" fill="none">
                  <circle cx="20" cy="20" r="15" stroke="#6b7280" strokeWidth="5" strokeLinecap="round" />
                  <circle cx="20" cy="20" r="15" stroke="white" strokeWidth="5" strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset="70" />
                </svg>
              </>
            ) : (
              <>
                {currentStep === TOTAL_STEPS ? "Submit" : "Next"}
                <ArrowRight className="ml-1 size-4" />
              </>
            )}
          </Button>

          {/* Skip link — only on step 2 */}
          {currentStep === 2 && (
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
