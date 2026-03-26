"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { X } from "lucide-react"
import { useBookingStore } from "@/lib/booking-store"
import { useAuth } from "@/lib/auth-store"
import { supabase } from "@/lib/supabase"
import { DatePickerField } from "@/components/ui/date-picker-dialog"

function FloatingInput({
  id,
  label,
  value,
  onChange,
  onClear,
  type = "text",
  className = "",
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  onClear: () => void
  type?: string
  className?: string
}) {
  const hasValue = value.length > 0

  return (
    <div className={`relative ${className}`}>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder=" "
        className="peer h-14 w-full rounded-lg border border-gray-300 bg-white px-4 py-4 text-sm text-gray-900 outline-none transition-colors focus:border-gray-900 focus:bg-white"
      />
      <label
        htmlFor={id}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 bg-white px-1 text-sm text-gray-400 transition-all peer-focus:top-0 peer-focus:-translate-y-1/2 peer-focus:text-xs peer-focus:text-gray-500 peer-[:not(:placeholder-shown)]:top-0 peer-[:not(:placeholder-shown)]:-translate-y-1/2 peer-[:not(:placeholder-shown)]:text-xs peer-[:not(:placeholder-shown)]:text-gray-500"
      >
        {label}
      </label>
      {hasValue && (
        <button
          type="button"
          onClick={onClear}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  )
}

type SearchTab = "id" | "passport" | "dob"

export default function CreateBookingPage() {
  const router = useRouter()
  const { createBooking } = useBookingStore()
  const { activeUnitId } = useAuth()
  const [activeTab, setActiveTab] = useState<SearchTab>("id")

  // Form fields
  const [idNumber, setIdNumber] = useState("")
  const [passportNumber, setPassportNumber] = useState("")
  const [firstName, setFirstName] = useState("")
  const [surname, setSurname] = useState("")
  const [dob, setDob] = useState("")

  // Verification code
  const [verificationCode, setVerificationCode] = useState("")
  const [verificationError, setVerificationError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const isCodeComplete = verificationCode.length === 5

  const isFormValid = (() => {
    if (!isCodeComplete) return false
    switch (activeTab) {
      case "id":
        return idNumber.trim().length > 0
      case "passport":
        return passportNumber.trim().length > 0
      case "dob":
        return firstName.trim().length > 0 && surname.trim().length > 0 && dob.trim().length > 0
      default:
        return false
    }
  })()

  const tabs: { key: SearchTab; label: string }[] = [
    { key: "id", label: "National ID Number" },
    { key: "passport", label: "Passport Number" },
    { key: "dob", label: "Date of Birth" },
  ]

  return (
    <div className="flex flex-col gap-6">
      {/* Top bar */}
      <div className="flex items-center rounded-xl bg-white px-6 py-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push("/home")}
          className="gap-3 rounded-lg border-black px-6 py-2"
        >
          <ArrowLeft className="size-4" />
          Back
        </Button>
      </div>

      {/* Main content */}
      <div className="flex flex-col items-center py-8">
        <h1 className="text-3xl font-extrabold text-gray-900">Search Patient Details</h1>
        <p className="mt-2 text-gray-500">Please provide the patient&apos;s identification details</p>

        {/* Tab toggle */}
        <div className="mt-8 flex rounded-full border border-gray-200 bg-white p-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-full px-6 py-2.5 text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? "bg-[#f4f4f4] text-gray-900"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Form fields */}
        <div className="mt-8 flex w-full max-w-md flex-col gap-4">
          {activeTab === "id" && (
            <FloatingInput
              id="idNumber"
              label="National ID Number"
              value={idNumber}
              onChange={setIdNumber}
              onClear={() => setIdNumber("")}
            />
          )}

          {activeTab === "passport" && (
            <FloatingInput
              id="passportNumber"
              label="Passport Number"
              value={passportNumber}
              onChange={setPassportNumber}
              onClear={() => setPassportNumber("")}
            />
          )}

          {activeTab === "dob" && (
            <>
              <FloatingInput
                id="firstName"
                label="First Names"
                value={firstName}
                onChange={setFirstName}
                onClear={() => setFirstName("")}
              />
              <FloatingInput
                id="surname"
                label="Surname"
                value={surname}
                onChange={setSurname}
                onClear={() => setSurname("")}
              />
              <DatePickerField
                id="dob"
                label="Date of Birth"
                value={dob}
                onChange={setDob}
                onClear={() => setDob("")}
              />
            </>
          )}
        </div>

        {/* Verification code */}
        <div className="mt-8 flex w-full max-w-sm flex-col items-center gap-4">
          <p className="text-base text-gray-700">Enter nurse verification code to start journey</p>
          <InputOTP
            maxLength={5}
            value={verificationCode}
            onChange={setVerificationCode}
          >
            <InputOTPGroup className="gap-6">
              {Array.from({ length: 5 }, (_, i) => (
                <InputOTPSlot
                  key={i}
                  index={i}
                  className="!size-12 !rounded-lg !border border-input !bg-white text-lg font-semibold"
                />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>

        {/* Next button */}
        <div className="mt-8 w-full max-w-xs">
          {verificationError && (
            <p className="text-center text-sm font-medium text-[#FF3A69]">
              {verificationError}
            </p>
          )}
          <Button
            onClick={async () => {
              setVerificationError("")
              setSubmitting(true)

              // Validate PIN against unit managers for this unit or system admins
              const { data: validUsers } = await supabase
                .from("users")
                .select("id, role")
                .eq("pin", verificationCode)
                .eq("status", "Active")
                .in("role", ["unit_manager", "system_admin"])
                .limit(1)

              if (!validUsers || validUsers.length === 0) {
                setVerificationError("Invalid verification code")
                setSubmitting(false)
                return
              }

              // If unit_manager, check they belong to the current unit
              const matchedUser = validUsers[0]
              if (matchedUser.role === "unit_manager" && activeUnitId) {
                const { data: userUnits } = await supabase
                  .from("user_units")
                  .select("unit_id")
                  .eq("user_id", matchedUser.id)
                  .eq("unit_id", activeUnitId)
                  .limit(1)

                if (!userUnits || userUnits.length === 0) {
                  setVerificationError("This manager is not assigned to your unit")
                  setSubmitting(false)
                  return
                }
              }

              // Build booking data from search fields
              const bookingData: Record<string, string | null> = {
                searchType: activeTab,
                unitId: activeUnitId ?? null,
              }
              if (activeTab === "id") {
                bookingData.idType = "national_id"
                bookingData.idNumber = idNumber
              } else if (activeTab === "passport") {
                bookingData.idType = "passport"
                bookingData.idNumber = passportNumber
              } else if (activeTab === "dob") {
                bookingData.firstNames = firstName
                bookingData.surname = surname
                bookingData.dateOfBirth = dob
              }

              // Create booking in Supabase and get the ID
              const bookingId = await createBooking(bookingData)

              const params = new URLSearchParams()
              params.set("bookingId", bookingId)
              params.set("searchType", activeTab)
              if (activeTab === "id") {
                params.set("idNumber", idNumber)
              } else if (activeTab === "passport") {
                params.set("passportNumber", passportNumber)
              } else if (activeTab === "dob") {
                params.set("firstName", firstName)
                params.set("surname", surname)
                params.set("dob", dob)
              }
              setSubmitting(false)
              router.push(`/create-booking/patient-details?${params.toString()}`)
            }}
            className={`h-12 w-full gap-2 rounded-xl text-base font-semibold transition-all ${
              isFormValid && !submitting
                ? "bg-gray-900 text-white hover:bg-gray-800"
                : "bg-gray-300 text-gray-500 cursor-not-allowed"
            }`}
            disabled={!isFormValid || submitting}
          >
            Next
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
