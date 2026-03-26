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
      return "bg-yellow-100 text-yellow-700 border-transparent"
    case "In Progress":
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
}

type OptionChoice = "reshare" | "process-on-device" | null

function OptionsModal({ open, onOpenChange, bookingId, onDiscard }: OptionsModalProps) {
  const router = useRouter()
  const [selected, setSelected] = React.useState<OptionChoice>(null)

  function handleContinue() {
    if (!selected || !bookingId) return
    onOpenChange(false)
    setSelected(null)

    if (selected === "process-on-device") {
      router.push(`/create-booking/payment?bookingId=${bookingId}&type=device`)
    }
    // TODO: handle "reshare" option
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
        className="sm:max-w-md p-8"
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle data-testid="options-modal-title" className="text-3xl font-bold text-gray-900 text-center">
            Please select an option to continue
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-2">
          {/* Reshare Payment Link */}
          <button
            type="button"
            data-testid="option-reshare"
            onClick={() => setSelected("reshare")}
            className={`w-full rounded-lg border p-4 text-left transition-colors ${
              selected === "reshare"
                ? "border-gray-900 bg-gray-50"
                : "border-gray-200 bg-white hover:bg-gray-50"
            }`}
          >
            <span className="block text-sm font-semibold text-gray-900">
              Reshare Payment Link
            </span>
            <span className="block text-xs text-gray-500 mt-1">
              Send the payment link to the same recipient or a different one
            </span>
          </button>

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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PatientHistoryPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { bookings, loading, discardBooking, updateBooking } = useBookingStore()
  const { isSystemAdmin } = useAuth()
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

      {/* Heading */}
      <div className="flex items-center justify-between">
        <h1
          data-testid="page-heading"
          className="text-3xl font-bold text-gray-900"
        >
          Patient History
        </h1>
        <Link href="/create-booking">
          <Button
            data-testid="new-patient-button"
            className="w-auto justify-center gap-2 rounded-xl bg-[#3ea3db] px-8 py-6 text-sm font-medium text-white hover:bg-[#3ea3db]/90"
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

      {/* Filters + Search */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div
          data-testid="filter-tabs"
          className="flex items-center gap-2"
        >
          <button
            type="button"
            data-testid="filter-all"
            onClick={() => router.push("/patient-history")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeFilter === "all"
                ? "bg-[#3ea3db] text-white"
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
                ? "bg-[#3ea3db] text-white"
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
                ? "bg-[#3ea3db] text-white"
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
                ? "bg-[#3ea3db] text-white"
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

        <div className="relative w-full max-w-xs">
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
          visiblePatients.map((patient) => (
            <div
              key={patient.id}
              data-testid={`patient-row-${patient.id}`}
              className="grid grid-cols-[160px_1fr_1fr_1fr_1fr_140px] items-center gap-8 rounded-xl bg-white px-6 py-5"
            >
              {/* Status badge */}
              <div className="flex items-center">
                <Badge
                  data-testid={`status-badge-${patient.id}`}
                  className={`w-full rounded-full border px-4 py-5 text-center text-xs font-medium ${getStatusStyle(patient.status)}`}
                >
                  {patient.status === "Abandoned" ? "Incomplete Booking" : patient.status}
                </Badge>
              </div>

              {/* Patient Name */}
              <div className="flex flex-col gap-0.5 text-left">
                <span className="text-xs font-bold text-gray-900">Patient Name</span>
                <span className="truncate text-sm text-gray-600">{patient.patientName}</span>
              </div>

              {/* Patient ID Number */}
              <div className="flex flex-col gap-0.5 text-left">
                <span className="text-xs font-bold text-gray-900">Patient ID Number</span>
                <span className="truncate text-sm text-gray-600">{patient.patientIdNumber}</span>
              </div>

              {/* Patient Type */}
              <div className="flex flex-col gap-0.5 text-left">
                <span className="text-xs font-bold text-gray-900">Patient Type</span>
                <span className="truncate text-sm text-gray-600">{patient.patientType}</span>
              </div>

              {/* Date */}
              <div className="flex flex-col gap-0.5 text-left">
                <span className="text-xs font-bold text-gray-900">Date</span>
                <span className="truncate text-sm text-gray-600">{patient.date}</span>
              </div>

              {/* Action */}
              <div className="flex">
                {patient.status === "Payment Complete" ? (
                  <Button
                    data-testid={`start-consult-${patient.id}`}
                    className="w-full justify-center gap-2 rounded-xl bg-gray-900 px-4 py-5 text-sm font-medium text-white hover:bg-gray-800"
                    size="lg"
                  >
                    Start Consult
                  </Button>
                ) : patient.status === "Abandoned" ? (
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
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {filteredPatients.length > ITEMS_PER_PAGE && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filteredPatients.length)} of {filteredPatients.length}
          </p>
          <div className="flex items-center gap-2">
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
                    ? "bg-[#3ea3db] text-white"
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
        onDiscard={async (id) => {
          await discardBooking(id)
        }}
      />

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
          className="fixed bottom-8 right-8 flex items-center gap-2 rounded-full bg-[#3ea3db] px-6 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:bg-[#3ea3db]/90 hover:shadow-xl"
        >
          <Download className="size-4" />
          Export to Excel
        </button>
      )}
    </div>
  )
}
