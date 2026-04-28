"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight, FileText, X, CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FloatingInput } from "@/components/ui/floating-input"
import { FloatingSelect } from "@/components/ui/floating-select"
import { useClientStore } from "@/lib/client-store"
import { useUnitStore } from "@/lib/unit-store"

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
        })
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
            collectPaymentAtUnit: false,
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
