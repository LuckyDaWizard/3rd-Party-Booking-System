"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, ArrowRight, FileText, CheckCircle, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"
import { useBookingStore } from "@/lib/booking-store"
import { useAuth } from "@/lib/auth-store"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function maskName(name: string): string {
  if (!name || name.length <= 2) return name
  const first2 = name.slice(0, 2)
  const last1 = name.slice(-1)
  const masked = "*".repeat(name.length - 3)
  return `${first2}${masked}${last1}`
}

function maskEmail(email: string): string {
  if (!email) return "N/A"
  const [local, domain] = email.split("@")
  if (!local || !domain) return email
  const first2 = local.slice(0, 2)
  const masked = "*".repeat(Math.max(local.length - 2, 0))
  return `${first2}${masked}@${domain}`
}

function maskContact(contact: string): string {
  if (!contact || contact.length <= 4) return contact || "N/A"
  // Remove +27 prefix and format as 0XX *** XXXX
  let num = contact
  if (num.startsWith("+27")) num = "0" + num.slice(3)
  if (num.length >= 10) {
    return `${num.slice(0, 3)} *** ${num.slice(-4)}`
  }
  const first3 = num.slice(0, 3)
  const last4 = num.slice(-4)
  return `${first3} *** ${last4}`
}

interface PatientMatch {
  id: string
  firstName: string
  surname: string
  email: string
  contactNumber: string
  rawData: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type Step = "email" | "contact"

export default function SelectPatientPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { createBooking } = useBookingStore()
  const { activeUnitId } = useAuth()

  const matchIds = searchParams.get("matchIds")?.split(",") ?? []
  const searchType = searchParams.get("searchType") ?? "dob"
  const searchFirstName = searchParams.get("firstName") ?? ""
  const searchSurname = searchParams.get("surname") ?? ""
  const searchDob = searchParams.get("dob") ?? ""
  const searchIdNumber = searchParams.get("idNumber") ?? ""
  const searchPassportNumber = searchParams.get("passportNumber") ?? ""

  const [patients, setPatients] = useState<PatientMatch[]>([])
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState<Step>("email")
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null)
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Fetch the matched patients
  useEffect(() => {
    if (matchIds.length === 0) return

    async function fetchMatches() {
      const { data } = await supabase
        .from("bookings")
        .select("*")
        .in("id", matchIds)

      if (data) {
        // Deduplicate by id_number (take the most recent for each)
        const uniqueMap = new Map<string, Record<string, unknown>>()
        for (const row of data) {
          const key = (row.id_number as string) ?? row.id
          if (!uniqueMap.has(key)) {
            uniqueMap.set(key, row)
          }
        }

        setPatients(
          Array.from(uniqueMap.values()).map((row) => ({
            id: row.id as string,
            firstName: (row.first_names as string) ?? "",
            surname: (row.surname as string) ?? "",
            email: (row.email_address as string) ?? "",
            contactNumber: (row.contact_number as string) ?? "",
            rawData: row,
          }))
        )
      }
      setLoading(false)
    }

    fetchMatches()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectedPatient = patients.find((p) => p.id === selectedPatientId)

  async function handleContinueAsNew() {
    setSubmitting(true)

    const bookingData: Record<string, string | null> = {
      searchType,
      unitId: activeUnitId ?? null,
      firstNames: searchFirstName || null,
      surname: searchSurname || null,
      dateOfBirth: searchDob || null,
      idNumber: searchIdNumber || searchPassportNumber || null,
      idType: searchIdNumber ? "national_id" : searchPassportNumber ? "passport" : null,
    }

    const bookingId = await createBooking(bookingData)

    const params = new URLSearchParams()
    params.set("bookingId", bookingId)
    params.set("searchType", searchType)
    setSubmitting(false)
    router.push(`/create-booking/patient-details?${params.toString()}`)
  }

  async function handleSelectPatient() {
    if (!selectedPatient) return
    setSubmitting(true)

    if (step === "email") {
      // Move to contact verification step
      setStep("contact")
      setSubmitting(false)
      return
    }

    // Step is "contact" — verify both selections match
    if (selectedContactId !== selectedPatientId) {
      // Selections don't match — the patient couldn't verify their identity
      setSubmitting(false)
      return
    }

    // Proceed with selected patient data
    const raw = selectedPatient.rawData
    const bookingData: Record<string, string | null | boolean> = {
      searchType,
      unitId: activeUnitId ?? null,
      firstNames: (raw.first_names as string) ?? null,
      surname: (raw.surname as string) ?? null,
      idType: (raw.id_type as string) ?? null,
      idNumber: (raw.id_number as string) ?? null,
      title: (raw.title as string) ?? null,
      nationality: (raw.nationality as string) ?? null,
      gender: (raw.gender as string) ?? null,
      dateOfBirth: (raw.date_of_birth as string) ?? null,
      address: (raw.address as string) ?? null,
      suburb: (raw.suburb as string) ?? null,
      city: (raw.city as string) ?? null,
      province: (raw.province as string) ?? null,
      country: (raw.country as string) ?? null,
      postalCode: (raw.postal_code as string) ?? null,
      countryCode: (raw.country_code as string) ?? null,
      contactNumber: (raw.contact_number as string) ?? null,
      emailAddress: (raw.email_address as string) ?? null,
    }

    const bookingId = await createBooking(bookingData)

    const params = new URLSearchParams()
    params.set("bookingId", bookingId)
    params.set("searchType", searchType)
    setSubmitting(false)
    router.push(`/create-booking/patient-details?${params.toString()}`)
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <svg className="size-10 animate-spin" viewBox="0 0 40 40" fill="none">
          <circle cx="20" cy="20" r="15" stroke="#d1d5db" strokeWidth="5" strokeLinecap="round" />
          <circle cx="20" cy="20" r="15" stroke="var(--client-primary)" strokeWidth="5" strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset="70" />
        </svg>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Top bar */}
      <div className="flex items-center rounded-xl bg-white px-6 py-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (step === "contact") {
              setStep("email")
            } else {
              router.push("/create-booking")
            }
          }}
          className="gap-3 rounded-lg border-black px-6 py-2"
        >
          <ArrowLeft className="size-4" />
          Back
        </Button>
      </div>

      {/* Banner */}
      <div className="flex items-start justify-between rounded-xl bg-yellow-50 border border-yellow-200 px-6 py-5">
        <div className="flex flex-col gap-1">
          <span className="text-base font-bold text-gray-900">
            Multiple Results Found
          </span>
          <p className="text-sm text-gray-600">
            We found more than one result matching your search. To confirm that you are the correct patient, please select the valid information below
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push("/create-booking")}
          className="shrink-0 rounded-full p-1 text-gray-400 hover:text-gray-600"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Step indicators */}
      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => setStep("email")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            step === "email"
              ? "bg-[var(--client-primary-10)] text-[var(--client-primary)]"
              : step === "contact"
                ? "bg-green-100 text-green-500"
                : "text-gray-400"
          }`}
        >
          {step === "contact" ? <CheckCircle className="size-4" /> : <FileText className="size-4" />}
          Email Address
        </button>
        <button
          type="button"
          onClick={() => {
            if (selectedPatientId) setStep("contact")
          }}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            step === "contact"
              ? "bg-[var(--client-primary-10)] text-[var(--client-primary)]"
              : "text-gray-400"
          }`}
        >
          <FileText className="size-4" />
          Contact number
        </button>
      </div>

      {/* Content */}
      <div className="flex flex-col items-center gap-6 py-4">
        {step === "email" ? (
          <>
            <h1 className="text-center text-2xl font-extrabold text-gray-900 sm:text-3xl">Select your email address</h1>
            <p className="text-gray-500">
              Select the email address associated with your account to verify your identity
            </p>

            {/* Email list */}
            <div className="flex w-full max-w-lg flex-col gap-3">
              {patients.map((patient) => (
                <button
                  key={patient.id}
                  type="button"
                  onClick={() => setSelectedPatientId(patient.id)}
                  className={`w-full rounded-xl border-2 px-6 py-5 text-left text-base font-medium text-gray-900 transition-colors ${
                    selectedPatientId === patient.id
                      ? "border-[#CDE5F2] bg-[#CDE5F2]"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  {maskEmail(patient.email)}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <h1 className="text-center text-2xl font-extrabold text-gray-900 sm:text-3xl">Select your contact number</h1>
            <p className="text-gray-500">
              Select your contact number below to continue
            </p>

            {/* Contact number list */}
            <div className="flex w-full max-w-lg flex-col gap-3">
              {patients.map((patient) => (
                <button
                  key={patient.id}
                  type="button"
                  onClick={() => setSelectedContactId(patient.id)}
                  className={`w-full rounded-xl border-2 px-6 py-5 text-left text-base font-medium text-gray-900 transition-colors ${
                    selectedContactId === patient.id
                      ? "border-[#CDE5F2] bg-[#CDE5F2]"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  {maskContact(patient.contactNumber)}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Actions */}
        <div className="flex w-full max-w-lg flex-col items-center gap-3 pt-2">
          <Button
            onClick={handleSelectPatient}
            disabled={(step === "email" ? !selectedPatientId : !selectedContactId) || submitting}
            className={`h-12 w-full gap-2 rounded-xl text-base font-semibold transition-all ${
              (step === "email" ? selectedPatientId : selectedContactId) && !submitting
                ? "bg-gray-900 text-white hover:bg-gray-800"
                : "bg-gray-300 text-gray-500 cursor-default"
            }`}
          >
            {submitting ? "Processing..." : "Next"}
            {!submitting && <ArrowRight className="size-4" />}
          </Button>

          <button
            type="button"
            onClick={handleContinueAsNew}
            disabled={submitting}
            className="text-sm font-semibold text-[#FF3A69] hover:opacity-80"
          >
            I don&apos;t recognise any of the above
          </button>
        </div>
      </div>
    </div>
  )
}
