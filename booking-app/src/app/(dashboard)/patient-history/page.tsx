"use client"

import * as React from "react"
import Link from "next/link"
import { useSearchParams, useRouter } from "next/navigation"
import { ArrowLeft, Search, Plus, ArrowRight, MoreVertical, Download, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useBookingStore, type BookingStatus } from "@/lib/booking-store"
import { useAuth } from "@/lib/auth-store"
import { DataCard } from "@/components/data-card"
import { PinVerificationModal } from "@/components/ui/pin-verification-modal"
import * as XLSX from "xlsx"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PatientStatus = BookingStatus

interface PatientRecord {
  id: string
  status: PatientStatus
  patientName: string
  patientIdNumber: string
  patientType: string
  date: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function maskIdNumber(id: string | null): string {
  if (!id || id.length < 4) return id || "N/A"
  const first2 = id.slice(0, 2)
  const last2 = id.slice(-2)
  const masked = "X".repeat(id.length - 4)
  return `${first2}${masked}${last2}`
}

function getStatusStyle(status: PatientStatus): string {
  switch (status) {
    case "Payment Complete":
      return "bg-yellow-100 text-yellow-800 border-transparent"
    case "In Progress":
      // Status badges stay on the system blue regardless of client theme,
      // so a status meaning is visually identical across every client.
      // (The #CDE5F2 / #3ea3db pair is the only brand-coloured status; the
      // rest are semantic — green / yellow / red / black.)
      return "bg-[#CDE5F2] text-[#3ea3db] border-transparent"
    case "Abandoned":
      return "bg-[#FF3A69] text-white border-transparent"
    case "Successful":
      return "bg-green-100 text-green-600 border-transparent"
    case "Discarded":
      return "bg-gray-900 text-white border-transparent"
    default:
      return "bg-gray-100 text-gray-600 border-transparent"
  }
}

type FilterType = "all" | "in-progress" | "incomplete" | "completed"

function countByFilter(
  patients: PatientRecord[],
  filter: FilterType
): number {
  if (filter === "all") return patients.length
  if (filter === "in-progress")
    return patients.filter(
      (p) =>
        p.status === "Payment Complete" ||
        p.status === "In Progress"
    ).length
  if (filter === "incomplete")
    return patients.filter(
      (p) => p.status === "Abandoned"
    ).length
  // completed
  return patients.filter(
    (p) => p.status === "Successful" || p.status === "Discarded"
  ).length
}

function filterPatients(
  patients: PatientRecord[],
  filter: FilterType,
  search: string
): PatientRecord[] {
  let filtered = patients

  if (filter === "in-progress") {
    filtered = filtered.filter(
      (p) =>
        p.status === "Payment Complete" ||
        p.status === "In Progress"
    )
  } else if (filter === "incomplete") {
    filtered = filtered.filter(
      (p) => p.status === "Abandoned"
    )
  } else if (filter === "completed") {
    filtered = filtered.filter(
      (p) => p.status === "Successful" || p.status === "Discarded"
    )
  }

  if (search.trim()) {
    const q = search.toLowerCase()
    filtered = filtered.filter(
      (p) =>
        p.patientName.toLowerCase().includes(q) ||
        p.patientIdNumber.toLowerCase().includes(q)
    )
  }

  return filtered
}

// ---------------------------------------------------------------------------
// Options Modal
// ---------------------------------------------------------------------------

interface OptionsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bookingId: string | null
  onDiscard: (id: string) => void
  canConfirmPayment: boolean
  onRequestConfirmPayment: (id: string) => void
}

type OptionChoice = "process-on-device" | "confirm-payment" | null

function OptionsModal({
  open,
  onOpenChange,
  bookingId,
  onDiscard,
  canConfirmPayment,
  onRequestConfirmPayment,
}: OptionsModalProps) {
  const router = useRouter()
  const [selected, setSelected] = React.useState<OptionChoice>(null)

  function handleContinue() {
    if (!selected || !bookingId) return

    if (selected === "confirm-payment") {
      // Hand off to the page-level PIN verification modal. This modal closes
      // and the verification modal opens.
      onOpenChange(false)
      setSelected(null)
      onRequestConfirmPayment(bookingId)
      return
    }

    onOpenChange(false)
    setSelected(null)

    if (selected === "process-on-device") {
      router.push(`/create-booking/payment?bookingId=${bookingId}&type=device`)
    }
  }

  function handleCancel() {
    onOpenChange(false)
    setSelected(null)
  }

  function handleDiscard() {
    if (bookingId) onDiscard(bookingId)
    onOpenChange(false)
    setSelected(null)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="options-modal"
        className="p-6 sm:max-w-md sm:p-8"
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle data-testid="options-modal-title" className="text-center text-xl font-bold text-gray-900 sm:text-3xl">
            Please select an option to continue
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-2">
          {/* Reshare Payment Link - Coming Soon */}
          <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-gray-400">
                Reshare Payment Link
              </span>
              <span className="mt-1 text-xs text-gray-400">
                Send the payment link to the same recipient or a different one
              </span>
            </div>
            <span className="rounded-full bg-[var(--client-primary)] px-4 py-1.5 text-xs font-semibold text-white">
              Coming Soon
            </span>
          </div>

          {/* Process Payment on Device */}
          <button
            type="button"
            data-testid="option-process-on-device"
            onClick={() => setSelected("process-on-device")}
            className={`w-full rounded-lg border p-4 text-left transition-colors ${
              selected === "process-on-device"
                ? "border-gray-900 bg-gray-50"
                : "border-gray-200 bg-white hover:bg-gray-50"
            }`}
          >
            <span className="block text-sm font-semibold text-gray-900">
              Process Payment on Device
            </span>
            <span className="block text-xs text-gray-500 mt-1">
              Proceed with the payment on this device
            </span>
          </button>

          {/* Confirm Payment (system_admin + unit_manager) */}
          {canConfirmPayment && (
            <button
              type="button"
              data-testid="option-confirm-payment"
              onClick={() => setSelected("confirm-payment")}
              className={`w-full rounded-lg border p-4 text-left transition-colors ${
                selected === "confirm-payment"
                  ? "border-gray-900 bg-gray-50"
                  : "border-amber-200 bg-amber-50 hover:bg-amber-100"
              }`}
            >
              <span className="block text-sm font-semibold text-gray-900">
                Mark Payment as Confirmed
              </span>
              <span className="mt-1 block text-xs text-gray-600">
                Supervisor override. Use only if you&apos;ve verified the payment on PayFast&apos;s dashboard. Logged to audit trail.
              </span>
            </button>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <Button
            data-testid="options-continue-button"
            className="w-full bg-gray-900 text-white hover:bg-gray-800"
            size="lg"
            disabled={!selected}
            onClick={handleContinue}
          >
            Continue
            <ArrowRight className="ml-1 size-4" />
          </Button>

          <Button
            data-testid="options-cancel-button"
            variant="outline"
            className="w-full border border-black"
            size="lg"
            onClick={handleCancel}
          >
            Cancel
          </Button>

          <button
            type="button"
            data-testid="options-discard-button"
            className="mt-1 text-center text-sm text-red-600 hover:underline"
            onClick={handleDiscard}
          >
            Discard Flow
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// PinVerificationModal is imported from @/components/ui/pin-verification-modal

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PatientHistoryPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { bookings, loading, discardBooking, updateBooking, refreshBookings } = useBookingStore()
  const { isSystemAdmin, isUnitManager, activeUnitId } = useAuth()
  const canConfirmPayment = isSystemAdmin || isUnitManager
  const tabParam = searchParams.get("tab")
  const [activeFilter, setActiveFilter] = React.useState<
    FilterType
  >("all")
  const [searchQuery, setSearchQuery] = React.useState("")

  // Sync filter with URL tab param
  React.useEffect(() => {
    if (tabParam === "in-progress" || tabParam === "incomplete" || tabParam === "completed") {
      setActiveFilter(tabParam as FilterType)
    } else {
      setActiveFilter("all")
    }
  }, [tabParam])
  const [optionsModalOpen, setOptionsModalOpen] = React.useState(false)
  const [selectedBookingId, setSelectedBookingId] = React.useState<string | null>(null)

  // PIN verification modal state — used when a supervisor is manually
  // confirming a payment (requires re-entering their PIN as a second factor).
  const [pinModalOpen, setPinModalOpen] = React.useState(false)
  const [pendingConfirmBookingId, setPendingConfirmBookingId] = React.useState<string | null>(null)

  // PIN verification for the "Start Consult" handoff to CareFirst Patient.
  const [startConsultPinOpen, setStartConsultPinOpen] = React.useState(false)
  const [pendingStartConsultBookingId, setPendingStartConsultBookingId] = React.useState<string | null>(null)
  const [startConsultBusyId, setStartConsultBusyId] = React.useState<string | null>(null)
  const [startConsultError, setStartConsultError] = React.useState<string | null>(null)

  // PayFast reconcile on page mount — catches payments that PayFast's ITN
  // failed to deliver. Admin-only batch mode (server enforces role). Runs
  // once per mount, best-effort; any In-Progress bookings with payment_amount
  // set from the last 2 hours get cross-checked against PayFast's Query API.
  const [reconciling, setReconciling] = React.useState(false)
  const [reconcileMessage, setReconcileMessage] = React.useState<string | null>(null)
  const runReconcile = React.useCallback(async () => {
    if (!isSystemAdmin) return
    setReconciling(true)
    setReconcileMessage(null)
    try {
      const res = await fetch("/api/payfast/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        reconciled?: number
        error?: string
      }
      if (!res.ok) {
        setReconcileMessage(data.error ?? "Reconcile failed")
        return
      }
      if ((data.reconciled ?? 0) > 0) {
        setReconcileMessage(`Reconciled ${data.reconciled} payment(s) from PayFast`)
        await refreshBookings()
      } else {
        setReconcileMessage("No pending payments found on PayFast")
      }
    } catch (err) {
      setReconcileMessage(
        err instanceof Error ? err.message : "Reconcile request failed"
      )
    } finally {
      setReconciling(false)
      // Auto-clear success message after 4s.
      window.setTimeout(() => setReconcileMessage(null), 4000)
    }
  }, [isSystemAdmin, refreshBookings])

  const autoReconcileRan = React.useRef(false)
  React.useEffect(() => {
    if (autoReconcileRan.current) return
    if (!isSystemAdmin) return
    autoReconcileRan.current = true
    runReconcile()
  }, [isSystemAdmin, runReconcile])

  // Map booking records to patient records for display
  const allPatients: PatientRecord[] = bookings.map((b) => ({
    id: b.id,
    status: b.status,
    patientName: [b.firstNames, b.surname].filter(Boolean).join(" ") || "Unknown",
    patientIdNumber: maskIdNumber(b.idNumber),
    patientType: "Cash Reservation",
    date: new Date(b.createdAt).toLocaleString("en-ZA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }),
  }))

  const allCount = countByFilter(allPatients, "all")
  const inProgressCount = countByFilter(allPatients, "in-progress")
  const incompleteCount = countByFilter(allPatients, "incomplete")
  const completedCount = countByFilter(allPatients, "completed")

  const filteredPatients = filterPatients(
    allPatients,
    activeFilter,
    searchQuery
  )

  // Pagination
  const ITEMS_PER_PAGE = 10
  const [currentPage, setCurrentPage] = React.useState(1)
  const totalPages = Math.max(1, Math.ceil(filteredPatients.length / ITEMS_PER_PAGE))

  // Reset to page 1 when filter or search changes
  React.useEffect(() => {
    setCurrentPage(1)
  }, [activeFilter, searchQuery])

  const visiblePatients = filteredPatients.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  )

  return (
    <div data-testid="patient-history-page" className="flex flex-col gap-8">
      {/* Top bar */}
      <div className="flex items-center justify-between rounded-xl bg-white px-6 py-4">
        <Link href="/home">
          <Button
            data-testid="back-button"
            variant="outline"
            size="sm"
            className="rounded-lg border-black px-6 py-2 gap-3"
          >
            <ArrowLeft className="size-4" />
            Back
          </Button>
        </Link>

      </div>

      {/* Heading — on desktop (sm+) the button sits on the right of the title;
          on mobile the button is rendered separately below the subtitle. */}
      <div className="flex items-center justify-between">
        <h1
          data-testid="page-heading"
          className="text-2xl font-bold text-gray-900 sm:text-3xl"
        >
          Patient History
        </h1>
        <Link href="/create-booking" className="hidden sm:inline-flex">
          <Button
            data-testid="new-patient-button"
            className="justify-center gap-2 rounded-xl bg-[var(--client-primary)] px-8 py-6 text-sm font-medium text-white hover:bg-[var(--client-primary-90)]"
            size="lg"
          >
            New Patient
            <Plus className="ml-3 size-4" />
          </Button>
        </Link>
      </div>
      <p
        data-testid="page-subtitle"
        className="-mt-6 text-base text-gray-500"
      >
        Please provide the patient&apos;s identification details
      </p>

      {/* Reconcile with PayFast — admin only. Visible button so admins can
          manually re-check when they see bookings stuck in "In Progress"
          after a payment. */}
      {isSystemAdmin && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            data-testid="reconcile-payfast-button"
            variant="outline"
            size="sm"
            disabled={reconciling}
            onClick={runReconcile}
            className="rounded-lg border-black gap-2"
          >
            {reconciling ? (
              <>
                Checking PayFast…
                <svg className="ml-1 size-4 animate-spin" viewBox="0 0 40 40" fill="none">
                  <circle cx="20" cy="20" r="15" stroke="#d1d5db" strokeWidth="5" strokeLinecap="round" />
                  <circle cx="20" cy="20" r="15" stroke="var(--client-primary)" strokeWidth="5" strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset="70" />
                </svg>
              </>
            ) : (
              "Check PayFast for new payments"
            )}
          </Button>
          {reconcileMessage && (
            <span
              data-testid="reconcile-message"
              className="text-xs text-gray-600"
            >
              {reconcileMessage}
            </span>
          )}
        </div>
      )}

      {/* Mobile-only primary action */}
      <Link href="/create-booking" className="sm:hidden">
        <Button
          data-testid="new-patient-button-mobile"
          className="w-full justify-center gap-2 rounded-xl bg-[var(--client-primary)] px-6 py-5 text-sm font-medium text-white hover:bg-[var(--client-primary-90)]"
          size="lg"
        >
          New Patient
          <Plus className="ml-3 size-4" />
        </Button>
      </Link>

      {/* Filters + Search */}
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div
          data-testid="filter-tabs"
          className="flex flex-wrap items-center gap-2"
        >
          <button
            type="button"
            data-testid="filter-all"
            onClick={() => router.push("/patient-history")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeFilter === "all"
                ? "bg-[var(--client-primary)] text-white"
                : "text-gray-600 hover:bg-gray-200"
            }`}
          >
            All
            <span
              className={`inline-flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-semibold ${
                activeFilter === "all"
                  ? "bg-white text-gray-900"
                  : "bg-gray-300 text-gray-700"
              }`}
            >
              {allCount}
            </span>
          </button>

          <button
            type="button"
            data-testid="filter-in-progress"
            onClick={() => router.push("/patient-history?tab=in-progress")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeFilter === "in-progress"
                ? "bg-[var(--client-primary)] text-white"
                : "text-gray-600 hover:bg-gray-200"
            }`}
          >
            In Progress
            <span
              className={`inline-flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-semibold ${
                activeFilter === "in-progress"
                  ? "bg-white text-gray-900"
                  : "bg-gray-300 text-gray-700"
              }`}
            >
              {inProgressCount}
            </span>
          </button>

          <button
            type="button"
            data-testid="filter-incomplete"
            onClick={() => router.push("/patient-history?tab=incomplete")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeFilter === "incomplete"
                ? "bg-[var(--client-primary)] text-white"
                : "text-gray-600 hover:bg-gray-200"
            }`}
          >
            Incomplete
            <span
              className={`inline-flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-semibold ${
                activeFilter === "incomplete"
                  ? "bg-white text-gray-900"
                  : "bg-gray-300 text-gray-700"
              }`}
            >
              {incompleteCount}
            </span>
          </button>

          <button
            type="button"
            data-testid="filter-completed"
            onClick={() => router.push("/patient-history?tab=completed")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeFilter === "completed"
                ? "bg-[var(--client-primary)] text-white"
                : "text-gray-600 hover:bg-gray-200"
            }`}
          >
            Completed
            <span
              className={`inline-flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-semibold ${
                activeFilter === "completed"
                  ? "bg-white text-gray-900"
                  : "bg-gray-300 text-gray-700"
              }`}
            >
              {completedCount}
            </span>
          </button>
        </div>

        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
          <Input
            data-testid="search-input"
            type="text"
            placeholder="Search Patient Name or ID Number"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-white py-2 pl-8"
            aria-label="Search Patient Name or ID Number"
          />
        </div>
      </div>

      {/* Patient Cards */}
      <div data-testid="patient-table" className="flex min-w-0 flex-col gap-3 overflow-x-auto">
        {loading ? (
          <div className="flex h-24 items-center justify-center rounded-xl bg-white text-gray-400">
            Loading bookings...
          </div>
        ) : visiblePatients.length === 0 ? (
          <div
            className="flex h-24 items-center justify-center rounded-xl bg-white text-gray-400"
            data-testid="empty-state"
          >
            No patients found
          </div>
        ) : (
          visiblePatients.map((patient) => {
            const statusBadge = (
              <Badge
                data-testid={`status-badge-${patient.id}`}
                className={`w-full rounded-full border px-4 py-5 text-center text-xs font-medium ${getStatusStyle(patient.status)}`}
              >
                {patient.status === "Abandoned" ? "Incomplete Booking" : patient.status}
              </Badge>
            )

            const actionButton =
              patient.status === "Payment Complete" ? (
                <Button
                  data-testid={`start-consult-${patient.id}`}
                  className="w-full justify-center gap-2 rounded-xl bg-gray-900 px-4 py-5 text-sm font-medium text-white hover:bg-gray-800"
                  size="lg"
                  disabled={startConsultBusyId === patient.id}
                  onClick={() => {
                    setStartConsultError(null)
                    setPendingStartConsultBookingId(patient.id)
                    setStartConsultPinOpen(true)
                  }}
                >
                  {startConsultBusyId === patient.id ? (
                    <>
                      Starting…
                      <svg className="ml-1 size-4 animate-spin" viewBox="0 0 40 40" fill="none">
                        <circle cx="20" cy="20" r="15" stroke="#6b7280" strokeWidth="5" strokeLinecap="round" />
                        <circle cx="20" cy="20" r="15" stroke="white" strokeWidth="5" strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset="70" />
                      </svg>
                    </>
                  ) : (
                    "Start Consult"
                  )}
                </Button>
              ) : patient.status === "Abandoned" ? (
                (() => {
                  // If the abandoned booking reached the payment step
                  // (paymentType is set) AND the viewer is an admin/manager,
                  // expose the Options modal so they can mark payment as
                  // confirmed (PayFast may have completed the payment even
                  // though we never saw the ITN). Everyone else sees the
                  // normal Continue button.
                  const fullBooking = bookings.find((b) => b.id === patient.id)
                  const reachedPayment = Boolean(fullBooking?.paymentType)
                  const showOptions = canConfirmPayment && reachedPayment

                  if (showOptions) {
                    return (
                      <Button
                        data-testid={`options-button-${patient.id}`}
                        className="w-full justify-center gap-2 rounded-xl bg-gray-900 px-4 py-5 text-sm font-medium text-white hover:bg-gray-800"
                        size="lg"
                        onClick={() => {
                          setSelectedBookingId(patient.id)
                          setOptionsModalOpen(true)
                        }}
                      >
                        Options
                        <MoreVertical className="ml-3 size-4" />
                      </Button>
                    )
                  }

                  return (
                    <Button
                      data-testid={`continue-button-${patient.id}`}
                      className="w-full justify-center gap-2 rounded-xl bg-gray-900 px-4 py-5 text-sm font-medium text-white hover:bg-gray-800"
                      size="lg"
                      onClick={() => {
                        // Resume booking from the start with pre-filled data
                        const params = new URLSearchParams()
                        params.set("bookingId", patient.id)
                        params.set("searchType", "id")
                        if (patient.patientIdNumber && patient.patientIdNumber !== "N/A") {
                          // Use the raw (unmasked) ID from the booking
                          const booking = bookings.find((b) => b.id === patient.id)
                          if (booking?.idNumber) {
                            params.set("idNumber", booking.idNumber)
                          }
                        }
                        // Update booking status back to In Progress
                        updateBooking(patient.id, { status: "In Progress" })
                        router.push(`/create-booking/patient-details?${params.toString()}`)
                      }}
                    >
                      Continue
                      <ArrowRight className="ml-1 size-4" />
                    </Button>
                  )
                })()
              ) : patient.status === "In Progress" ? (
                <Button
                  data-testid={`options-button-${patient.id}`}
                  className="w-full justify-center gap-2 rounded-xl bg-gray-900 px-4 py-5 text-sm font-medium text-white hover:bg-gray-800"
                  size="lg"
                  onClick={() => {
                    setSelectedBookingId(patient.id)
                    setOptionsModalOpen(true)
                  }}
                >
                  Options
                  <MoreVertical className="ml-3 size-4" />
                </Button>
              ) : null

            return (
              <React.Fragment key={patient.id}>
                {/* Mobile / tablet card — below md: */}
                <div className="md:hidden">
                  <DataCard
                    data-testid={`patient-card-${patient.id}`}
                    status={statusBadge}
                    action={actionButton ?? <span className="text-xs text-gray-400">—</span>}
                    fields={[
                      { label: "Patient Name", value: patient.patientName },
                      { label: "Patient ID Number", value: patient.patientIdNumber },
                      { label: "Patient Type", value: patient.patientType },
                      { label: "Date", value: patient.date },
                    ]}
                  />
                </div>

                {/* Desktop row — md: and up. Existing layout, unchanged. */}
                <div
                  data-testid={`patient-row-${patient.id}`}
                  className="hidden md:grid grid-cols-[160px_1fr_1fr_1fr_1fr_140px] items-center gap-8 rounded-xl bg-white px-6 py-5"
                >
                  {/* Status badge */}
                  <div className="flex items-center">{statusBadge}</div>

                  {/* Patient Name */}
                  <div className="flex min-w-0 flex-col gap-0.5 text-left">
                    <span className="text-xs font-bold text-gray-900">Patient Name</span>
                    <span className="truncate text-sm text-gray-600" title={patient.patientName}>{patient.patientName}</span>
                  </div>

                  {/* Patient ID Number */}
                  <div className="flex min-w-0 flex-col gap-0.5 text-left">
                    <span className="text-xs font-bold text-gray-900">Patient ID Number</span>
                    <span className="truncate text-sm text-gray-600" title={patient.patientIdNumber}>{patient.patientIdNumber}</span>
                  </div>

                  {/* Patient Type */}
                  <div className="flex min-w-0 flex-col gap-0.5 text-left">
                    <span className="text-xs font-bold text-gray-900">Patient Type</span>
                    <span className="truncate text-sm text-gray-600" title={patient.patientType}>{patient.patientType}</span>
                  </div>

                  {/* Date */}
                  <div className="flex min-w-0 flex-col gap-0.5 text-left">
                    <span className="text-xs font-bold text-gray-900">Date</span>
                    <span className="truncate text-sm text-gray-600" title={patient.date}>{patient.date}</span>
                  </div>

                  {/* Action */}
                  <div className="flex">{actionButton}</div>
                </div>
              </React.Fragment>
            )
          })
        )}
      </div>

      {/* Pagination */}
      {filteredPatients.length > ITEMS_PER_PAGE && (
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
          <p className="text-sm text-gray-500">
            Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filteredPatients.length)} of {filteredPatients.length}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className={`flex size-9 items-center justify-center rounded-lg border transition-colors ${
                currentPage === 1
                  ? "border-gray-200 text-gray-300 cursor-not-allowed"
                  : "border-gray-300 text-gray-600 hover:bg-gray-100"
              }`}
            >
              <ChevronLeft className="size-4" />
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                type="button"
                onClick={() => setCurrentPage(page)}
                className={`flex size-9 items-center justify-center rounded-lg text-sm font-medium transition-colors ${
                  page === currentPage
                    ? "bg-[var(--client-primary)] text-white"
                    : "border border-gray-300 text-gray-600 hover:bg-gray-100"
                }`}
              >
                {page}
              </button>
            ))}

            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className={`flex size-9 items-center justify-center rounded-lg border transition-colors ${
                currentPage === totalPages
                  ? "border-gray-200 text-gray-300 cursor-not-allowed"
                  : "border-gray-300 text-gray-600 hover:bg-gray-100"
              }`}
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      )}

      {/* Back Home button */}
      <div className="flex justify-center pb-4">
        <Link href="/home">
          <Button
            data-testid="back-home-button"
            className="w-[250px] justify-center gap-2 rounded-xl bg-gray-900 py-6 text-sm font-medium text-white hover:bg-gray-800"
            size="lg"
          >
            Back Home
          </Button>
        </Link>
      </div>

      {/* Options Modal */}
      <OptionsModal
        open={optionsModalOpen}
        onOpenChange={setOptionsModalOpen}
        bookingId={selectedBookingId}
        canConfirmPayment={canConfirmPayment}
        onDiscard={async (id) => {
          await discardBooking(id)
        }}
        onRequestConfirmPayment={(id) => {
          // User picked "Mark Payment as Confirmed" — open PIN verification.
          setPendingConfirmBookingId(id)
          setPinModalOpen(true)
        }}
      />

      {/* PIN Verification Modal — gates manual payment confirmation */}
      <PinVerificationModal
        open={pinModalOpen}
        onOpenChange={(o) => {
          setPinModalOpen(o)
          if (!o) setPendingConfirmBookingId(null)
        }}
        activeUnitId={activeUnitId}
        heading="Enter your verification code to confirm payment"
        subtitle="This will mark the booking as paid and be recorded in the audit log."
        onVerified={async () => {
          if (!pendingConfirmBookingId) return
          const res = await fetch(
            `/api/bookings/${pendingConfirmBookingId}/complete-payment`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
            }
          )
          const data = await res.json().catch(() => ({}))
          if (!res.ok) {
            throw new Error(data.error ?? "Failed to confirm payment")
          }
          await refreshBookings()
          setPendingConfirmBookingId(null)
        }}
      />

      {/* PIN Verification Modal — gates Start Consult handoff to CareFirst Patient */}
      <PinVerificationModal
        open={startConsultPinOpen}
        onOpenChange={(o) => {
          setStartConsultPinOpen(o)
          if (!o) setPendingStartConsultBookingId(null)
        }}
        activeUnitId={activeUnitId}
        heading="Enter your verification code to start the consultation"
        subtitle="This will hand off the patient's data to CareFirst Patient and be recorded in the audit log."
        onVerified={async () => {
          const bookingId = pendingStartConsultBookingId
          if (!bookingId) return
          setStartConsultBusyId(bookingId)
          setStartConsultError(null)
          try {
            const res = await fetch(
              `/api/bookings/${bookingId}/start-consultation`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
              }
            )
            const data = (await res.json().catch(() => ({}))) as {
              ok?: boolean
              redirectUrl?: string | null
              error?: string
            }
            if (!res.ok || !data.ok) {
              throw new Error(
                data.error ?? "Failed to start consultation. Please try again."
              )
            }
            await refreshBookings()
            if (data.redirectUrl) {
              window.open(data.redirectUrl, "_blank", "noopener,noreferrer")
            } else {
              setStartConsultError(
                "Consultation registered but CareFirst did not return a redirect URL. Please contact support."
              )
            }
          } catch (err) {
            setStartConsultError(
              err instanceof Error ? err.message : "Failed to start consultation."
            )
            throw err
          } finally {
            setStartConsultBusyId(null)
            setPendingStartConsultBookingId(null)
          }
        }}
      />

      {/* Start Consult error banner */}
      {startConsultError && (
        <div
          data-testid="start-consult-error"
          className="fixed bottom-24 left-1/2 z-50 w-[min(90vw,32rem)] -translate-x-1/2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-lg"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold">Start Consult failed</div>
              <div className="mt-1 text-xs">{startConsultError}</div>
            </div>
            <button
              type="button"
              onClick={() => setStartConsultError(null)}
              className="text-red-500 hover:text-red-700"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Export to Excel - System Admin only */}
      {isSystemAdmin && (
        <button
          type="button"
          onClick={() => {
            const exportData = bookings.map((b) => ({
              "Patient Name": [b.firstNames, b.surname].filter(Boolean).join(" ") || "Unknown",
              "ID Number": b.idNumber || "N/A",
              "ID Type": b.idType || "",
              "Status": b.status,
              "Date": new Date(b.createdAt).toLocaleString("en-ZA"),
              "Gender": b.gender || "",
              "Date of Birth": b.dateOfBirth || "",
              "Contact Number": b.contactNumber || "",
              "Email": b.emailAddress || "",
              "Address": [b.address, b.suburb, b.city, b.province, b.postalCode].filter(Boolean).join(", "),
              "Payment Type": b.paymentType || "",
              "Blood Pressure": b.bloodPressure || "",
              "Glucose": b.glucose || "",
              "Temperature": b.temperature || "",
              "Oxygen Saturation": b.oxygenSaturation || "",
              "Heart Rate": b.heartRate || "",
              "Terms Accepted": b.termsAccepted ? "Yes" : "No",
            }))

            const ws = XLSX.utils.json_to_sheet(exportData)
            const wb = XLSX.utils.book_new()
            XLSX.utils.book_append_sheet(wb, ws, "Patient History")
            XLSX.writeFile(wb, `patient-history-${new Date().toISOString().slice(0, 10)}.xlsx`)
          }}
          className="fixed bottom-8 right-8 flex items-center gap-2 rounded-full bg-[var(--client-primary)] px-6 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:bg-[var(--client-primary-90)] hover:shadow-xl"
        >
          <Download className="size-4" />
          Export to Excel
        </button>
      )}
    </div>
  )
}
