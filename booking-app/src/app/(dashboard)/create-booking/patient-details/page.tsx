"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, ArrowRight, FileText, X, ChevronDown, CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { useBookingStore } from "@/lib/booking-store"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth-store"
import { DatePickerField } from "@/components/ui/date-picker-dialog"

// ---------------------------------------------------------------------------
// Floating Input Component
// ---------------------------------------------------------------------------

function FloatingInput({
  id,
  label,
  value,
  onChange,
  onClear,
  onBlur,
  type = "text",
  readOnly = false,
  error,
  "data-testid": dataTestId,
  className = "",
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  onClear: () => void
  onBlur?: () => void
  type?: string
  readOnly?: boolean
  error?: string
  "data-testid"?: string
  className?: string
}) {
  const hasValue = value.length > 0
  const hasError = !!error

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <div className="relative">
        <input
          id={id}
          data-testid={dataTestId}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          readOnly={readOnly}
          placeholder=" "
          className={`peer h-14 w-full rounded-lg border bg-white px-4 py-4 text-sm text-gray-900 outline-none transition-colors focus:bg-white active:bg-white autofill:bg-white ${
            hasError
              ? "border-[#FF3A69] focus:border-[#FF3A69]"
              : readOnly
                ? "border-gray-300 cursor-default bg-gray-50"
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
      {hasError && (
        <p className="text-xs text-[#FF3A69]">{error}</p>
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
// Constants
// ---------------------------------------------------------------------------

const TOTAL_STEPS = 4

const STEP_LABELS = [
  "Basic Info",
  "Address",
  "Contact Details",
  "Payment Type",
]

const ID_TYPE_OPTIONS = [
  { value: "national_id", label: "National ID" },
  { value: "passport", label: "Passport" },
]

const TITLE_OPTIONS = [
  { value: "Mr", label: "Mr" },
  { value: "Mrs", label: "Mrs" },
  { value: "Ms", label: "Ms" },
  { value: "Miss", label: "Miss" },
  { value: "Dr", label: "Dr" },
  { value: "Prof", label: "Prof" },
  { value: "Rev", label: "Rev" },
]

const GENDER_OPTIONS = [
  { value: "Male", label: "Male" },
  { value: "Female", label: "Female" },
]

const NATIONALITY_OPTIONS = [
  { value: "south_african", label: "South African" },
  { value: "zimbabwean", label: "Zimbabwean" },
  { value: "mozambican", label: "Mozambican" },
  { value: "nigerian", label: "Nigerian" },
  { value: "kenyan", label: "Kenyan" },
  { value: "ghanaian", label: "Ghanaian" },
  { value: "tanzanian", label: "Tanzanian" },
  { value: "malawian", label: "Malawian" },
  { value: "zambian", label: "Zambian" },
  { value: "botswanan", label: "Botswanan" },
  { value: "namibian", label: "Namibian" },
  { value: "lesotho", label: "Lesotho" },
  { value: "eswatini", label: "Eswatini" },
  { value: "other", label: "Other" },
]

const PROVINCES = [
  "Eastern Cape",
  "Free State",
  "Gauteng",
  "KwaZulu-Natal",
  "Limpopo",
  "Mpumalanga",
  "North West",
  "Northern Cape",
  "Western Cape",
]

const COUNTRY_CODES = [
  { code: "ZA", dial: "+27" },
  { code: "BW", dial: "+267" },
  { code: "MZ", dial: "+258" },
  { code: "NA", dial: "+264" },
  { code: "ZW", dial: "+263" },
  { code: "SZ", dial: "+268" },
  { code: "LS", dial: "+266" },
  { code: "NG", dial: "+234" },
  { code: "KE", dial: "+254" },
  { code: "GH", dial: "+233" },
  { code: "GB", dial: "+44" },
  { code: "US", dial: "+1" },
]

function CountryCodeSelect({
  value,
  onChange,
}: {
  value: string
  onChange: (code: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = COUNTRY_CODES.find((c) => c.code === value) ?? COUNTRY_CODES[0]

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  return (
    <div ref={ref} className="relative w-24">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3"
      >
        <span className="text-sm font-medium text-gray-900">{selected.code}</span>
        <ChevronDown className={`size-3 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>
      <label className="pointer-events-none absolute left-3 top-0 -translate-y-1/2 bg-white px-1 text-xs text-gray-500">
        Country
      </label>
      {isOpen && (
        <div className="absolute bottom-full left-0 z-50 mb-1 max-h-52 w-32 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="overflow-y-auto max-h-52 mr-1">
            {COUNTRY_CODES.map((country) => (
              <button
                key={country.code}
                type="button"
                onClick={() => {
                  onChange(country.code)
                  setIsOpen(false)
                }}
                className={`flex w-full items-center gap-2 px-3 py-2.5 text-sm transition-colors hover:bg-[#3ea3db]/15 ${
                  value === country.code ? "bg-[#3ea3db]/15 font-medium" : "text-gray-700"
                }`}
              >
                <span className="font-medium">{country.code}</span>
                <span className="text-gray-500">{country.dial}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// SA ID Number Validation & Extraction
// ---------------------------------------------------------------------------

function validateSaIdNumber(id: string): { valid: boolean; error?: string } {
  if (!/^\d+$/.test(id)) return { valid: false, error: "ID number must contain only digits" }
  if (id.length !== 13) return { valid: false, error: "ID number must be exactly 13 digits" }

  // Validate date of birth (positions 1-6)
  const yy = parseInt(id.slice(0, 2), 10)
  const mm = parseInt(id.slice(2, 4), 10)
  const dd = parseInt(id.slice(4, 6), 10)
  if (mm < 1 || mm > 12) return { valid: false, error: "Invalid month in ID number" }
  if (dd < 1 || dd > 31) return { valid: false, error: "Invalid day in ID number" }

  // Validate citizenship digit (position 11)
  const citizenship = parseInt(id[10], 10)
  if (citizenship !== 0 && citizenship !== 1) return { valid: false, error: "Invalid citizenship digit" }

  // Luhn check digit validation
  let sum = 0
  for (let i = 0; i < 12; i++) {
    let digit = parseInt(id[i], 10)
    if (i % 2 === 1) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
  }
  const checkDigit = (10 - (sum % 10)) % 10
  if (checkDigit !== parseInt(id[12], 10)) return { valid: false, error: "Invalid ID number (check digit failed)" }

  return { valid: true }
}

function extractFromSaId(id: string): {
  dateOfBirth: string
  gender: string
  nationality: string
} | null {
  if (id.length !== 13 || !/^\d+$/.test(id)) return null

  const yy = parseInt(id.slice(0, 2), 10)
  const mm = id.slice(2, 4)
  const dd = id.slice(4, 6)
  const year = yy >= 0 && yy <= 30 ? 2000 + yy : 1900 + yy
  const dateOfBirth = `${year}-${mm}-${dd}`

  const genderSeq = parseInt(id.slice(6, 10), 10)
  const gender = genderSeq >= 5000 ? "Male" : "Female"

  const citizenDigit = parseInt(id[10], 10)
  const nationality = citizenDigit === 0 ? "south_african" : "other"

  return { dateOfBirth, gender, nationality }
}

// ---------------------------------------------------------------------------
// SA Phone Number Validation
// ---------------------------------------------------------------------------

function validateSaPhone(phone: string): { valid: boolean; error?: string } {
  if (!phone || phone === "+27") return { valid: false }
  const cleaned = phone.replace(/[\s-]/g, "")
  // +27 format: +27XXXXXXXXX (12 chars)
  if (cleaned.startsWith("+27")) {
    if (cleaned.length !== 12) return { valid: false, error: "Contact number must be 12 digits with +27" }
    if (!/^\+27[0-9]{9}$/.test(cleaned)) return { valid: false, error: "Invalid South African contact number" }
    return { valid: true }
  }
  // 0 format: 0XXXXXXXXX (10 chars)
  if (cleaned.startsWith("0")) {
    if (cleaned.length !== 10) return { valid: false, error: "Contact number must be 10 digits" }
    if (!/^0[0-9]{9}$/.test(cleaned)) return { valid: false, error: "Invalid South African contact number" }
    return { valid: true }
  }
  return { valid: false, error: "Contact number must start with 0 or +27" }
}

function formatSaPhone(value: string): string {
  // Only allow digits and leading +
  return value.replace(/[^0-9+]/g, "").replace(/(?!^)\+/g, "")
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BasicInfoData {
  firstNames: string
  surname: string
  idType: string
  idNumber: string
  title: string
  nationality: string
  gender: string
  dateOfBirth: string
}

// ---------------------------------------------------------------------------
// Step 1 - Basic Info
// ---------------------------------------------------------------------------

function StepBasicInfo({
  data,
  onChange,
}: {
  data: BasicInfoData
  onChange: (updated: BasicInfoData) => void
}) {
  const [idError, setIdError] = useState("")

  function handleChange(field: keyof BasicInfoData, value: string) {
    onChange({ ...data, [field]: value })
  }

  function handleClear(field: keyof BasicInfoData) {
    onChange({ ...data, [field]: "" })
  }

  function handleIdNumberChange(value: string) {
    // Only allow digits for national ID
    const cleaned = data.idType === "national_id" ? value.replace(/\D/g, "").slice(0, 13) : value
    onChange({ ...data, idNumber: cleaned })
    if (idError) setIdError("")
  }

  function handleIdBlur() {
    if (data.idType !== "national_id" || !data.idNumber) {
      setIdError("")
      return
    }

    const validation = validateSaIdNumber(data.idNumber)
    if (!validation.valid) {
      setIdError(validation.error ?? "Invalid ID number")
      return
    }

    setIdError("")

    // Auto-populate fields from ID
    const extracted = extractFromSaId(data.idNumber)
    if (extracted) {
      onChange({
        ...data,
        dateOfBirth: extracted.dateOfBirth,
        gender: extracted.gender,
        nationality: extracted.nationality,
      })
    }
  }

  // Determine the ID field label based on selected type
  const idFieldLabel =
    data.idType === "passport" ? "Passport No" : "National ID No"

  return (
    <div
      data-testid="step-basic-info"
      className="flex w-full max-w-4xl flex-col gap-6"
    >
      {/* Step label */}
      <div className="flex flex-col gap-1">
        <span
          data-testid="step-label"
          className="text-xs font-semibold uppercase tracking-wider text-gray-400"
        >
          Step 1 of {TOTAL_STEPS}
        </span>
        <h1
          data-testid="step-heading"
          className="text-2xl font-bold text-gray-900 sm:text-3xl"
        >
          Patient Details
        </h1>
        <p className="text-base text-gray-500">
          Please provide the patient&apos;s details
        </p>
      </div>

      {/* Form fields - 2-column layout */}
      <div className="flex w-full flex-col gap-4">
        {/* Row 1: First Names + Surname */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <FloatingInput
            id="firstNames"
            data-testid="input-first-names"
            label="First Names"
            value={data.firstNames}
            onChange={(v) => handleChange("firstNames", v.replace(/[^a-zA-Z\s-]/g, ""))}
            onClear={() => handleClear("firstNames")}
          />
          <FloatingInput
            id="surname"
            data-testid="input-surname"
            label="Surname"
            value={data.surname}
            onChange={(v) => handleChange("surname", v.replace(/[^a-zA-Z\s-]/g, ""))}
            onClear={() => handleClear("surname")}
          />
        </div>

        {/* Row 2: ID Type (dropdown) + ID Number (pre-filled) */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <FloatingSelect
            id="idType"
            data-testid="select-id-type"
            label="ID Type"
            value={data.idType}
            onChange={(v) => handleChange("idType", v)}
            options={ID_TYPE_OPTIONS}
          />
          <FloatingInput
            id="idNumber"
            data-testid="input-id-number"
            label={idFieldLabel}
            value={data.idNumber}
            onChange={handleIdNumberChange}
            onClear={() => { handleClear("idNumber"); setIdError("") }}
            onBlur={handleIdBlur}
            error={idError}
          />
        </div>

        {/* Row 3: Title + Nationality */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <FloatingSelect
            id="title"
            data-testid="select-title"
            label="Title"
            value={data.title}
            onChange={(v) => handleChange("title", v)}
            options={TITLE_OPTIONS}
          />
          <FloatingSelect
            id="nationality"
            data-testid="select-nationality"
            label="Nationality"
            value={data.nationality}
            onChange={(v) => handleChange("nationality", v)}
            options={NATIONALITY_OPTIONS}
          />
        </div>

        {/* Row 4: Gender + Date of Birth */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <FloatingSelect
            id="gender"
            data-testid="select-gender"
            label="Gender"
            value={data.gender}
            onChange={(v) => handleChange("gender", v)}
            options={GENDER_OPTIONS}
          />
          <DatePickerField
            id="dateOfBirth"
            data-testid="input-date-of-birth"
            label="Date of Birth"
            value={data.dateOfBirth}
            onChange={(v) => handleChange("dateOfBirth", v)}
            onClear={() => handleClear("dateOfBirth")}
          />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function PatientDetailsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { updateBooking, discardBooking, setActiveBookingId, getBooking } = useBookingStore()
  // Read booking ID and search params
  const bookingId = searchParams.get("bookingId") ?? ""
  const stepParam = searchParams.get("step")
  const [currentStep, setCurrentStep] = useState(stepParam ? parseInt(stepParam, 10) : 1)
  const searchType = searchParams.get("searchType") ?? "id"
  const idNumber = searchParams.get("idNumber") ?? ""
  const passportNumber = searchParams.get("passportNumber") ?? ""
  const firstNameParam = searchParams.get("firstName") ?? ""
  const surnameParam = searchParams.get("surname") ?? ""
  const dobParam = searchParams.get("dob") ?? ""

  // Load existing booking data if resuming
  const existingBooking = bookingId ? getBooking(bookingId) : undefined

  // Set active booking ID on mount
  useEffect(() => {
    if (bookingId) setActiveBookingId(bookingId)
  }, [bookingId, setActiveBookingId])

  // Determine initial ID type and number from search params or existing booking
  const initialIdType = existingBooking?.idType ?? (searchType === "passport" ? "passport" : "national_id")
  const initialIdNumber = existingBooking?.idNumber ?? (searchType === "passport" ? passportNumber : idNumber)

  const [basicInfo, setBasicInfo] = useState<BasicInfoData>({
    firstNames: existingBooking?.firstNames ?? firstNameParam,
    surname: existingBooking?.surname ?? surnameParam,
    idType: initialIdType,
    idNumber: initialIdNumber,
    title: existingBooking?.title ?? "",
    nationality: existingBooking?.nationality ?? "",
    gender: existingBooking?.gender ?? "",
    dateOfBirth: existingBooking?.dateOfBirth ?? dobParam,
  })

  // Validation: all fields required for step 1
  // Address state
  const [addressInfo, setAddressInfo] = useState({
    address: existingBooking?.address ?? "",
    suburb: existingBooking?.suburb ?? "",
    city: existingBooking?.city ?? "",
    province: existingBooking?.province ?? "",
    country: existingBooking?.country ?? "",
    postalCode: existingBooking?.postalCode ?? "",
  })

  const isStep1Complete =
    basicInfo.firstNames.trim() !== "" &&
    basicInfo.surname.trim() !== "" &&
    basicInfo.idType.trim() !== "" &&
    basicInfo.idNumber.trim() !== "" &&
    basicInfo.title.trim() !== "" &&
    basicInfo.nationality.trim() !== "" &&
    basicInfo.gender.trim() !== "" &&
    basicInfo.dateOfBirth.trim() !== ""

  const isStep2Complete =
    addressInfo.address.trim() !== "" &&
    addressInfo.suburb.trim() !== "" &&
    addressInfo.city.trim() !== "" &&
    addressInfo.province.trim() !== "" &&
    addressInfo.country.trim() !== "" &&
    addressInfo.postalCode.trim() !== ""

  // Contact details state
  const [contactInfo, setContactInfo] = useState({
    countryCode: existingBooking?.countryCode ?? "ZA",
    contactNumber: existingBooking?.contactNumber ?? "+27",
    emailAddress: existingBooking?.emailAddress ?? "",
    scriptToAnotherEmail: existingBooking?.scriptToAnotherEmail ?? false,
    additionalEmail: existingBooking?.additionalEmail ?? "",
  })

  // Verification dialog
  const [showVerification, setShowVerification] = useState(false)
  const [bookingVerificationCode, setBookingVerificationCode] = useState("")
  const [showSuccessBanner, setShowSuccessBanner] = useState(false)
  const [selectedPaymentType, setSelectedPaymentType] = useState("")
  const [verificationError, setVerificationError] = useState("")
  const [verifying, setVerifying] = useState(false)
  const [emailError, setEmailError] = useState("")
  const [contactError, setContactError] = useState("")
  const { activeUnitId } = useAuth()

  async function checkEmailExists(email: string) {
    if (!email.trim()) { setEmailError(""); return }
    const { data } = await supabase
      .from("bookings")
      .select("id")
      .eq("email_address", email.trim())
      .neq("id", bookingId || "")
      .limit(1)
    if (data && data.length > 0) {
      setEmailError("This email is already associated with another patient")
    } else {
      setEmailError("")
    }
  }

  async function checkContactExists(contact: string) {
    if (!contact.trim() || contact.trim() === "+27") { setContactError(""); return }

    // Validate SA format first
    const validation = validateSaPhone(contact)
    if (!validation.valid) {
      setContactError(validation.error ?? "Invalid contact number")
      return
    }

    // Then check for duplicates
    const { data } = await supabase
      .from("bookings")
      .select("id")
      .eq("contact_number", contact.trim())
      .neq("id", bookingId || "")
      .limit(1)
    if (data && data.length > 0) {
      setContactError("This contact number is already associated with another patient")
    } else {
      setContactError("")
    }
  }

  const isStep3Complete =
    contactInfo.contactNumber.trim() !== "" &&
    contactInfo.contactNumber.trim() !== "+27" &&
    validateSaPhone(contactInfo.contactNumber).valid &&
    contactInfo.emailAddress.trim() !== "" &&
    !emailError &&
    !contactError &&
    (!contactInfo.scriptToAnotherEmail || contactInfo.additionalEmail.trim() !== "")

  async function handleNext() {
    if (currentStep === 1 && isStep1Complete) {
      // Save basic info to DB
      if (bookingId) {
        await updateBooking(bookingId, {
          firstNames: basicInfo.firstNames,
          surname: basicInfo.surname,
          idType: basicInfo.idType,
          idNumber: basicInfo.idNumber,
          title: basicInfo.title,
          nationality: basicInfo.nationality,
          gender: basicInfo.gender,
          dateOfBirth: basicInfo.dateOfBirth,
          currentStep: "patient-details",
        })
      }
      setCurrentStep(2)
    } else if (currentStep === 2 && isStep2Complete) {
      // Save address info to DB
      if (bookingId) {
        await updateBooking(bookingId, {
          address: addressInfo.address,
          suburb: addressInfo.suburb,
          city: addressInfo.city,
          province: addressInfo.province,
          country: addressInfo.country,
          postalCode: addressInfo.postalCode,
        })
      }
      setCurrentStep(3)
    } else if (currentStep === 3 && isStep3Complete) {
      // Save contact info to DB
      if (bookingId) {
        await updateBooking(bookingId, {
          countryCode: contactInfo.countryCode,
          contactNumber: contactInfo.contactNumber,
          emailAddress: contactInfo.emailAddress,
          scriptToAnotherEmail: contactInfo.scriptToAnotherEmail,
          additionalEmail: contactInfo.additionalEmail,
        })
      }
      setCurrentStep(4)
    } else if (currentStep === 4) {
      setShowVerification(true)
    } else if (currentStep === 5 && selectedPaymentType) {
      // Save payment type to DB
      if (bookingId) {
        await updateBooking(bookingId, {
          paymentType: selectedPaymentType,
          currentStep: "payment",
        })
      }
      if (selectedPaymentType === "device") {
        router.push(`/create-booking/payment?bookingId=${bookingId}&type=device`)
      } else if (selectedPaymentType === "link") {
        router.push(`/create-booking/payment?bookingId=${bookingId}&type=link`)
      }
    }
  }

  function handleBack() {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    } else {
      router.push("/create-booking")
    }
  }

  async function handleDiscardFlow() {
    // Save all current data before discarding
    if (bookingId) {
      await updateBooking(bookingId, {
        firstNames: basicInfo.firstNames,
        surname: basicInfo.surname,
        idType: basicInfo.idType,
        idNumber: basicInfo.idNumber,
        title: basicInfo.title,
        nationality: basicInfo.nationality,
        gender: basicInfo.gender,
        dateOfBirth: basicInfo.dateOfBirth,
        address: addressInfo.address,
        suburb: addressInfo.suburb,
        city: addressInfo.city,
        province: addressInfo.province,
        country: addressInfo.country,
        postalCode: addressInfo.postalCode,
        countryCode: contactInfo.countryCode,
        contactNumber: contactInfo.contactNumber,
        emailAddress: contactInfo.emailAddress,
        scriptToAnotherEmail: contactInfo.scriptToAnotherEmail,
        additionalEmail: contactInfo.additionalEmail,
        paymentType: selectedPaymentType || null,
      })
      await discardBooking(bookingId)
    }
    router.push("/home")
  }

  const isNextEnabled =
    currentStep === 1 ? isStep1Complete :
    currentStep === 2 ? isStep2Complete :
    currentStep === 3 ? isStep3Complete :
    currentStep === 4 ? true :
    currentStep === 5 ? selectedPaymentType !== "" :
    false

  return (
    <div
      data-testid="patient-details-page"
      className="flex flex-1 flex-col gap-4"
    >
      {/* Top bar */}
      <div className="flex items-center justify-between rounded-xl bg-white px-4 py-3 sm:px-6 sm:py-4">
        <Button
          data-testid="top-back-button"
          variant="outline"
          size="sm"
          onClick={handleBack}
          className="rounded-lg border-black px-6 py-2 gap-3"
        >
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <Button
          data-testid="discard-flow-button"
          size="sm"
          onClick={handleDiscardFlow}
          className="rounded-lg border-0 px-6 py-2 text-white hover:opacity-90"
          style={{ backgroundColor: "#FF3A69" }}
        >
          Discard Flow
        </Button>
      </div>

      {/* Content area */}
      <div className="flex flex-1 flex-col items-center gap-8 py-8">
        {/* Success banner */}
        {showSuccessBanner && (
          <div className="flex w-full max-w-4xl items-start justify-between rounded-xl bg-green-100 px-6 py-5">
            <div className="flex flex-col gap-1">
              <span className="text-base font-bold text-gray-900">
                Patient Profile Created Successfully
              </span>
              <p className="text-sm text-gray-500">
                The patient&apos;s profile has been created successfully
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowSuccessBanner(false)}
              className="shrink-0 rounded-full p-1 text-gray-400 hover:text-gray-600"
            >
              <X className="size-4" />
            </button>
          </div>
        )}

        {/* Step indicators */}
        <nav
          data-testid="step-indicators"
          className="flex w-full max-w-4xl flex-wrap items-center justify-center gap-2 sm:gap-4"
          aria-label="Booking steps"
        >
          {STEP_LABELS.map((label, index) => {
            const stepNumber = index + 1
            // Step 5 (payment) maps to step indicator 4
            const displayStep = currentStep > 4 ? 4 : currentStep
            const isActive = stepNumber === displayStep
            const isCompleted = stepNumber < displayStep || (currentStep === 5 && stepNumber < 4)

            return (
              <div
                key={label}
                data-testid={`step-indicator-${stepNumber}`}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-[#3ea3db]/10 text-[#3ea3db]"
                    : isCompleted
                    ? "bg-green-100 text-green-500"
                    : "text-gray-400"
                }`}
              >
                {isCompleted ? (
                  <CheckCircle className="size-4 text-green-500" />
                ) : (
                  <FileText className="size-4" />
                )}
                {label}
              </div>
            )
          })}
        </nav>

        {/* Step content */}
        {currentStep === 1 && (
          <StepBasicInfo data={basicInfo} onChange={setBasicInfo} />
        )}

        {/* Step 2 - Address Details */}
        {currentStep === 2 && (
          <div
            data-testid="step-address"
            className="flex w-full max-w-4xl flex-col gap-6"
          >
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Step 2 of {TOTAL_STEPS}
              </span>
              <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
                Address Details
              </h1>
              <p className="text-base text-gray-500">
                Please provide the patient&apos;s physical address below
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <FloatingInput
                id="address"
                label="Address"
                value={addressInfo.address}
                onChange={(v) => setAddressInfo({ ...addressInfo, address: v })}
                onClear={() => setAddressInfo({ ...addressInfo, address: "" })}
              />
              <FloatingInput
                id="suburb"
                label="Suburb"
                value={addressInfo.suburb}
                onChange={(v) => setAddressInfo({ ...addressInfo, suburb: v })}
                onClear={() => setAddressInfo({ ...addressInfo, suburb: "" })}
              />
              <FloatingInput
                id="city"
                label="City"
                value={addressInfo.city}
                onChange={(v) => setAddressInfo({ ...addressInfo, city: v })}
                onClear={() => setAddressInfo({ ...addressInfo, city: "" })}
              />
              <FloatingSelect
                id="province"
                label="Province"
                value={addressInfo.province}
                onChange={(v) => setAddressInfo({ ...addressInfo, province: v })}
                options={PROVINCES.map((p) => ({ value: p, label: p }))}
              />
              <FloatingInput
                id="country"
                label="Country"
                value={addressInfo.country}
                onChange={(v) => setAddressInfo({ ...addressInfo, country: v })}
                onClear={() => setAddressInfo({ ...addressInfo, country: "" })}
              />
              <FloatingInput
                id="postalCode"
                label="Postal Code"
                value={addressInfo.postalCode}
                onChange={(v) => setAddressInfo({ ...addressInfo, postalCode: v })}
                onClear={() => setAddressInfo({ ...addressInfo, postalCode: "" })}
              />
            </div>
          </div>
        )}

        {/* Step 3 - Contact Details */}
        {currentStep === 3 && (
          <div
            data-testid="step-contact-details"
            className="flex w-full max-w-4xl flex-col gap-6"
          >
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Step 3 of {TOTAL_STEPS}
              </span>
              <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
                Contact Details
              </h1>
              <p className="text-base text-gray-500">
                Please provide the patient&apos;s contact details
              </p>
            </div>

            {/* Warning banner */}
            <div className="flex flex-col items-start gap-3 rounded-xl bg-pink-100 px-4 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-6">
              <span className="flex items-center gap-2 rounded-full bg-[#FF3A69] px-4 py-1.5 text-sm font-semibold text-white">
                <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                Warning
              </span>
              <p className="text-sm font-semibold text-gray-900">
                Please ensure that the contact information is correct before proceeding to the next step
              </p>
            </div>

            {/* Contact fields — phone (code + number) on one row, email below
                on mobile; everything on one row at md: and up. */}
            <div className="flex flex-col gap-4 md:flex-row">
              {/* Phone row (country code + number always together) */}
              <div className="flex gap-4 md:flex-1">
                <CountryCodeSelect
                  value={contactInfo.countryCode}
                  onChange={(v) => {
                    const country = COUNTRY_CODES.find((c) => c.code === v)
                    const oldCountry = COUNTRY_CODES.find((c) => c.code === contactInfo.countryCode)
                    let newNumber = contactInfo.contactNumber
                    // Replace old dial code with new one
                    if (oldCountry && newNumber.startsWith(oldCountry.dial)) {
                      newNumber = (country?.dial ?? "") + newNumber.slice(oldCountry.dial.length)
                    } else if (country) {
                      newNumber = country.dial + newNumber
                    }
                    setContactInfo({ ...contactInfo, countryCode: v, contactNumber: newNumber })
                  }}
                />
                <FloatingInput
                  id="contactNumber"
                  label="Contact Number"
                  value={contactInfo.contactNumber}
                  onChange={(v) => {
                    setContactInfo({ ...contactInfo, contactNumber: formatSaPhone(v) })
                    if (contactError) setContactError("")
                  }}
                  onClear={() => { setContactInfo({ ...contactInfo, contactNumber: "" }); setContactError("") }}
                  onBlur={() => checkContactExists(contactInfo.contactNumber)}
                  error={contactError}
                  className="flex-1"
                />
              </div>

              {/* Email Address */}
              <FloatingInput
                id="emailAddress"
                label="Email Address"
                value={contactInfo.emailAddress}
                onChange={(v) => {
                  setContactInfo({ ...contactInfo, emailAddress: v })
                  if (emailError) setEmailError("")
                }}
                onClear={() => { setContactInfo({ ...contactInfo, emailAddress: "" }); setEmailError("") }}
                onBlur={() => checkEmailExists(contactInfo.emailAddress)}
                error={emailError}
                className="md:flex-1"
              />
            </div>

            {/* Script to another email */}
            <div className="flex flex-col items-start gap-3 rounded-xl bg-[#CDE5F2] px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-gray-700">
                Would you like to script this to another email address
              </p>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setContactInfo({ ...contactInfo, scriptToAnotherEmail: true })}
                  className="flex cursor-pointer items-center gap-2 text-sm text-gray-700"
                >
                  Yes
                  <span className="flex size-5 items-center justify-center rounded-full border-2 border-gray-300">
                    {contactInfo.scriptToAnotherEmail && (
                      <span className="size-3 rounded-full bg-[#3ea3db]" />
                    )}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setContactInfo({ ...contactInfo, scriptToAnotherEmail: false })}
                  className="flex cursor-pointer items-center gap-2 text-sm text-gray-700"
                >
                  No
                  <span className="flex size-5 items-center justify-center rounded-full border-2 border-gray-300">
                    {!contactInfo.scriptToAnotherEmail && (
                      <span className="size-3 rounded-full bg-[#3ea3db]" />
                    )}
                  </span>
                </button>
              </div>
            </div>

            {/* Additional email section */}
            {contactInfo.scriptToAnotherEmail && (
              <div className="flex flex-col gap-3">
                <p className="text-base text-gray-700">
                  Please provide the additional email address
                </p>
                <FloatingInput
                  id="additionalEmail"
                  label="Email Address"
                  value={contactInfo.additionalEmail}
                  onChange={(v) => setContactInfo({ ...contactInfo, additionalEmail: v })}
                  onClear={() => setContactInfo({ ...contactInfo, additionalEmail: "" })}
                  className="max-w-md"
                />
              </div>
            )}
          </div>
        )}

        {/* Step 4 - Verify Details */}
        {currentStep === 4 && (
          <div
            data-testid="step-verify-details"
            className="flex w-full max-w-4xl flex-col gap-8"
          >
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Step 4 of {TOTAL_STEPS}
              </span>
              <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
                Verify your Details
              </h1>
              <p className="text-base text-gray-500">
                Please make sure you have provided the correct details
              </p>
            </div>

            {/* Patient Details */}
            <div className="flex flex-col gap-4">
              <h2 className="text-xl font-bold text-gray-900">Patient Details</h2>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <FloatingInput
                  id="verify-firstNames"
                  label="First Names"
                  value={basicInfo.firstNames}
                  onChange={(v) => setBasicInfo({ ...basicInfo, firstNames: v.replace(/[^a-zA-Z\s-]/g, "") })}
                  onClear={() => setBasicInfo({ ...basicInfo, firstNames: "" })}
                />
                <FloatingInput
                  id="verify-surname"
                  label="Surname"
                  value={basicInfo.surname}
                  onChange={(v) => setBasicInfo({ ...basicInfo, surname: v.replace(/[^a-zA-Z\s-]/g, "") })}
                  onClear={() => setBasicInfo({ ...basicInfo, surname: "" })}
                />
                <FloatingInput
                  id="verify-idType"
                  label="ID Type"
                  value={basicInfo.idType === "passport" ? "Passport" : "National ID"}
                  onChange={() => {}}
                  onClear={() => {}}
                  readOnly
                />
                <FloatingInput
                  id="verify-idNumber"
                  label={basicInfo.idType === "passport" ? "Passport No" : "National ID No"}
                  value={basicInfo.idNumber}
                  onChange={(v) => setBasicInfo({ ...basicInfo, idNumber: v })}
                  onClear={() => setBasicInfo({ ...basicInfo, idNumber: "" })}
                />
                <FloatingSelect
                  id="verify-title"
                  label="Title"
                  value={basicInfo.title}
                  onChange={(v) => setBasicInfo({ ...basicInfo, title: v })}
                  options={TITLE_OPTIONS}
                />
                <FloatingInput
                  id="verify-nationality"
                  label="Nationality"
                  value={basicInfo.nationality}
                  onChange={(v) => setBasicInfo({ ...basicInfo, nationality: v })}
                  onClear={() => setBasicInfo({ ...basicInfo, nationality: "" })}
                />
                <FloatingSelect
                  id="verify-gender"
                  label="Gender"
                  value={basicInfo.gender}
                  onChange={(v) => setBasicInfo({ ...basicInfo, gender: v })}
                  options={GENDER_OPTIONS}
                />
                <DatePickerField
                  id="verify-dob"
                  label="Date of Birth"
                  value={basicInfo.dateOfBirth}
                  onChange={(v) => setBasicInfo({ ...basicInfo, dateOfBirth: v })}
                  onClear={() => setBasicInfo({ ...basicInfo, dateOfBirth: "" })}
                />
              </div>
            </div>

            {/* Address Details */}
            <div className="flex flex-col gap-4">
              <h2 className="text-xl font-bold text-gray-900">Address Details</h2>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <FloatingInput
                  id="verify-address"
                  label="Address"
                  value={addressInfo.address}
                  onChange={(v) => setAddressInfo({ ...addressInfo, address: v })}
                  onClear={() => setAddressInfo({ ...addressInfo, address: "" })}
                />
                <FloatingInput
                  id="verify-suburb"
                  label="Suburb"
                  value={addressInfo.suburb}
                  onChange={(v) => setAddressInfo({ ...addressInfo, suburb: v })}
                  onClear={() => setAddressInfo({ ...addressInfo, suburb: "" })}
                />
                <FloatingInput
                  id="verify-city"
                  label="City"
                  value={addressInfo.city}
                  onChange={(v) => setAddressInfo({ ...addressInfo, city: v })}
                  onClear={() => setAddressInfo({ ...addressInfo, city: "" })}
                />
                <FloatingInput
                  id="verify-province"
                  label="Province"
                  value={addressInfo.province}
                  onChange={(v) => setAddressInfo({ ...addressInfo, province: v })}
                  onClear={() => setAddressInfo({ ...addressInfo, province: "" })}
                />
                <FloatingInput
                  id="verify-country"
                  label="Country"
                  value={addressInfo.country}
                  onChange={(v) => setAddressInfo({ ...addressInfo, country: v })}
                  onClear={() => setAddressInfo({ ...addressInfo, country: "" })}
                />
                <FloatingInput
                  id="verify-postalCode"
                  label="Postal Code"
                  value={addressInfo.postalCode}
                  onChange={(v) => setAddressInfo({ ...addressInfo, postalCode: v })}
                  onClear={() => setAddressInfo({ ...addressInfo, postalCode: "" })}
                />
              </div>
            </div>

            {/* Contact Details */}
            <div className="flex flex-col gap-4">
              <h2 className="text-xl font-bold text-gray-900">Contact Details</h2>

              {/* Last Chance warning */}
              <div className="flex flex-col items-start gap-3 rounded-xl bg-pink-100 px-4 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-6">
                <span className="flex items-center gap-2 rounded-full bg-[#FF3A69] px-4 py-1.5 text-sm font-semibold text-white">
                  <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  Last Chance
                </span>
                <p className="text-sm font-semibold text-gray-900">
                  Please ensure that the contact information is correct before proceeding to the next step
                </p>
              </div>

              <div className="flex flex-col gap-4 md:flex-row">
                <div className="flex gap-4 md:flex-1">
                  <CountryCodeSelect
                    value={contactInfo.countryCode}
                    onChange={(v) => {
                      const country = COUNTRY_CODES.find((c) => c.code === v)
                      const oldCountry = COUNTRY_CODES.find((c) => c.code === contactInfo.countryCode)
                      let newNumber = contactInfo.contactNumber
                      if (oldCountry && newNumber.startsWith(oldCountry.dial)) {
                        newNumber = (country?.dial ?? "") + newNumber.slice(oldCountry.dial.length)
                      } else if (country) {
                        newNumber = country.dial + newNumber
                      }
                      setContactInfo({ ...contactInfo, countryCode: v, contactNumber: newNumber })
                    }}
                  />
                  <FloatingInput
                    id="verify-contactNumber"
                    label="Contact Number"
                    value={contactInfo.contactNumber}
                    onChange={(v) => {
                      setContactInfo({ ...contactInfo, contactNumber: formatSaPhone(v) })
                      if (contactError) setContactError("")
                    }}
                    onClear={() => { setContactInfo({ ...contactInfo, contactNumber: "" }); setContactError("") }}
                    onBlur={() => checkContactExists(contactInfo.contactNumber)}
                    error={contactError}
                    className="flex-1"
                  />
                </div>
                <FloatingInput
                  id="verify-emailAddress"
                  label="Email Address"
                  value={contactInfo.emailAddress}
                  onChange={(v) => {
                    setContactInfo({ ...contactInfo, emailAddress: v })
                    if (emailError) setEmailError("")
                  }}
                  onClear={() => { setContactInfo({ ...contactInfo, emailAddress: "" }); setEmailError("") }}
                  onBlur={() => checkEmailExists(contactInfo.emailAddress)}
                  error={emailError}
                  className="md:flex-1"
                />
              </div>

              {/* Script to another email */}
              <div className="flex flex-col items-start gap-3 rounded-xl bg-[#CDE5F2] px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-gray-700">
                  Would you like to script this to another email address
                </p>
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => setContactInfo({ ...contactInfo, scriptToAnotherEmail: true })}
                    className="flex cursor-pointer items-center gap-2 text-sm text-gray-700"
                  >
                    Yes
                    <span className="flex size-5 items-center justify-center rounded-full border-2 border-gray-300">
                      {contactInfo.scriptToAnotherEmail && (
                        <span className="size-3 rounded-full bg-[#3ea3db]" />
                      )}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setContactInfo({ ...contactInfo, scriptToAnotherEmail: false })}
                    className="flex cursor-pointer items-center gap-2 text-sm text-gray-700"
                  >
                    No
                    <span className="flex size-5 items-center justify-center rounded-full border-2 border-gray-300">
                      {!contactInfo.scriptToAnotherEmail && (
                        <span className="size-3 rounded-full bg-[#3ea3db]" />
                      )}
                    </span>
                  </button>
                </div>
              </div>

              {/* Additional email */}
              {contactInfo.scriptToAnotherEmail && (
                <div className="flex flex-col gap-3">
                  <p className="text-base text-gray-700">
                    Please provide the additional email address
                  </p>
                  <FloatingInput
                    id="verify-additionalEmail"
                    label="Email Address"
                    value={contactInfo.additionalEmail}
                    onChange={(v) => setContactInfo({ ...contactInfo, additionalEmail: v })}
                    onClear={() => setContactInfo({ ...contactInfo, additionalEmail: "" })}
                    className="max-w-md"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 5 - Payment Type */}
        {currentStep === 5 && (
          <div
            data-testid="step-payment-type"
            className="flex w-full max-w-4xl flex-col gap-6"
          >
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Step 4 of {TOTAL_STEPS}
              </span>
              <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
                Select a payment type
              </h1>
              <p className="text-base text-gray-500">
                Please select the patient&apos;s payment type
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {/* Pay on device */}
              <button
                type="button"
                onClick={() => setSelectedPaymentType("device")}
                className={`flex items-center gap-3 rounded-xl border px-6 py-5 text-left transition-colors ${
                  selectedPaymentType === "device"
                    ? "border-[#3ea3db] bg-[#CDE5F2]"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <span className={`flex size-6 items-center justify-center rounded-full border-2 ${
                  selectedPaymentType === "device" ? "border-[#3ea3db] bg-[#3ea3db]" : "border-gray-300 bg-white"
                }`}>
                  {selectedPaymentType === "device" && (
                    <span className="size-3 rounded-full bg-white" />
                  )}
                </span>
                <span className="text-sm font-medium text-gray-900">Pay on device</span>
              </button>

              {/* Send a payment link */}
              <button
                type="button"
                onClick={() => setSelectedPaymentType("link")}
                className={`flex items-center gap-3 rounded-xl border px-6 py-5 text-left transition-colors ${
                  selectedPaymentType === "link"
                    ? "border-[#3ea3db] bg-[#CDE5F2]"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <span className={`flex size-6 items-center justify-center rounded-full border-2 ${
                  selectedPaymentType === "link" ? "border-[#3ea3db] bg-[#3ea3db]" : "border-gray-300 bg-white"
                }`}>
                  {selectedPaymentType === "link" && (
                    <span className="size-3 rounded-full bg-white" />
                  )}
                </span>
                <span className="text-sm font-medium text-gray-900">Send a payment link</span>
              </button>

              {/* Medical Aid - Coming Soon */}
              <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-6 py-5">
                <span className="text-sm font-medium text-gray-400">Medical Aid</span>
                <span className="rounded-full bg-[#3ea3db] px-4 py-1.5 text-xs font-semibold text-white">
                  Coming Soon
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Bottom navigation */}
        <div className="flex w-full max-w-4xl flex-col-reverse gap-3 pt-4 sm:flex-row sm:justify-between sm:gap-4">
          <Button
            data-testid="bottom-back-button"
            variant="outline"
            onClick={handleBack}
            className="h-12 w-full rounded-xl border border-black text-base font-semibold sm:w-[38%]"
          >
            Back
          </Button>
          <Button
            data-testid="next-button"
            onClick={handleNext}
            className={`h-12 w-full gap-2 rounded-xl text-base font-semibold transition-all sm:w-[38%] ${
              isNextEnabled
                ? "bg-gray-900 text-white hover:bg-gray-800"
                : "bg-gray-300 text-gray-500 cursor-default"
            }`}
            disabled={!isNextEnabled}
          >
            Next
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>

      {/* Nurse Verification Dialog */}
      {showVerification && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex w-full max-w-md flex-col items-center gap-6 rounded-2xl bg-white p-6 sm:p-8">
            <h2 className="text-center text-xl font-bold text-gray-900">
              Enter your nurse verification
              <br />
              code to create booking
            </h2>

            <InputOTP
              maxLength={6}
              value={bookingVerificationCode}
              onChange={setBookingVerificationCode}
            >
              <InputOTPGroup className="gap-2 sm:gap-3">
                {Array.from({ length: 6 }, (_, i) => (
                  <InputOTPSlot
                    key={i}
                    index={i}
                    className="!size-10 !rounded-lg !border border-input !bg-white text-lg font-semibold sm:!size-12"
                  />
                ))}
              </InputOTPGroup>
            </InputOTP>

            {verificationError && (
              <p className="text-center text-sm font-medium text-[#FF3A69]">
                {verificationError}
              </p>
            )}

            <Button
              onClick={async () => {
                setVerificationError("")
                setVerifying(true)

                // Two-person sign-off via /api/verify/manager-pin (Phase 5
                // RLS forbids reading other users' PINs directly).
                const verifyRes = await fetch("/api/verify/manager-pin", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    pin: bookingVerificationCode,
                    unitId: activeUnitId,
                  }),
                })
                const verifyData = (await verifyRes.json().catch(() => ({}))) as {
                  valid?: boolean
                }
                if (!verifyRes.ok || !verifyData.valid) {
                  setVerificationError("Invalid verification code")
                  setVerifying(false)
                  return
                }

                setVerifying(false)
                setShowVerification(false)
                setBookingVerificationCode("")
                setVerificationError("")
                setShowSuccessBanner(true)
                setCurrentStep(5)
              }}
              disabled={bookingVerificationCode.length < 6 || verifying}
              className={`h-12 w-full gap-2 rounded-xl text-base font-semibold transition-all ${
                bookingVerificationCode.length === 6 && !verifying
                  ? "bg-gray-900 text-white hover:bg-gray-800"
                  : "bg-gray-300 text-gray-500 cursor-default"
              }`}
            >
              {verifying ? "Verifying..." : "Continue"}
              {!verifying && <ArrowRight className="size-4" />}
            </Button>

            <button
              type="button"
              onClick={() => {
                setShowVerification(false)
                setBookingVerificationCode("")
              }}
              className="text-sm font-semibold text-[#FF3A69] hover:opacity-80"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
