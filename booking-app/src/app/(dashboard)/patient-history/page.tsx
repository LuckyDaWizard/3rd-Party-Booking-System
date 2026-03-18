"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowLeft, Search, Plus, ArrowRight, MoreVertical } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PatientStatus =
  | "Payment Complete"
  | "Payment Incomplete"
  | "Successful"
  | "Discarded"

interface PatientRecord {
  id: string
  status: PatientStatus
  patientName: string
  patientIdNumber: string
  patientType: string
  date: string
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_PATIENTS: PatientRecord[] = [
  {
    id: "1",
    status: "Payment Complete",
    patientName: "M S Junkoon",
    patientIdNumber: "97XXXXXXXXX81",
    patientType: "Cash Reservation",
    date: "2024-03-13 11:44",
  },
  {
    id: "2",
    status: "Payment Incomplete",
    patientName: "A B Naidoo",
    patientIdNumber: "85XXXXXXXXX42",
    patientType: "Cash Reservation",
    date: "2024-03-13 10:30",
  },
  {
    id: "3",
    status: "Successful",
    patientName: "J K Mokoena",
    patientIdNumber: "90XXXXXXXXX17",
    patientType: "Cash Reservation",
    date: "2024-03-12 15:22",
  },
  {
    id: "4",
    status: "Payment Complete",
    patientName: "T R Singh",
    patientIdNumber: "88XXXXXXXXX63",
    patientType: "Cash Reservation",
    date: "2024-03-12 09:15",
  },
  {
    id: "5",
    status: "Discarded",
    patientName: "L M van Wyk",
    patientIdNumber: "93XXXXXXXXX55",
    patientType: "Cash Reservation",
    date: "2024-03-11 14:08",
  },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getStatusStyle(status: PatientStatus): string {
  switch (status) {
    case "Payment Complete":
      return "bg-yellow-100 text-yellow-700 border-transparent"
    case "Payment Incomplete":
      return "bg-pink-100 text-pink-600 border-transparent"
    case "Successful":
      return "bg-green-100 text-green-600 border-transparent"
    case "Discarded":
      return "bg-gray-900 text-white border-transparent"
  }
}

function countByFilter(
  patients: PatientRecord[],
  filter: "all" | "in-progress" | "completed"
): number {
  if (filter === "all") return patients.length
  if (filter === "in-progress")
    return patients.filter(
      (p) =>
        p.status === "Payment Complete" || p.status === "Payment Incomplete"
    ).length
  // completed
  return patients.filter(
    (p) => p.status === "Successful" || p.status === "Discarded"
  ).length
}

function filterPatients(
  patients: PatientRecord[],
  filter: "all" | "in-progress" | "completed",
  search: string
): PatientRecord[] {
  let filtered = patients

  if (filter === "in-progress") {
    filtered = filtered.filter(
      (p) =>
        p.status === "Payment Complete" || p.status === "Payment Incomplete"
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
}

type OptionChoice = "reshare" | "process-on-device" | null

function OptionsModal({ open, onOpenChange }: OptionsModalProps) {
  const [selected, setSelected] = React.useState<OptionChoice>(null)

  function handleContinue() {
    if (!selected) return
    // Placeholder: navigate or perform action based on selection
    onOpenChange(false)
    setSelected(null)
  }

  function handleCancel() {
    onOpenChange(false)
    setSelected(null)
  }

  function handleDiscard() {
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
  const [activeFilter, setActiveFilter] = React.useState<
    "all" | "in-progress" | "completed"
  >("all")
  const [searchQuery, setSearchQuery] = React.useState("")
  const [optionsModalOpen, setOptionsModalOpen] = React.useState(false)

  const allCount = countByFilter(MOCK_PATIENTS, "all")
  const inProgressCount = countByFilter(MOCK_PATIENTS, "in-progress")
  const completedCount = countByFilter(MOCK_PATIENTS, "completed")

  const visiblePatients = filterPatients(
    MOCK_PATIENTS,
    activeFilter,
    searchQuery
  )

  return (
    <div data-testid="patient-history-page" className="flex flex-col gap-8">
      {/* Top bar */}
      <div className="flex items-center justify-between rounded-xl bg-white px-6 py-4">
        <Link href="/">
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
        <Button
          data-testid="new-patient-button"
          className="w-auto justify-center gap-2 rounded-xl bg-[#3ea3db] px-8 py-6 text-sm font-medium text-white hover:bg-[#3ea3db]/90"
          size="lg"
        >
          New Patient
          <Plus className="ml-3 size-4" />
        </Button>
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
            onClick={() => setActiveFilter("all")}
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
            onClick={() => setActiveFilter("in-progress")}
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
            data-testid="filter-completed"
            onClick={() => setActiveFilter("completed")}
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
        {visiblePatients.length === 0 ? (
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
                  {patient.status}
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
                ) : patient.status !== "Discarded" ? (
                  <Button
                    data-testid={`options-button-${patient.id}`}
                    className="w-full justify-center gap-2 rounded-xl bg-gray-900 px-4 py-5 text-sm font-medium text-white hover:bg-gray-800"
                    size="lg"
                    onClick={() => setOptionsModalOpen(true)}
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

      {/* Back Home button */}
      <div className="flex justify-center pb-4">
        <Link href="/">
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
      />
    </div>
  )
}
