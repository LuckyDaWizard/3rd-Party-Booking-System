"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog"

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PatientDetails {
  patientName: string
  patientIdNumber: string
  patientType: string
  contactNumber: string
  emailAddress: string
}

interface Provider {
  id: string
  name: string
  specialty: string
}

type PaymentLinkMethod = "email" | "contact"

interface PaymentLinkData {
  method: PaymentLinkMethod
  emailAddress: string
  contactNumber: string
}

const TOTAL_STEPS = 4

const PROVIDERS: Provider[] = [
  { id: "dr-smith", name: "Dr. Smith", specialty: "General Practitioner" },
  { id: "dr-jones", name: "Dr. Jones", specialty: "Specialist" },
  { id: "dr-williams", name: "Dr. Williams", specialty: "Dentist" },
]

/* ------------------------------------------------------------------ */
/*  Step 1 -- Patient Details                                          */
/* ------------------------------------------------------------------ */

function StepPatientDetails({
  data,
  onChange,
}: {
  data: PatientDetails
  onChange: (updated: PatientDetails) => void
}) {
  function handleChange(field: keyof PatientDetails, value: string) {
    onChange({ ...data, [field]: value })
  }

  return (
    <div
      data-testid="step-patient-details"
      className="flex w-full max-w-md flex-col items-center gap-6"
    >
      <div className="flex flex-col items-center gap-1 text-center">
        <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
          Step 1 of {TOTAL_STEPS}
        </p>
        <h1
          data-testid="step-heading"
          className="text-3xl font-bold text-gray-900"
        >
          Patient Details
        </h1>
        <p className="text-base text-gray-500">
          Please provide the patient&apos;s information
        </p>
      </div>

      <div className="flex w-full flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="patient-name"
            className="text-sm font-medium text-gray-700"
          >
            Patient Name
          </label>
          <Input
            id="patient-name"
            data-testid="input-patient-name"
            placeholder="Enter patient name"
            value={data.patientName}
            onChange={(e) => handleChange("patientName", e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="patient-id"
            className="text-sm font-medium text-gray-700"
          >
            Patient ID Number
          </label>
          <Input
            id="patient-id"
            data-testid="input-patient-id"
            placeholder="Enter patient ID number"
            value={data.patientIdNumber}
            onChange={(e) => handleChange("patientIdNumber", e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="patient-type"
            className="text-sm font-medium text-gray-700"
          >
            Patient Type
          </label>
          <Input
            id="patient-type"
            data-testid="input-patient-type"
            placeholder="Cash Reservation"
            value={data.patientType}
            onChange={(e) => handleChange("patientType", e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="contact-number"
            className="text-sm font-medium text-gray-700"
          >
            Contact Number
          </label>
          <Input
            id="contact-number"
            data-testid="input-contact-number"
            type="tel"
            placeholder="Enter contact number"
            value={data.contactNumber}
            onChange={(e) => handleChange("contactNumber", e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="email-address"
            className="text-sm font-medium text-gray-700"
          >
            Email Address
          </label>
          <Input
            id="email-address"
            data-testid="input-email-address"
            type="email"
            placeholder="Enter email address"
            value={data.emailAddress}
            onChange={(e) => handleChange("emailAddress", e.target.value)}
          />
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Step 2 -- Select Provider                                          */
/* ------------------------------------------------------------------ */

function StepSelectProvider({
  selectedProviderId,
  onSelect,
}: {
  selectedProviderId: string
  onSelect: (id: string) => void
}) {
  return (
    <div
      data-testid="step-select-provider"
      className="flex w-full max-w-md flex-col items-center gap-6"
    >
      <div className="flex flex-col items-center gap-1 text-center">
        <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
          Step 2 of {TOTAL_STEPS}
        </p>
        <h1
          data-testid="step-heading"
          className="text-3xl font-bold text-gray-900"
        >
          Select Provider
        </h1>
        <p className="text-base text-gray-500">
          Please select a healthcare provider
        </p>
      </div>

      <div
        className="flex w-full flex-col gap-3"
        role="radiogroup"
        aria-label="Select a healthcare provider"
      >
        {PROVIDERS.map((provider) => {
          const isSelected = provider.id === selectedProviderId
          return (
            <button
              key={provider.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              data-testid={`provider-option-${provider.id}`}
              onClick={() => onSelect(provider.id)}
              className={`flex w-full items-center gap-3 rounded-xl border-2 px-4 py-4 text-left transition-colors ${
                isSelected
                  ? "border-[#3ea3db] bg-[#3ea3db]/10"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <span
                className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${
                  isSelected ? "border-[#3ea3db]" : "border-gray-300"
                }`}
              >
                {isSelected && (
                  <span className="size-2.5 rounded-full bg-[#3ea3db]" />
                )}
              </span>
              <span className="text-base font-medium text-gray-900">
                {provider.name} - {provider.specialty}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Step 3 -- Creating Booking (loading)                               */
/* ------------------------------------------------------------------ */

function StepCreatingBooking({
  onComplete,
}: {
  onComplete: () => void
}) {
  useEffect(() => {
    const timer = setTimeout(onComplete, 2000)
    return () => clearTimeout(timer)
  }, [onComplete])

  return (
    <div
      data-testid="step-creating-booking"
      className="flex w-full max-w-md flex-col items-center gap-6"
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-base text-gray-400">Please be patient</p>
        <h1
          data-testid="step-heading"
          className="text-3xl font-bold text-gray-900"
        >
          Creating Booking
        </h1>
      </div>

      <svg className="size-10 animate-spin" viewBox="0 0 40 40" fill="none" data-testid="booking-spinner">
        <circle cx="20" cy="20" r="15" stroke="#d1d5db" strokeWidth="7" strokeLinecap="round" />
        <circle cx="20" cy="20" r="15" stroke="#3ea3db" strokeWidth="7" strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset="70" />
      </svg>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Step 4 -- Send Payment Link                                        */
/* ------------------------------------------------------------------ */

function StepSendPaymentLink({
  data,
  onChange,
}: {
  data: PaymentLinkData
  onChange: (updated: PaymentLinkData) => void
}) {
  return (
    <div
      data-testid="step-send-payment-link"
      className="flex w-full max-w-md flex-col items-center gap-6"
    >
      <div className="flex flex-col items-center gap-1 text-center">
        <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
          Step 4 of {TOTAL_STEPS}
        </p>
        <h1
          data-testid="step-heading"
          className="text-3xl font-bold text-gray-900"
        >
          Send Payment Link
        </h1>
        <p className="text-base text-gray-500">
          Please enter the details to share the payment link
        </p>
      </div>

      {/* Tab toggle */}
      <div
        data-testid="payment-method-tabs"
        className="flex w-full rounded-lg bg-gray-100 p-1"
        role="tablist"
        aria-label="Payment link delivery method"
      >
        <button
          type="button"
          role="tab"
          aria-selected={data.method === "email"}
          data-testid="tab-email"
          onClick={() => onChange({ ...data, method: "email" })}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            data.method === "email"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Email address
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={data.method === "contact"}
          data-testid="tab-contact"
          onClick={() => onChange({ ...data, method: "contact" })}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            data.method === "contact"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Contact number
        </button>
      </div>

      {/* Conditional input */}
      <div className="w-full">
        {data.method === "email" ? (
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="payment-email"
              className="text-sm font-medium text-gray-700"
            >
              Email Address
            </label>
            <Input
              id="payment-email"
              data-testid="input-payment-email"
              type="email"
              placeholder="Enter email address"
              value={data.emailAddress}
              onChange={(e) =>
                onChange({ ...data, emailAddress: e.target.value })
              }
            />
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="payment-contact"
              className="text-sm font-medium text-gray-700"
            >
              Contact Number
            </label>
            <Input
              id="payment-contact"
              data-testid="input-payment-contact"
              type="tel"
              placeholder="Enter contact number"
              value={data.contactNumber}
              onChange={(e) =>
                onChange({ ...data, contactNumber: e.target.value })
              }
            />
          </div>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Page Component                                                */
/* ------------------------------------------------------------------ */

export default function CreateBookingPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)
  const [isDiscardOpen, setIsDiscardOpen] = useState(false)

  // Step 1 state
  const [patientDetails, setPatientDetails] = useState<PatientDetails>({
    patientName: "",
    patientIdNumber: "",
    patientType: "",
    contactNumber: "",
    emailAddress: "",
  })

  // Step 2 state
  const [selectedProviderId, setSelectedProviderId] = useState("")

  // Step 4 state
  const [paymentLinkData, setPaymentLinkData] = useState<PaymentLinkData>({
    method: "email",
    emailAddress: "",
    contactNumber: "",
  })

  const handleLoadingComplete = useCallback(() => {
    setCurrentStep(4)
  }, [])

  function handleNext() {
    if (currentStep < TOTAL_STEPS) {
      setCurrentStep((prev) => prev + 1)
    } else {
      // Final step -- submit / complete
      // TODO: integrate with Supabase to persist booking and send payment link
      router.push("/home")
    }
  }

  function handleBack() {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1)
    } else {
      router.push("/home")
    }
  }

  function handleTopBack() {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1)
    } else {
      router.push("/home")
    }
  }

  function handleDiscard() {
    setIsDiscardOpen(true)
  }

  function handleConfirmDiscard() {
    setIsDiscardOpen(false)
    router.push("/home")
  }

  const isLoadingStep = currentStep === 3

  return (
    <div
      data-testid="create-booking-page"
      className="flex flex-1 flex-col"
    >
      {/* Top bar */}
      <div
        data-testid="create-booking-top-bar"
        className="flex items-center justify-between rounded-xl bg-white px-6 py-4"
      >
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

        <Button
          data-testid="discard-flow-button"
          size="sm"
          onClick={handleDiscard}
          className="rounded-lg bg-red-500 px-6 py-2 text-white hover:bg-red-600"
        >
          Discard Flow
        </Button>
      </div>

      {/* Content area */}
      <div className="flex flex-1 items-center justify-center py-8">
        {currentStep === 1 && (
          <StepPatientDetails
            data={patientDetails}
            onChange={setPatientDetails}
          />
        )}

        {currentStep === 2 && (
          <StepSelectProvider
            selectedProviderId={selectedProviderId}
            onSelect={setSelectedProviderId}
          />
        )}

        {currentStep === 3 && (
          <StepCreatingBooking onComplete={handleLoadingComplete} />
        )}

        {currentStep === 4 && (
          <StepSendPaymentLink
            data={paymentLinkData}
            onChange={setPaymentLinkData}
          />
        )}
      </div>

      {/* Bottom navigation -- hidden during loading step */}
      {!isLoadingStep && (
        <div
          data-testid="bottom-navigation"
          className="flex items-center justify-between pt-4"
        >
          <Button
            data-testid="bottom-back-button"
            variant="outline"
            onClick={handleBack}
            className="h-11 rounded-xl px-6"
          >
            Back
          </Button>

          <Button
            data-testid="bottom-next-button"
            onClick={handleNext}
            className="h-11 rounded-xl bg-black px-6 text-white hover:bg-gray-800"
          >
            {currentStep === TOTAL_STEPS ? "Send Link" : "Next"}
            <ArrowRight data-icon="inline-end" className="ml-1 size-4" />
          </Button>
        </div>
      )}

      {/* Discard confirmation dialog */}
      <Dialog open={isDiscardOpen} onOpenChange={setIsDiscardOpen}>
        <DialogContent
          data-testid="discard-dialog"
          showCloseButton={false}
        >
          <DialogHeader>
            <DialogTitle data-testid="discard-dialog-title">
              Discard Booking?
            </DialogTitle>
            <DialogDescription data-testid="discard-dialog-description">
              Are you sure you want to discard this booking? All entered
              information will be lost.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 pt-2">
            <Button
              data-testid="confirm-discard-button"
              onClick={handleConfirmDiscard}
              className="h-10 w-full rounded-xl bg-[#FF3A69] text-white hover:bg-[#FF3A69]/90"
            >
              Yes, Discard
            </Button>
            <DialogClose
              data-testid="cancel-discard-button"
              render={
                <button
                  type="button"
                  className="w-full text-center text-sm font-medium text-gray-500 hover:text-gray-700"
                />
              }
            >
              Cancel
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
