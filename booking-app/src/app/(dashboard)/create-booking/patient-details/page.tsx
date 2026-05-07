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
import { FloatingInput } from "@/components/ui/floating-input"
import { FloatingSelect } from "@/components/ui/floating-select"
import { PIN_LENGTH } from "@/lib/constants"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOTAL_STEPS = 4

const STEP_LABELS = [
  "Basic Info",
  "Address",
  "Contact Details",
  // Step 4 covers nurse PIN re-verification + the patient-data
  // confirmation screen. The label is "Verification" rather than
  // "Payment Type" — the actual payment branch (gateway vs self-
  // collect vs monthly-invoice) renders on step 5 and may be
  // skipped entirely for non-gateway clients, so the indicator
  // shouldn't promise a payment step that might not appear.
  "Verification",
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
                className={`flex w-full items-center gap-2 px-3 py-2.5 text-sm transition-colors hover:bg-[var(--client-primary-15)] ${
                  value === country.code ? "bg-[var(--client-primary-15)] font-medium" : "text-gray-700"
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

/**
 * Resolve a 2-digit YY into a full 4-digit year using a current-year pivot.
 * Years <= the current YY are treated as 2000s; anything higher is 1900s.
 * Self-maintaining — works past 2030 without a hardcoded cut-off.
 */
function resolveSaIdYear(yy: number): number {
  const currentYY = new Date().getFullYear() % 100
  return yy <= currentYY ? 2000 + yy : 1900 + yy
}

function validateSaIdNumber(id: string): { valid: boolean; error?: string } {
  if (!/^\d+$/.test(id)) return { valid: false, error: "ID number must contain only digits" }
  if (id.length !== 13) return { valid: false, error: "ID number must be exactly 13 digits" }

  // Parse date of birth positions (1-6).
  const yy = parseInt(id.slice(0, 2), 10)
  const mm = parseInt(id.slice(2, 4), 10)
  const dd = parseInt(id.slice(4, 6), 10)
  if (mm < 1 || mm > 12) return { valid: false, error: "Invalid month in ID number" }
  if (dd < 1 || dd > 31) return { valid: false, error: "Invalid day in ID number" }

  // Round-trip the date: catches Feb 30, Apr 31, Feb 29 in non-leap years,
  // and other non-days that pass the crude range checks above.
  const year = resolveSaIdYear(yy)
  const birth = new Date(year, mm - 1, dd)
  if (
    birth.getFullYear() !== year ||
    birth.getMonth() !== mm - 1 ||
    birth.getDate() !== dd
  ) {
    return { valid: false, error: "Invalid date of birth in ID number" }
  }

  // Reject future dates of birth.
  const now = new Date()
  if (birth > now) {
    return { valid: false, error: "Date of birth in ID number is in the future" }
  }

  // Reject absurdly old DOBs (> 120 years). Oldest recorded South African
  // was 110 at death, so 120 is a very safe upper bound.
  const maxAge = new Date(now)
  maxAge.setFullYear(now.getFullYear() - 120)
  if (birth < maxAge) {
    return { valid: false, error: "Date of birth in ID number is too far in the past" }
  }

  // Validate citizenship digit (position 11).
  const citizenship = parseInt(id[10], 10)
  if (citizenship !== 0 && citizenship !== 1) return { valid: false, error: "Invalid citizenship digit" }

  // Luhn check digit validation.
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
  const year = resolveSaIdYear(yy)
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
  consentAccepted,
  onConsentChange,
  idConflictWarning,
  onCheckIdConflict,
  identityLocked,
}: {
  data: BasicInfoData
  onChange: (updated: BasicInfoData) => void
  consentAccepted: boolean
  onConsentChange: (accepted: boolean) => void
  idConflictWarning: string
  onCheckIdConflict: () => void
  identityLocked: boolean
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

    // Once we have a valid ID, also run the cross-record name-conflict
    // check. Operator-blurring the ID number is the trigger; the parent
    // owns the check (it has bookingId in scope to exclude self).
    onCheckIdConflict()
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
        {/* Identity-locked banner — when the identity is "established" by
            an earlier booking with the same ID number, the operator is
            seeing pre-populated data and shouldn't be able to overwrite
            it. Address + contact fields stay editable on the next steps. */}
        {identityLocked && (
          <div
            data-testid="identity-locked-banner"
            className="flex flex-col gap-1 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm"
          >
            <span className="font-semibold text-gray-900">
              Existing patient record loaded
            </span>
            <span className="text-xs text-amber-900">
              This patient&apos;s identity (name, ID, date of birth) is on
              file from a previous booking and is locked here. Address and
              contact details on the next steps can still be updated. If
              the locked details are wrong, ask a system administrator to
              correct them via the underlying record.
            </span>
          </div>
        )}

        {/* Row 1: First Names + Surname */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <FloatingInput
            id="firstNames"
            data-testid="input-first-names"
            label="First Names"
            value={data.firstNames}
            onChange={(v) => handleChange("firstNames", v.replace(/[^a-zA-Z\s-]/g, ""))}
            onClear={() => handleClear("firstNames")}
            onBlur={onCheckIdConflict}
            readOnly={identityLocked}
          />
          <FloatingInput
            id="surname"
            data-testid="input-surname"
            label="Surname"
            value={data.surname}
            onChange={(v) => handleChange("surname", v.replace(/[^a-zA-Z\s-]/g, ""))}
            onClear={() => handleClear("surname")}
            onBlur={onCheckIdConflict}
            readOnly={identityLocked}
          />
        </div>

        {/* Row 2: ID Type (dropdown) + ID Number (pre-filled) */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <FloatingSelect
            id="idType"
            data-testid="select-id-type"
            testIdPrefix="option"
            label="ID Type"
            value={data.idType}
            onChange={(v) => handleChange("idType", v)}
            options={ID_TYPE_OPTIONS}
            readOnly={identityLocked}
          />
          <div className="flex flex-col gap-1">
            <FloatingInput
              id="idNumber"
              data-testid="input-id-number"
              label={idFieldLabel}
              value={data.idNumber}
              onChange={handleIdNumberChange}
              onClear={() => { handleClear("idNumber"); setIdError("") }}
              onBlur={handleIdBlur}
              error={idError}
              readOnly={identityLocked}
            />
            {/* Cross-record warning — fired by the parent when this ID
                number is already on file under a different patient name.
                NOT a blocker (operators sometimes need to fix typos on
                existing records); just flags the conflict so they can
                verify the patient identity before continuing. CareFirst
                refuses to register a duplicate ID under a different name,
                so left unchecked this surfaces later as a Start Consult
                failure. */}
            {idConflictWarning && !idError && (
              <span
                data-testid="id-conflict-warning"
                className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
              >
                {idConflictWarning}
              </span>
            )}
          </div>
        </div>

        {/* Row 3: Title + Nationality */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <FloatingSelect
            id="title"
            data-testid="select-title"
            testIdPrefix="option"
            label="Title"
            value={data.title}
            onChange={(v) => handleChange("title", v)}
            options={TITLE_OPTIONS}
            readOnly={identityLocked}
          />
          <FloatingSelect
            id="nationality"
            data-testid="select-nationality"
            testIdPrefix="option"
            label="Nationality"
            value={data.nationality}
            onChange={(v) => handleChange("nationality", v)}
            options={NATIONALITY_OPTIONS}
            readOnly={identityLocked}
          />
        </div>

        {/* Row 4: Gender + Date of Birth */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <FloatingSelect
            id="gender"
            data-testid="select-gender"
            testIdPrefix="option"
            label="Gender"
            value={data.gender}
            onChange={(v) => handleChange("gender", v)}
            options={GENDER_OPTIONS}
            readOnly={identityLocked}
          />
          <DatePickerField
            id="dateOfBirth"
            data-testid="input-date-of-birth"
            label="Date of Birth"
            value={data.dateOfBirth}
            onChange={(v) => handleChange("dateOfBirth", v)}
            onClear={() => handleClear("dateOfBirth")}
            readOnly={identityLocked}
          />
        </div>
      </div>

      {/* POPIA consent — must be ticked BEFORE the rest of the flow so the
          user gives informed consent for personal-information processing
          before any data is captured downstream. Required by POPIA §18(1). */}
      <label
        data-testid="step1-consent-checkbox"
        className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 transition-colors hover:bg-gray-50"
      >
        <input
          type="checkbox"
          checked={consentAccepted}
          onChange={(e) => onConsentChange(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-gray-300 text-[var(--client-primary)] focus:ring-2 focus:ring-[var(--client-primary)]"
        />
        <span className="text-sm text-gray-700">
          I have read and agree to the{" "}
          <a
            href="https://carefirst.co.za/terms-and-conditions/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-[var(--client-primary)] underline hover:text-[var(--client-primary-80)]"
          >
            CareFirst Privacy Policy and Terms &amp; Conditions
          </a>
          , and consent to the collection and processing of the patient&apos;s
          personal information for the purposes of this consultation booking.
        </span>
      </label>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function PatientDetailsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { updateBooking, discardBooking, setActiveBookingId, getBooking, refreshBookings } = useBookingStore()
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

  // Identity-lock check. Runs once on mount: if any OTHER booking exists
  // with this booking's id_number AND has populated identity fields,
  // the identity is "established" and we lock the identity inputs in
  // Step 1 to prevent accidental overwrites (which would later cause
  // CareFirst to reject the consult handoff with "already registered to
  // a different account"). If multiple priors disagree on the name, we
  // still lock (the operator should investigate via admin tools, not
  // edit through the booking flow).
  useEffect(() => {
    if (!bookingId) return
    const idToCheck = existingBooking?.idNumber?.trim() || initialIdNumber.trim()
    if (!idToCheck) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from("bookings")
        .select("id, first_names, surname")
        .eq("id_number", idToCheck)
        .neq("id", bookingId)
        .limit(1)
      if (cancelled) return
      const hasPriorWithIdentity = (data ?? []).some(
        (row) =>
          ((row.first_names as string | null) ?? "").trim() !== "" ||
          ((row.surname as string | null) ?? "").trim() !== ""
      )
      if (hasPriorWithIdentity) setIdentityLocked(true)
    })()
    return () => {
      cancelled = true
    }
    // We intentionally only run this on mount — re-running when the user
    // edits the ID would be confusing (lock state shouldn't depend on
    // mid-flow edits). The conflict-warning fires for that case instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId])

  // Self-collect state. Declared here (above the effect that uses it)
  // rather than grouped with other state declarations later in the file
  // to avoid a temporal-dead-zone reference in the effect body — the
  // setState identifier needs to be visible at the effect's declaration
  // site, not just at its closure call time.
  //
  // Payment mode for this booking. Resolved from the booking's parent
  // client's `collect_payment_at_unit` flag — when "self_collect", step 5
  // hides the gateway/link picker and shows a single "Confirm payment
  // collected at unit" affordance instead. "checking" while we wait for
  // the API; "gateway" is the default until proven otherwise.
  const [paymentMode, setPaymentMode] =
    useState<"checking" | "gateway" | "self_collect" | "monthly_invoice">(
      "gateway"
    )
  const [markingSelfCollect, setMarkingSelfCollect] = useState(false)
  const [selfCollectError, setSelfCollectError] = useState("")
  // Auto-skip path for monthly_invoice clients: the operator never sees
  // step 5. When paymentMode resolves to "monthly_invoice" while step 5
  // is mounted, we auto-fire mark-monthly-invoice and route past it.
  // This ref guards against double-firing on re-renders.
  const monthlyAutoSkipFiredRef = useRef(false)
  const [monthlyAutoSkipError, setMonthlyAutoSkipError] = useState("")
  // Sub-flag from payment-mode endpoint. When TRUE for a non-gateway
  // booking, the post-payment navigation skips /patient-metrics and
  // goes straight to /creating. Defaults to FALSE; only flipped to
  // TRUE if the API confirms it for this booking's parent client.
  const [skipPatientMetrics, setSkipPatientMetrics] = useState(false)

  // Resolve the booking's payment mode from the parent client's
  // collect_payment_at_unit flag. We refetch when bookingId changes (i.e.
  // when the booking is created during step 4 verification) so step 5
  // renders with the correct mode without an extra navigation.
  //
  // Fall back to "gateway" on any failure (404 because bookingId is bogus,
  // 401 because session expired, network error, or 10s timeout). Better
  // to show the existing picker than to leave the user staring at a
  // spinner forever if the API is hanging.
  useEffect(() => {
    if (!bookingId) return
    let cancelled = false
    setPaymentMode("checking")
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10_000)

    fetch(`/api/bookings/${bookingId}/payment-mode`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (cancelled) return
        if (!res.ok) {
          setPaymentMode("gateway")
          return
        }
        const data = (await res.json().catch(() => ({}))) as {
          mode?: "gateway" | "self_collect" | "monthly_invoice"
          skipPatientMetrics?: boolean
        }
        if (cancelled) return
        setPaymentMode(
          data.mode === "self_collect"
            ? "self_collect"
            : data.mode === "monthly_invoice"
              ? "monthly_invoice"
              : "gateway"
        )
        if (data.skipPatientMetrics) setSkipPatientMetrics(true)
      })
      .catch(() => {
        if (!cancelled) setPaymentMode("gateway")
      })
      .finally(() => clearTimeout(timeoutId))

    // Reset the auto-skip guard when the booking changes (e.g. resume
    // from a different draft) so the auto-skip effect can fire fresh
    // for the new booking.
    monthlyAutoSkipFiredRef.current = false

    return () => {
      cancelled = true
      clearTimeout(timeoutId)
      controller.abort()
    }
  }, [bookingId])

  // Auto-skip step 5 for monthly_invoice clients. Fires once per booking
  // when the operator reaches step 5 AND payment-mode has resolved to
  // monthly_invoice. The booking is auto-marked Payment Complete and the
  // operator is routed to /payment/success — they never see step 5.
  // The booking-store is refreshed before navigating so /payment/success
  // sees the new status and skips the (now-pointless) PayFast reconcile.
  useEffect(() => {
    if (
      currentStep !== 5 ||
      paymentMode !== "monthly_invoice" ||
      !bookingId ||
      monthlyAutoSkipFiredRef.current
    ) {
      return
    }
    monthlyAutoSkipFiredRef.current = true
    ;(async () => {
      try {
        const res = await fetch(
          `/api/bookings/${bookingId}/mark-monthly-invoice`,
          { method: "POST" }
        )
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean
          error?: string
        }
        if (!res.ok || !data.ok) {
          // Reset the guard so the operator can manually retry by
          // re-entering step 5. The error banner explains the failure.
          monthlyAutoSkipFiredRef.current = false
          setMonthlyAutoSkipError(
            data.error ?? "Failed to auto-complete booking. Please retry."
          )
          return
        }
        await refreshBookings()
        // Skip /payment/success — no PayFast transaction here.
        router.push(
          skipPatientMetrics
            ? `/create-booking/creating?bookingId=${bookingId}`
            : `/create-booking/patient-metrics?bookingId=${bookingId}`
        )
      } catch {
        monthlyAutoSkipFiredRef.current = false
        setMonthlyAutoSkipError(
          "Network error while auto-completing the booking. Please retry."
        )
      }
    })()
  }, [currentStep, paymentMode, bookingId, refreshBookings, router, skipPatientMetrics])

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

  // POPIA pre-PII consent. True once the user ticks the Step 1 checkbox.
  // Pre-fills from the booking if we're resuming a draft that already
  // captured consent on a previous visit.
  const [consentAccepted, setConsentAccepted] = useState(
    Boolean(existingBooking?.consentAcceptedAt)
  )

  const isStep1Complete =
    basicInfo.firstNames.trim() !== "" &&
    basicInfo.surname.trim() !== "" &&
    basicInfo.idType.trim() !== "" &&
    basicInfo.idNumber.trim() !== "" &&
    basicInfo.title.trim() !== "" &&
    basicInfo.nationality.trim() !== "" &&
    basicInfo.gender.trim() !== "" &&
    basicInfo.dateOfBirth.trim() !== "" &&
    consentAccepted

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

  // -------------------------------------------------------------------------
  // Draft auto-save
  //
  // The "Next" button calls updateBooking() to persist each step's data to
  // the DB. But between arriving at a step and clicking Next, a nurse could
  // spend several minutes typing. If the session ends (idle timeout, browser
  // crash) before Next is clicked, that work is lost.
  //
  // This effect debounces the current form state (basicInfo / addressInfo /
  // contactInfo) and writes it to the booking store every 2s of no changes.
  // Short enough that a crash rarely costs more than a sentence; long enough
  // that we're not hammering Supabase on every keystroke.
  //
  // Skips the very first render so we don't immediately save the initial
  // (pre-filled from search params / existing booking) values.
  // -------------------------------------------------------------------------
  const didMountRef = useRef(false)
  useEffect(() => {
    if (!bookingId) return
    if (!didMountRef.current) {
      didMountRef.current = true
      return
    }
    const handle = window.setTimeout(() => {
      updateBooking(bookingId, {
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
      }).catch((err) => {
        // Auto-save failures are non-fatal — the user's "Next" click still
        // attempts a save, so worst case they lose the last few seconds of
        // typing. Log loudly for diagnosis but do not surface an error
        // banner that would distract from their current work.
        console.warn("[patient-details] draft auto-save failed:", err)
      })
    }, 2000)
    return () => window.clearTimeout(handle)
  }, [bookingId, basicInfo, addressInfo, contactInfo, updateBooking])

  // Verification dialog
  const [showVerification, setShowVerification] = useState(false)
  const [bookingVerificationCode, setBookingVerificationCode] = useState("")
  const [showSuccessBanner, setShowSuccessBanner] = useState(false)
  const [selectedPaymentType, setSelectedPaymentType] = useState("")
  const [verificationError, setVerificationError] = useState("")
  const [verifying, setVerifying] = useState(false)
  const [emailError, setEmailError] = useState("")
  const [contactError, setContactError] = useState("")
  // Soft warning when the entered ID number is already on file under a
  // different patient name. Doesn't block Next — operators sometimes
  // need to fix typos on existing records — but flags the conflict so
  // they don't unintentionally double-register a CareFirst patient.
  // (CareFirst rejects duplicate ID numbers across different names with
  // a 500 + "already registered to a different account" body.)
  const [idConflictWarning, setIdConflictWarning] = useState("")
  // When TRUE, the patient identity fields (firstNames, surname, idType,
  // idNumber, title, nationality, gender, dateOfBirth) are read-only.
  // Set when an earlier booking exists with the same id_number — the
  // identity is "established" by that prior record and shouldn't be
  // accidentally overwritten. Address + contact fields stay editable
  // because those legitimately change between visits.
  const [identityLocked, setIdentityLocked] = useState(false)
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

  // Cross-record check: is this ID number already on file under a
  // DIFFERENT patient name? Pure warning — operators sometimes need to
  // fix typos on existing rows, so a hard block would be too aggressive.
  // Defends against the CareFirst handoff failing later with "already
  // registered to a different account" (HTTP 500).
  async function checkIdConflict() {
    const idNumber = basicInfo.idNumber.trim()
    const firstName = basicInfo.firstNames.trim().toLowerCase()
    const surnameLc = basicInfo.surname.trim().toLowerCase()
    // Need all three to do a meaningful comparison.
    if (!idNumber || !firstName || !surnameLc) {
      setIdConflictWarning("")
      return
    }
    const { data } = await supabase
      .from("bookings")
      .select("first_names, surname")
      .eq("id_number", idNumber)
      .neq("id", bookingId || "")
      .limit(5)
    const conflict = (data ?? []).find((row) => {
      const fn = (row.first_names ?? "").trim().toLowerCase()
      const sn = (row.surname ?? "").trim().toLowerCase()
      // Skip rows that are missing names — they're old drafts.
      if (!fn && !sn) return false
      return fn !== firstName || sn !== surnameLc
    })
    if (conflict) {
      const otherName = `${conflict.first_names ?? ""} ${conflict.surname ?? ""}`.trim() || "another patient"
      setIdConflictWarning(
        `This ID number is already on file for ${otherName}. Verify the patient identity before continuing — CareFirst will reject the consultation handoff if the same ID is registered under a different name.`
      )
    } else {
      setIdConflictWarning("")
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
      // Save basic info to DB. Also persist the POPIA pre-PII consent
      // timestamp — only set it once (if not already captured on a
      // prior visit) so the timestamp reflects the first time consent
      // was given, not every time Next is clicked.
      if (bookingId) {
        const existing = getBooking(bookingId)
        const consentUpdate = existing?.consentAcceptedAt
          ? {}
          : { consentAcceptedAt: new Date().toISOString() }
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
          ...consentUpdate,
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
    } else if (currentStep === 5 && paymentMode === "self_collect") {
      // Self-collect short-circuit: skip PayFast entirely. The server
      // re-checks the client's flag in mark-self-collect, so even if
      // paymentMode was tampered with client-side this can't forge a
      // self-collect for a normal client.
      if (!bookingId || markingSelfCollect) return
      setMarkingSelfCollect(true)
      setSelfCollectError("")
      try {
        const res = await fetch(
          `/api/bookings/${bookingId}/mark-self-collect`,
          { method: "POST" }
        )
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean
          error?: string
        }
        if (!res.ok || !data.ok) {
          setSelfCollectError(data.error ?? "Failed to mark booking as self-collect")
          setMarkingSelfCollect(false)
          return
        }
        // Refresh the booking-store so downstream pages (T&Cs
        // auto-handoff, patient-history) see the booking's new
        // status + payment_type immediately. Without this the row in
        // the local store is briefly out of sync with the DB.
        await refreshBookings()
        // Skip /payment/success entirely — no PayFast transaction was
        // made, so a "Confirming Payment..." page + 10s countdown is
        // misleading dead time. Navigate directly to the next step.
        router.push(
          skipPatientMetrics
            ? `/create-booking/creating?bookingId=${bookingId}`
            : `/create-booking/patient-metrics?bookingId=${bookingId}`
        )
      } catch {
        setSelfCollectError("Network error. Please try again.")
        setMarkingSelfCollect(false)
      }
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
    currentStep === 5
      ? paymentMode === "monthly_invoice"
        ? false  // step 5 is auto-skipped for monthly clients — disable Next while we wait for the redirect
        : paymentMode === "self_collect"
        ? !markingSelfCollect
        : paymentMode === "checking"
          ? false
          : selectedPaymentType !== ""
      : false

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
                    ? "bg-[var(--client-primary-10)] text-[var(--client-primary)]"
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
          <StepBasicInfo
            data={basicInfo}
            onChange={setBasicInfo}
            consentAccepted={consentAccepted}
            onConsentChange={setConsentAccepted}
            idConflictWarning={idConflictWarning}
            onCheckIdConflict={checkIdConflict}
            identityLocked={identityLocked}
          />
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
                testIdPrefix="option"
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
                      <span className="size-3 rounded-full bg-[var(--client-primary)]" />
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
                      <span className="size-3 rounded-full bg-[var(--client-primary)]" />
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
                  testIdPrefix="option"
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
                  testIdPrefix="option"
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
                        <span className="size-3 rounded-full bg-[var(--client-primary)]" />
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
                        <span className="size-3 rounded-full bg-[var(--client-primary)]" />
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

        {/* Step 5 - Payment Type. Branches on paymentMode:
              - self_collect    → confirm-only panel (no gateway picker)
              - monthly_invoice → auto-skip spinner; useEffect routes us
                                  past step 5 to /payment/success
              - gateway         → existing "Pay on device" picker
              - checking        → spinner placeholder while we resolve mode */}
        {currentStep === 5 && paymentMode === "monthly_invoice" && (
          <div
            data-testid="step-payment-type-monthly"
            className="flex w-full max-w-4xl flex-col items-center gap-4 py-12 text-center"
          >
            <svg className="size-8 animate-spin text-gray-400" viewBox="0 0 40 40" fill="none">
              <circle cx="20" cy="20" r="15" stroke="#e5e7eb" strokeWidth="5" strokeLinecap="round" />
              <circle cx="20" cy="20" r="15" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset="70" />
            </svg>
            <span className="text-sm font-medium text-gray-700">
              This client is billed monthly — no payment needed. Continuing to the consultation...
            </span>
            {monthlyAutoSkipError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {monthlyAutoSkipError}
              </div>
            )}
          </div>
        )}

        {currentStep === 5 && paymentMode === "checking" && (
          <div
            data-testid="step-payment-type-loading"
            className="flex w-full max-w-4xl items-center justify-center py-12"
          >
            <svg className="size-8 animate-spin text-gray-400" viewBox="0 0 40 40" fill="none">
              <circle cx="20" cy="20" r="15" stroke="#e5e7eb" strokeWidth="5" strokeLinecap="round" />
              <circle cx="20" cy="20" r="15" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset="70" />
            </svg>
          </div>
        )}

        {currentStep === 5 && paymentMode === "self_collect" && (
          <div
            data-testid="step-payment-type-self-collect"
            className="flex w-full max-w-4xl flex-col gap-6"
          >
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Step 4 of {TOTAL_STEPS}
              </span>
              <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
                Confirm payment collected at unit
              </h1>
              <p className="text-base text-gray-500">
                This client collects the consultation fee directly. Confirm
                that the patient has paid before continuing.
              </p>
            </div>

            <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-5">
              <span className="text-sm font-semibold text-gray-900">
                Self-collect payment
              </span>
              <span className="text-sm text-gray-700">
                Clicking <strong>Next</strong> marks this booking as
                Payment Complete and skips the payment gateway. Make sure
                the consultation fee has been collected before proceeding.
              </span>
            </div>

            {selfCollectError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {selfCollectError}
              </div>
            )}
          </div>
        )}

        {currentStep === 5 && paymentMode === "gateway" && (
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
                    ? "border-[var(--client-primary)] bg-[#CDE5F2]"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <span className={`flex size-6 items-center justify-center rounded-full border-2 ${
                  selectedPaymentType === "device" ? "border-[var(--client-primary)] bg-[var(--client-primary)]" : "border-gray-300 bg-white"
                }`}>
                  {selectedPaymentType === "device" && (
                    <span className="size-3 rounded-full bg-white" />
                  )}
                </span>
                <span className="text-sm font-medium text-gray-900">Pay on device</span>
              </button>

              {/* Send a payment link - Coming Soon */}
              <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-6 py-5">
                <span className="text-sm font-medium text-gray-400">Send a payment link</span>
                <span className="rounded-full bg-[var(--client-primary)] px-4 py-1.5 text-xs font-semibold text-white">
                  Coming Soon
                </span>
              </div>

              {/* Medical Aid - Coming Soon */}
              <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-6 py-5">
                <span className="text-sm font-medium text-gray-400">Medical Aid</span>
                <span className="rounded-full bg-[var(--client-primary)] px-4 py-1.5 text-xs font-semibold text-white">
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
              maxLength={PIN_LENGTH}
              value={bookingVerificationCode}
              onChange={setBookingVerificationCode}
            >
              <InputOTPGroup className="gap-2 sm:gap-3">
                {Array.from({ length: PIN_LENGTH }, (_, i) => (
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
              disabled={bookingVerificationCode.length < PIN_LENGTH || verifying}
              className={`h-12 w-full gap-2 rounded-xl text-base font-semibold transition-all ${
                bookingVerificationCode.length === PIN_LENGTH && !verifying
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
