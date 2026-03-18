"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight, FileText, X, CheckCircle, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useClientStore } from "@/lib/client-store"

// ---------------------------------------------------------------------------
// Floating Input Component
// ---------------------------------------------------------------------------

function FloatingInput({
  id,
  label,
  value,
  onChange,
  onClear,
  type = "text",
  readOnly = false,
  "data-testid": dataTestId,
  className = "",
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  onClear: () => void
  type?: string
  readOnly?: boolean
  "data-testid"?: string
  className?: string
}) {
  const hasValue = value.length > 0

  return (
    <div className={`relative ${className}`}>
      <input
        id={id}
        data-testid={dataTestId}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        placeholder=" "
        className={`peer h-14 w-full rounded-lg border border-gray-300 bg-white px-4 py-4 text-sm text-gray-900 outline-none transition-colors focus:border-gray-900 focus:bg-white active:bg-white autofill:bg-white ${
          readOnly ? "cursor-default bg-gray-50" : ""
        }`}
      />
      <label
        htmlFor={id}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 bg-white px-1 text-sm text-gray-400 transition-all peer-focus:top-0 peer-focus:-translate-y-1/2 peer-focus:text-xs peer-focus:text-gray-500 peer-[:not(:placeholder-shown)]:top-0 peer-[:not(:placeholder-shown)]:-translate-y-1/2 peer-[:not(:placeholder-shown)]:text-xs peer-[:not(:placeholder-shown)]:text-gray-500"
      >
        {label}
      </label>
      {hasValue && !readOnly && (
        <button
          type="button"
          onClick={onClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-gray-400 hover:text-gray-600"
          aria-label={`Clear ${label}`}
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Floating Select Component
// ---------------------------------------------------------------------------

function FloatingSelect({
  id,
  label,
  value,
  onChange,
  options,
  "data-testid": dataTestId,
  className = "",
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  "data-testid"?: string
  className?: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const selectedLabel = options.find((o) => o.value === value)?.label ?? ""
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside)
    }
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isOpen])

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        id={id}
        type="button"
        data-testid={dataTestId}
        onClick={() => setIsOpen(!isOpen)}
        className={`flex h-14 w-full items-center rounded-lg border bg-white px-4 text-left text-sm outline-none transition-colors ${
          isOpen ? "border-gray-900" : "border-gray-300"
        }`}
      >
        <span className={`${value ? "text-gray-900" : "text-transparent"}`}>
          {selectedLabel || label}
        </span>
      </button>
      <label
        className={`pointer-events-none absolute left-3 bg-white px-1 text-sm transition-all ${
          value || isOpen
            ? "top-0 -translate-y-1/2 text-xs text-gray-500"
            : "top-1/2 -translate-y-1/2 text-gray-400"
        }`}
      >
        {label}
      </label>
      <ChevronDown
        className={`pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-gray-400 transition-transform ${
          isOpen ? "rotate-180" : ""
        }`}
      />

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute left-0 bottom-full z-10 mb-1 max-h-96 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="mx-2 my-2 flex max-h-80 flex-col gap-1 overflow-y-auto">
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                data-testid={`option-${opt.value}`}
                onClick={() => {
                  onChange(opt.value)
                  setIsOpen(false)
                }}
                className={`w-full rounded-lg px-5 py-4 text-left text-base text-gray-900 transition-colors hover:bg-[#3ea3db]/15 ${
                  opt.value === value ? "bg-[#3ea3db]/15 font-medium" : ""
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

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
}

const TOTAL_STEPS = 2

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

        <div className="flex w-full gap-4">
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

        <div className="flex w-full gap-4">
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
  const { addClient, updateClientUnit } = useClientStore()
  const [currentStep, setCurrentStep] = useState(1)
  const [showBanner, setShowBanner] = useState(false)
  const [newClientId, setNewClientId] = useState("")

  const [clientDetails, setClientDetails] = useState<ClientDetails>({
    clientName: "",
    contactPersonName: "",
    contactPersonSurname: "",
    emailAddress: "",
    contactNumber: "",
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

  function handleNext() {
    if (currentStep === 1 && isStep1Complete) {
      const id = addClient({
        clientName: clientDetails.clientName,
        units: "-",
        email: clientDetails.emailAddress,
        number: clientDetails.contactNumber,
      })
      setNewClientId(id)
      setCurrentStep(2)
      setShowBanner(true)
    } else if (currentStep === 2) {
      if (unitDetails.unitName.trim() && newClientId) {
        updateClientUnit(newClientId, unitDetails.unitName)
      }
      router.push("/client-management")
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
                : "text-green-600"
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
            disabled={!isNextEnabled}
            className={`h-11 w-full rounded-xl ${
              isNextEnabled
                ? "bg-gray-900 text-white hover:bg-gray-800"
                : "bg-gray-300 text-gray-600"
            }`}
          >
            {currentStep === TOTAL_STEPS ? "Submit" : "Next"}
            <ArrowRight className="ml-1 size-4" />
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
