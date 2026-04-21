"use client"

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react"
import { usePathname } from "next/navigation"
import { supabase } from "./supabase"
import { useAuth } from "./auth-store"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BookingStatus =
  | "In Progress"
  | "Payment Complete"
  | "Successful"
  | "Discarded"
  | "Abandoned"

export interface BookingRecord {
  id: string
  createdAt: string
  updatedAt: string
  status: BookingStatus
  currentStep: string
  searchType: string | null
  firstNames: string | null
  surname: string | null
  idType: string | null
  idNumber: string | null
  title: string | null
  nationality: string | null
  gender: string | null
  dateOfBirth: string | null
  address: string | null
  suburb: string | null
  city: string | null
  province: string | null
  country: string | null
  postalCode: string | null
  countryCode: string | null
  contactNumber: string | null
  emailAddress: string | null
  scriptToAnotherEmail: boolean
  additionalEmail: string | null
  paymentType: string | null
  bloodPressure: string | null
  glucose: string | null
  temperature: string | null
  oxygenSaturation: string | null
  urineDipstick: string | null
  heartRate: string | null
  additionalComments: string | null
  termsAccepted: boolean
  termsAcceptedAt: string | null
  /**
   * Pre-PII consent captured at Step 1 of the booking flow. Separate from
   * termsAcceptedAt (end-of-flow consultation consent). POPIA requires
   * consent before data processing starts, so this one is the legally
   * load-bearing consent for personal-information collection.
   */
  consentAcceptedAt: string | null
  unitId: string | null
}

// ---------------------------------------------------------------------------
// DB helpers — snake_case ↔ camelCase
// ---------------------------------------------------------------------------

interface DbBooking {
  id: string
  created_at: string
  updated_at: string
  status: BookingStatus
  current_step: string
  search_type: string | null
  first_names: string | null
  surname: string | null
  id_type: string | null
  id_number: string | null
  title: string | null
  nationality: string | null
  gender: string | null
  date_of_birth: string | null
  address: string | null
  suburb: string | null
  city: string | null
  province: string | null
  country: string | null
  postal_code: string | null
  country_code: string | null
  contact_number: string | null
  email_address: string | null
  script_to_another_email: boolean
  additional_email: string | null
  payment_type: string | null
  blood_pressure: string | null
  glucose: string | null
  temperature: string | null
  oxygen_saturation: string | null
  urine_dipstick: string | null
  heart_rate: string | null
  additional_comments: string | null
  terms_accepted: boolean
  terms_accepted_at: string | null
  consent_accepted_at: string | null
  unit_id: string | null
}

function mapDbToBooking(row: DbBooking): BookingRecord {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status,
    currentStep: row.current_step,
    searchType: row.search_type,
    firstNames: row.first_names,
    surname: row.surname,
    idType: row.id_type,
    idNumber: row.id_number,
    title: row.title,
    nationality: row.nationality,
    gender: row.gender,
    dateOfBirth: row.date_of_birth,
    address: row.address,
    suburb: row.suburb,
    city: row.city,
    province: row.province,
    country: row.country,
    postalCode: row.postal_code,
    countryCode: row.country_code,
    contactNumber: row.contact_number,
    emailAddress: row.email_address,
    scriptToAnotherEmail: row.script_to_another_email,
    additionalEmail: row.additional_email,
    paymentType: row.payment_type,
    bloodPressure: row.blood_pressure,
    glucose: row.glucose,
    temperature: row.temperature,
    oxygenSaturation: row.oxygen_saturation,
    urineDipstick: row.urine_dipstick,
    heartRate: row.heart_rate,
    additionalComments: row.additional_comments,
    termsAccepted: row.terms_accepted,
    termsAcceptedAt: row.terms_accepted_at,
    consentAcceptedAt: row.consent_accepted_at,
    unitId: row.unit_id,
  }
}

function mapBookingToDb(
  updates: Partial<BookingRecord>
): Record<string, unknown> {
  const db: Record<string, unknown> = {}
  if (updates.status !== undefined) db.status = updates.status
  if (updates.currentStep !== undefined) db.current_step = updates.currentStep
  if (updates.searchType !== undefined) db.search_type = updates.searchType
  if (updates.firstNames !== undefined) db.first_names = updates.firstNames
  if (updates.surname !== undefined) db.surname = updates.surname
  if (updates.idType !== undefined) db.id_type = updates.idType
  if (updates.idNumber !== undefined) db.id_number = updates.idNumber
  if (updates.title !== undefined) db.title = updates.title
  if (updates.nationality !== undefined) db.nationality = updates.nationality
  if (updates.gender !== undefined) db.gender = updates.gender
  if (updates.dateOfBirth !== undefined) db.date_of_birth = updates.dateOfBirth
  if (updates.address !== undefined) db.address = updates.address
  if (updates.suburb !== undefined) db.suburb = updates.suburb
  if (updates.city !== undefined) db.city = updates.city
  if (updates.province !== undefined) db.province = updates.province
  if (updates.country !== undefined) db.country = updates.country
  if (updates.postalCode !== undefined) db.postal_code = updates.postalCode
  if (updates.countryCode !== undefined) db.country_code = updates.countryCode
  if (updates.contactNumber !== undefined)
    db.contact_number = updates.contactNumber
  if (updates.emailAddress !== undefined)
    db.email_address = updates.emailAddress
  if (updates.scriptToAnotherEmail !== undefined)
    db.script_to_another_email = updates.scriptToAnotherEmail
  if (updates.additionalEmail !== undefined)
    db.additional_email = updates.additionalEmail
  if (updates.paymentType !== undefined) db.payment_type = updates.paymentType
  if (updates.bloodPressure !== undefined)
    db.blood_pressure = updates.bloodPressure
  if (updates.glucose !== undefined) db.glucose = updates.glucose
  if (updates.temperature !== undefined) db.temperature = updates.temperature
  if (updates.oxygenSaturation !== undefined)
    db.oxygen_saturation = updates.oxygenSaturation
  if (updates.urineDipstick !== undefined)
    db.urine_dipstick = updates.urineDipstick
  if (updates.heartRate !== undefined) db.heart_rate = updates.heartRate
  if (updates.additionalComments !== undefined)
    db.additional_comments = updates.additionalComments
  if (updates.termsAccepted !== undefined)
    db.terms_accepted = updates.termsAccepted
  if (updates.termsAcceptedAt !== undefined)
    db.terms_accepted_at = updates.termsAcceptedAt
  if (updates.consentAcceptedAt !== undefined)
    db.consent_accepted_at = updates.consentAcceptedAt
  if (updates.unitId !== undefined) db.unit_id = updates.unitId
  return db
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface BookingStoreContextValue {
  bookings: BookingRecord[]
  activeBookingId: string | null
  loading: boolean
  createBooking: (data: Partial<BookingRecord>) => Promise<string>
  updateBooking: (
    id: string,
    updates: Partial<BookingRecord>
  ) => Promise<void>
  discardBooking: (id: string) => Promise<void>
  abandonBooking: (id: string) => Promise<void>
  setActiveBookingId: (id: string | null) => void
  getBooking: (id: string) => BookingRecord | undefined
  refreshBookings: () => Promise<void>
}

const BookingStoreContext = createContext<BookingStoreContextValue | null>(null)

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function BookingStoreProvider({ children }: { children: ReactNode }) {
  const [bookings, setBookings] = useState<BookingRecord[]>([])
  const [activeBookingId, setActiveBookingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const pathname = usePathname()
  const { user, activeUnitId: authActiveUnitId } = useAuth()

  // Keep a ref so event handlers always see the latest value
  const activeBookingIdRef = useRef(activeBookingId)
  activeBookingIdRef.current = activeBookingId

  // ------- Fetch bookings (filtered by unit for non-admins) -------
  const fetchBookings = useCallback(async () => {
    setLoading(true)

    let query = supabase
      .from("bookings")
      .select("*")
      .order("created_at", { ascending: false })

    // Non-admin users only see bookings for their active unit
    if (user && user.role !== "system_admin" && authActiveUnitId) {
      query = query.eq("unit_id", authActiveUnitId)
    }

    const { data, error } = await query

    if (error) {
      console.error("Error fetching bookings:", error)
      setLoading(false)
      return
    }

    setBookings((data as DbBooking[]).map(mapDbToBooking))
    setLoading(false)
  }, [user, authActiveUnitId])

  useEffect(() => {
    fetchBookings()
  }, [fetchBookings])

  // ------- Create a new booking -------
  const createBooking = useCallback(
    async (data: Partial<BookingRecord>): Promise<string> => {
      // Abandon any existing "In Progress" bookings before creating a new one
      const oldId = activeBookingIdRef.current
      if (oldId) {
        await supabase
          .from("bookings")
          .update({ status: "Abandoned" })
          .eq("id", oldId)
          .eq("status", "In Progress")
      }

      const dbData = mapBookingToDb({
        status: "In Progress",
        currentStep: "search",
        ...data,
      })

      const { data: row, error } = await supabase
        .from("bookings")
        .insert(dbData)
        .select("id")
        .single()

      if (error) {
        console.error("Error creating booking:", error)
        throw error
      }

      const id = row.id
      setActiveBookingId(id)
      await fetchBookings()
      return id
    },
    [fetchBookings]
  )

  // ------- Update an existing booking -------
  const updateBooking = useCallback(
    async (id: string, updates: Partial<BookingRecord>) => {
      const dbUpdates = mapBookingToDb(updates)
      if (Object.keys(dbUpdates).length === 0) return

      const { error } = await supabase
        .from("bookings")
        .update(dbUpdates)
        .eq("id", id)

      if (error) {
        console.error("Error updating booking:", error)
      }

      await fetchBookings()
    },
    [fetchBookings]
  )

  // ------- Discard a booking -------
  const discardBooking = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from("bookings")
        .update({ status: "Discarded" })
        .eq("id", id)

      if (error) console.error("Error discarding booking:", error)

      setActiveBookingId(null)
      await fetchBookings()
    },
    [fetchBookings]
  )

  // ------- Abandon a booking -------
  const abandonBooking = useCallback(
    async (id: string) => {
      // Only abandon if the booking is still In Progress
      const { error } = await supabase
        .from("bookings")
        .update({ status: "Abandoned" })
        .eq("id", id)
        .eq("status", "In Progress")

      if (error) console.error("Error abandoning booking:", error)

      setActiveBookingId(null)
      await fetchBookings()
    },
    [fetchBookings]
  )

  // ------- Get a single booking -------
  const getBooking = useCallback(
    (id: string) => bookings.find((b) => b.id === id),
    [bookings]
  )

  // ------- Abandoned detection: route change -------
  const prevPathnameRef = useRef(pathname)
  const abandonBookingRef = useRef(abandonBooking)
  abandonBookingRef.current = abandonBooking

  useEffect(() => {
    const wasInBookingFlow = prevPathnameRef.current?.startsWith("/create-booking")
    const isInBookingFlow = pathname?.startsWith("/create-booking")

    // User navigated away from the booking flow
    if (wasInBookingFlow && !isInBookingFlow && activeBookingIdRef.current) {
      abandonBookingRef.current(activeBookingIdRef.current)
    }

    prevPathnameRef.current = pathname
  }, [pathname])

  // ------- Abandoned detection: browser close -------
  useEffect(() => {
    function handleBeforeUnload() {
      const id = activeBookingIdRef.current
      if (!id) return

      // Use sendBeacon with Supabase REST API for reliability on page close
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      if (!supabaseUrl || !supabaseKey) return

      const url = `${supabaseUrl}/rest/v1/bookings?id=eq.${id}&status=eq.In Progress`
      const headers = {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      }

      // sendBeacon doesn't support custom headers, so fall back to fetch with keepalive
      fetch(url, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ status: "Abandoned" }),
        keepalive: true,
      }).catch(() => {
        // Best-effort — if it fails, the booking stays "In Progress"
      })
    }

    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [])

  return (
    <BookingStoreContext.Provider
      value={{
        bookings,
        activeBookingId,
        loading,
        createBooking,
        updateBooking,
        discardBooking,
        abandonBooking,
        setActiveBookingId,
        getBooking,
        refreshBookings: fetchBookings,
      }}
    >
      {children}
    </BookingStoreContext.Provider>
  )
}

export function useBookingStore() {
  const ctx = useContext(BookingStoreContext)
  if (!ctx) {
    throw new Error("useBookingStore must be used within BookingStoreProvider")
  }
  return ctx
}
