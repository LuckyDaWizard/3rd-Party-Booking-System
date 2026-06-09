"use client"

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from "react"
import { usePathname } from "next/navigation"
import { supabase } from "./supabase"
import { useAuth } from "./auth-store"

// =============================================================================
// Booking audit write — retry queue (audit #12)
//
// The /api/bookings/audit endpoint is fire-and-forget from the UI's point of
// view: callers never await the result and a failure must never break the
// booking flow. Previously a network blip or a transient 5xx silently dropped
// the audit row — acceptable for most cases but a POPIA-compliance gap on
// busy days.
//
// We now maintain a single in-memory FIFO queue with a serialised processor:
//   - Up to MAX_AUDIT_RETRIES attempts per payload
//   - Exponential backoff (500ms, 1500ms, 4500ms)
//   - Also retries on non-OK HTTP responses (the previous code only caught
//     network errors and missed 5xx)
//   - 401/403 short-circuits the retry chain — no point retrying after the
//     user's session has gone
//
// All retries exhausted → console.error with the full payload so the row is
// still recoverable from log inspection. Persistent (localStorage) replay was
// considered and deferred — the in-memory queue handles transient issues
// which is what the audit flagged.
// =============================================================================

interface AuditPayload {
  bookingId: string
  action: "create" | "update" | "delete"
  entityName?: string
  changes?: Record<string, { old?: unknown; new?: unknown }>
}

interface QueuedAudit {
  payload: AuditPayload
  attempts: number
}

const MAX_AUDIT_RETRIES = 3
const RETRY_BASE_MS = 500

const auditQueue: QueuedAudit[] = []
let auditProcessing = false

async function processAuditQueue(): Promise<void> {
  if (auditProcessing) return
  auditProcessing = true
  try {
    while (auditQueue.length > 0) {
      const item = auditQueue[0]
      let succeeded = false
      let lastErr: unknown = null
      try {
        const res = await fetch("/api/bookings/audit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item.payload),
        })
        if (res.ok) {
          succeeded = true
        } else if (res.status === 401 || res.status === 403) {
          // Session lost — there's no point retrying this or any later items
          // since they'd all 401 too. Drop the queue.
          console.warn(
            "Booking audit dropped — session expired (HTTP " + res.status + ")"
          )
          auditQueue.length = 0
          break
        } else {
          lastErr = new Error(`HTTP ${res.status}`)
        }
      } catch (err) {
        lastErr = err
      }

      if (succeeded) {
        auditQueue.shift()
        continue
      }

      item.attempts++
      if (item.attempts >= MAX_AUDIT_RETRIES) {
        console.error(
          `Booking audit dropped after ${MAX_AUDIT_RETRIES} attempts:`,
          lastErr,
          item.payload
        )
        auditQueue.shift()
      } else {
        // Backoff before the next attempt: 500ms, 1500ms, 4500ms.
        const delay = RETRY_BASE_MS * Math.pow(3, item.attempts - 1)
        await new Promise((r) => setTimeout(r, delay))
      }
    }
  } finally {
    auditProcessing = false
  }
}

function postBookingAudit(payload: AuditPayload): void {
  auditQueue.push({ payload, attempts: 0 })
  // Fire-and-forget — the queue processor runs in the background. We
  // deliberately don't return its promise so callers can't accidentally
  // block the booking flow waiting for the audit row.
  void processAuditQueue()
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// Re-export the canonical BookingStatus from the state-machine module so
// existing consumers of `import { BookingStatus } from "@/lib/booking-store"`
// don't have to change. The single source of truth is now booking-state-machine.ts
// (audit #8 / Sprint 3 #12) — both the type and the allowed-transition rules
// live there.
export type { BookingStatus } from "./booking-state-machine"
import type { BookingStatus } from "./booking-state-machine"

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
  // Coupon snapshot (denormalised from coupons / coupon_uses by the apply
  // endpoint — kept here so list views can render without an extra join).
  /** Coupon code as displayed when the patient applied it. NULL when no coupon. */
  couponCode: string | null
  /** Resolved discount in rand, rounded to 2dp. NULL when no coupon. */
  discountAmount: number | null
  /** Booking amount BEFORE the discount (for the "was R325 / now R260" surface). */
  originalAmount: number | null
  /** What we actually charge / charged — the post-discount total. NULL until the payment step. */
  paymentAmount: number | null
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
  coupon_code: string | null
  discount_amount: number | string | null
  original_amount: number | string | null
  payment_amount: number | string | null
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
    couponCode: row.coupon_code,
    discountAmount: row.discount_amount !== null ? Number(row.discount_amount) : null,
    originalAmount: row.original_amount !== null ? Number(row.original_amount) : null,
    paymentAmount: row.payment_amount !== null ? Number(row.payment_amount) : null,
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
  /**
   * Last user-visible error from a failed booking save/load (audit #11).
   * Set by the store when a Supabase operation returns an error so the
   * dashboard layout can render a toast instead of the error vanishing
   * into the browser console. `null` when there's nothing to show.
   */
  lastError: string | null
  clearLastError: () => void
}

const BookingStoreContext = createContext<BookingStoreContextValue | null>(null)

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function BookingStoreProvider({ children }: { children: ReactNode }) {
  const [bookings, setBookings] = useState<BookingRecord[]>([])
  const [activeBookingId, setActiveBookingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  // User-visible error toast trigger. The dashboard layout renders a
  // Banner when this is non-null (audit #11). Operator action: dismiss
  // via the banner's X, or re-trigger the failed operation.
  const [lastError, setLastError] = useState<string | null>(null)
  const clearLastError = useCallback(() => setLastError(null), [])
  const pathname = usePathname()
  const { user, activeUnitId: authActiveUnitId } = useAuth()

  // Keep a ref so event handlers always see the latest value. Assignment
  // lives in a post-commit effect rather than running during render — the
  // latter trips React 19's set-ref-during-render rule and is unsafe under
  // concurrent rendering (the render may be discarded but the ref mutation
  // would persist).
  const activeBookingIdRef = useRef(activeBookingId)
  // Defence-in-depth against duplicate booking creation. The create-booking
  // page has a synchronous double-click guard, but if a future caller forgets
  // to add one — or if React event-batching changes — concurrent calls to
  // createBooking() would otherwise both run the insert. With this ref, the
  // SECOND caller returns the SAME Promise as the first and resolves with
  // the same id. Cleared in `finally` once the original resolves (success
  // or error) so the next legitimate create can proceed. Production
  // incident: a double-click on submit created two identical bookings for
  // the same patient at the same minute (Lucky Mokoena, 2026/06/01 14:14).
  const createBookingInFlightRef = useRef<Promise<string> | null>(null)
  useEffect(() => {
    activeBookingIdRef.current = activeBookingId
  }, [activeBookingId])

  // ------- Fetch bookings (filtered by unit for non-admins) -------
  //
  // ARCHITECTURAL NOTE — server pagination boundary, ~5k bookings/tenant.
  //
  // This pulls every booking visible to the caller in one shot with
  // select("*"). At a typical row size, a year of activity (~10k rows on
  // a busy tenant) is ~10 MB JSON in memory before Patient History maps
  // it twice (once for display, once for CSV). Acceptable today; will
  // become the load bottleneck before any other piece of the app.
  //
  // When a tenant crosses ~5k bookings or initial Patient History load
  // breaks 1s on a mid-tier phone:
  //   1. Switch to .range() driven by URL params + server-side filtering.
  //   2. CSV export moves to a streaming /api/admin/patient-history/export
  //      route (don't double-map a 10 MB array in the client).
  //   3. Status counts move into a single COUNT() RPC instead of being
  //      computed from the full array client-side.
  // Until then, keep this select(*).
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
      setLastError("Couldn't load bookings. Please refresh the page or try again in a moment.")
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
  //
  // Mutations below patch the local `bookings` array in place after a
  // successful Supabase call instead of refetching the whole list (audit
  // #6 / Sprint 2 #8). Eliminates the post-mutation refetch round-trip
  // + the brief list flicker + the loss of scroll position that the
  // refetch approach caused at higher volumes.
  const createBooking = useCallback(
    async (data: Partial<BookingRecord>): Promise<string> => {
      // Promise-level dedup. If a create is already in-flight, return its
      // Promise instead of starting a second one. Catches the rare race
      // where two concurrent callers slip past the page-level
      // submittingRef guard (e.g. a future caller that forgets to add one).
      if (createBookingInFlightRef.current) {
        return createBookingInFlightRef.current
      }

      const inFlight = (async (): Promise<string> => {
        // Abandon any existing "In Progress" bookings before creating a new
        // one. `oldId` is captured once when the IIFE starts; concurrent
        // callers that dedup onto this Promise share the same `oldId`
        // snapshot. Intentional — the second caller would have captured the
        // same value anyway since both clicks happen within milliseconds.
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
          .select("*")
          .single()

        if (error) {
          console.error("Error creating booking:", error)
          setLastError("Couldn't start a new booking. Please try again — if it keeps failing, sign out and back in.")
          throw error
        }

        const newBooking = mapDbToBooking(row as DbBooking)
        const id = newBooking.id
        setActiveBookingId(id)

        // Patch local state: prepend the new booking + flip the previous
        // active booking (if any) to Abandoned. Order matches the server
        // fetch (created_at DESC) so the new row sits at the top.
        setBookings((prev) => {
          const updated = oldId
            ? prev.map((b) =>
                b.id === oldId && b.status === "In Progress"
                  ? { ...b, status: "Abandoned" as const }
                  : b
              )
            : prev
          return [newBooking, ...updated]
        })

        const patientName =
          [data.firstNames, data.surname].filter(Boolean).join(" ").trim()
        postBookingAudit({
          bookingId: id,
          action: "create",
          entityName: patientName
            ? `Booking for ${patientName}`
            : "Booking (no patient info yet)",
          changes: {
            Status: { new: "In Progress" },
          },
        })
        return id
      })()

      createBookingInFlightRef.current = inFlight
      try {
        return await inFlight
      } finally {
        // Reset on both success AND error so the next legitimate create
        // can proceed. Note: clears unconditionally — we don't try to
        // preserve the failed Promise for retry, because the caller's
        // error handler will get the original rejection and decide.
        createBookingInFlightRef.current = null
      }
    },
    []
  )

  // ------- Update an existing booking -------
  const updateBooking = useCallback(
    async (id: string, updates: Partial<BookingRecord>) => {
      const dbUpdates = mapBookingToDb(updates)
      if (Object.keys(dbUpdates).length === 0) return

      const { data: row, error } = await supabase
        .from("bookings")
        .update(dbUpdates)
        .eq("id", id)
        .select("*")
        .single()

      if (error) {
        console.error("Error updating booking:", error)
        setLastError("Couldn't save your changes. Please retry — if it keeps failing the data may be out of date; refresh the page.")
        return
      }

      if (row) {
        const updated = mapDbToBooking(row as DbBooking)
        setBookings((prev) => prev.map((b) => (b.id === id ? updated : b)))
      }
    },
    []
  )

  // ------- Discard a booking -------
  const discardBooking = useCallback(
    async (id: string) => {
      const { data: row, error } = await supabase
        .from("bookings")
        .update({ status: "Discarded" })
        .eq("id", id)
        .select("*")
        .single()

      if (error) {
        console.error("Error discarding booking:", error)
        setLastError("Couldn't discard this booking. Please retry.")
      } else if (row) {
        const updated = mapDbToBooking(row as DbBooking)
        setBookings((prev) => prev.map((b) => (b.id === id ? updated : b)))
        postBookingAudit({
          bookingId: id,
          action: "update",
          changes: { Status: { new: "Discarded" } },
        })
      }

      setActiveBookingId(null)
    },
    []
  )

  // ------- Abandon a booking -------
  const abandonBooking = useCallback(
    async (id: string) => {
      // Only abandon if the booking is still In Progress. select() returns
      // the matched row (or nothing if 0 rows met the filter) so we know
      // whether to patch local state.
      const { data: row, error } = await supabase
        .from("bookings")
        .update({ status: "Abandoned" })
        .eq("id", id)
        .eq("status", "In Progress")
        .select("*")
        .maybeSingle()

      if (error) {
        console.error("Error abandoning booking:", error)
        setLastError("Couldn't abandon this booking. Please retry.")
      } else if (row) {
        const updated = mapDbToBooking(row as DbBooking)
        setBookings((prev) => prev.map((b) => (b.id === id ? updated : b)))
        postBookingAudit({
          bookingId: id,
          action: "update",
          changes: { Status: { new: "Abandoned" } },
        })
      }

      setActiveBookingId(null)
    },
    []
  )

  // ------- Get a single booking -------
  const getBooking = useCallback(
    (id: string) => bookings.find((b) => b.id === id),
    [bookings]
  )

  // ------- Abandoned detection: route change -------
  const prevPathnameRef = useRef(pathname)
  const abandonBookingRef = useRef(abandonBooking)
  // Same reasoning as activeBookingIdRef above — keep the ref-sync in an
  // effect so it doesn't violate the set-ref-during-render rule.
  useEffect(() => {
    abandonBookingRef.current = abandonBooking
  }, [abandonBooking])

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

  // Memoised context value. Without this, the object passed to value={...}
  // was a fresh reference on every render of the provider, which forced
  // every component reading useBookingStore() to re-render even if the
  // fields they actually use didn't change. Now consumers only re-render
  // when one of the inputs below actually changes identity.
  // (The five action callbacks are all stable from useCallback above, so
  // they don't trigger re-memos on their own.)
  const value = useMemo(
    () => ({
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
      lastError,
      clearLastError,
    }),
    [
      bookings,
      activeBookingId,
      loading,
      createBooking,
      updateBooking,
      discardBooking,
      abandonBooking,
      getBooking,
      fetchBookings,
      lastError,
      clearLastError,
    ]
  )

  return (
    <BookingStoreContext.Provider value={value}>
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
