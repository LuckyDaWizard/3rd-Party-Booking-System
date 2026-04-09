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
import { PIN_LENGTH } from "@/lib/constants"

function FloatingInput({
  id,
  label,
  value,
  onChange,
  onClear,
  onBlur,
  type = "text",
  error,
  className = "",
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  onClear: () => void
  onBlur?: () => void
  type?: string
  error?: string
  className?: string
}) {
  const hasValue = value.length > 0
  const hasError = !!error

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <div className="relative">
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder=" "
          className={`peer h-14 w-full rounded-lg border bg-white px-4 py-4 text-sm text-gray-900 outline-none transition-colors focus:bg-white ${
            hasError
              ? "border-[#FF3A69] focus:border-[#FF3A69]"
              : "border-gray-300 focus:border-gray-900"
          }`}
        />
        <label
          htmlFor={id}
          className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 bg-white px-1 text-sm transition-all peer-focus:top-0 peer-focus:-translate-y-1/2 peer-focus:text-xs peer-[:not(:placeholder-shown)]:top-0 peer-[:not(:placeholder-shown)]:-translate-y-1/2 peer-[:not(:placeholder-shown)]:text-xs ${
            hasError
              ? "text-[#FF3A69] peer-focus:text-[#FF3A69] peer-[:not(:placeholder-shown)]:text-[#FF3A69]"
              : "text-gray-400 peer-focus:text-gray-500 peer-[:not(:placeholder-shown)]:text-gray-500"
          }`}
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
      {hasError && (
        <p className="text-xs text-[#FF3A69]">{error}</p>
      )}
    </div>
  )
}

type SearchTab = "id" | "passport" | "dob"

function validateSaIdNumber(id: string): { valid: boolean; error?: string } {
  if (!/^\d+$/.test(id)) return { valid: false, error: "ID number must contain only digits" }
  if (id.length !== 13) return { valid: false, error: "ID number must be exactly 13 digits" }
  const mm = parseInt(id.slice(2, 4), 10)
  const dd = parseInt(id.slice(4, 6), 10)
  if (mm < 1 || mm > 12) return { valid: false, error: "Invalid month in ID number" }
  if (dd < 1 || dd > 31) return { valid: false, error: "Invalid day in ID number" }
  const citizenship = parseInt(id[10], 10)
  if (citizenship !== 0 && citizenship !== 1) return { valid: false, error: "Invalid citizenship digit" }
  let sum = 0
  for (let i = 0; i < 12; i++) {
    let digit = parseInt(id[i], 10)
    if (i % 2 === 1) { digit *= 2; if (digit > 9) digit -= 9 }
    sum += digit
  }
  const checkDigit = (10 - (sum % 10)) % 10
  if (checkDigit !== parseInt(id[12], 10)) return { valid: false, error: "Invalid ID number (check digit failed)" }
  return { valid: true }
}

export default function CreateBookingPage() {
  const router = useRouter()
  const { createBooking } = useBookingStore()
  const { activeUnitId } = useAuth()
  const [activeTab, setActiveTab] = useState<SearchTab>("id")

  // Form fields
  const [idNumber, setIdNumber] = useState("")
  const [idError, setIdError] = useState("")
  const [passportNumber, setPassportNumber] = useState("")
  const [firstName, setFirstName] = useState("")
  const [surname, setSurname] = useState("")
  const [dob, setDob] = useState("")

  // Verification code
  const [verificationCode, setVerificationCode] = useState("")
  const [verificationError, setVerificationError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const isCodeComplete = verificationCode.length === PIN_LENGTH

  const isFormValid = (() => {
    if (!isCodeComplete) return false
    switch (activeTab) {
      case "id":
        return idNumber.trim().length > 0 && !idError
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
        <h1 className="text-center text-2xl font-extrabold text-gray-900 sm:text-3xl">Search Patient Details</h1>
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
              onChange={(v) => {
                const cleaned = v.replace(/\D/g, "").slice(0, 13)
                setIdNumber(cleaned)
                if (idError) setIdError("")
              }}
              onClear={() => { setIdNumber(""); setIdError("") }}
              onBlur={() => {
                if (!idNumber) return
                const result = validateSaIdNumber(idNumber)
                if (!result.valid) setIdError(result.error ?? "Invalid ID number")
                else setIdError("")
              }}
              error={idError}
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
                onChange={(v) => setFirstName(v.replace(/[^a-zA-Z\s-]/g, ""))}
                onClear={() => setFirstName("")}
              />
              <FloatingInput
                id="surname"
                label="Surname"
                value={surname}
                onChange={(v) => setSurname(v.replace(/[^a-zA-Z\s-]/g, ""))}
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
            maxLength={PIN_LENGTH}
            value={verificationCode}
            onChange={setVerificationCode}
          >
            <InputOTPGroup className="gap-2 sm:gap-6">
              {Array.from({ length: PIN_LENGTH }, (_, i) => (
                <InputOTPSlot
                  key={i}
                  index={i}
                  className="!size-10 !rounded-lg !border border-input !bg-white text-lg font-semibold sm:!size-12"
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

              // Two-person sign-off: ask the server to verify the PIN belongs
              // to a unit_manager assigned to activeUnitId, or any system_admin.
              // Direct supabase lookup is forbidden under Phase 5 RLS — only
              // the service role can read other users' PINs.
              const verifyRes = await fetch("/api/verify/manager-pin", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ pin: verificationCode, unitId: activeUnitId }),
              })
              const verifyData = (await verifyRes.json().catch(() => ({}))) as {
                valid?: boolean
              }
              if (!verifyRes.ok || !verifyData.valid) {
                setVerificationError("Invalid verification code")
                setSubmitting(false)
                return
              }

              // Search for existing patient
              let existingPatient: Record<string, unknown> | null = null
              if (activeTab === "id" || activeTab === "passport") {
                const searchId = activeTab === "id" ? idNumber : passportNumber
                const { data: existing } = await supabase
                  .from("bookings")
                  .select("*")
                  .eq("id_number", searchId)
                  .order("created_at", { ascending: false })
                  .limit(1)

                if (existing && existing.length > 0) {
                  existingPatient = existing[0]
                }
              } else if (activeTab === "dob") {
                const { data: existing } = await supabase
                  .from("bookings")
                  .select("*")
                  .ilike("first_names", firstName.trim())
                  .ilike("surname", surname.trim())
                  .eq("date_of_birth", dob)
                  .order("created_at", { ascending: false })

                if (existing && existing.length > 1) {
                  // Multiple matches — redirect to selection page
                  const matchIds = existing.map((r) => r.id).join(",")
                  const selParams = new URLSearchParams()
                  selParams.set("matchIds", matchIds)
                  selParams.set("searchType", "dob")
                  selParams.set("firstName", firstName)
                  selParams.set("surname", surname)
                  selParams.set("dob", dob)
                  setSubmitting(false)
                  router.push(`/create-booking/select-patient?${selParams.toString()}`)
                  return
                } else if (existing && existing.length === 1) {
                  existingPatient = existing[0]
                }
              }

              // Build booking data from search fields + existing patient data
              const bookingData: Record<string, string | null | boolean> = {
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

              // Pre-fill from existing patient if found
              if (existingPatient) {
                bookingData.firstNames = (existingPatient.first_names as string) ?? bookingData.firstNames ?? null
                bookingData.surname = (existingPatient.surname as string) ?? bookingData.surname ?? null
                bookingData.idType = (existingPatient.id_type as string) ?? bookingData.idType ?? null
                bookingData.idNumber = (existingPatient.id_number as string) ?? bookingData.idNumber ?? null
                bookingData.title = (existingPatient.title as string) ?? null
                bookingData.nationality = (existingPatient.nationality as string) ?? null
                bookingData.gender = (existingPatient.gender as string) ?? null
                bookingData.dateOfBirth = (existingPatient.date_of_birth as string) ?? bookingData.dateOfBirth ?? null
                bookingData.address = (existingPatient.address as string) ?? null
                bookingData.suburb = (existingPatient.suburb as string) ?? null
                bookingData.city = (existingPatient.city as string) ?? null
                bookingData.province = (existingPatient.province as string) ?? null
                bookingData.country = (existingPatient.country as string) ?? null
                bookingData.postalCode = (existingPatient.postal_code as string) ?? null
                bookingData.countryCode = (existingPatient.country_code as string) ?? null
                bookingData.contactNumber = (existingPatient.contact_number as string) ?? null
                bookingData.emailAddress = (existingPatient.email_address as string) ?? null
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
