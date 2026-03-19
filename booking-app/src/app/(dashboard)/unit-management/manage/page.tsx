"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, ArrowRight, X, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { useUnitStore } from "@/lib/unit-store"
import { useClientStore } from "@/lib/client-store"

// ---------------------------------------------------------------------------
// Floating Input Component
// ---------------------------------------------------------------------------

function FloatingInput({
  id,
  label,
  value,
  onChange,
  onClear,
  type = "text",
  "data-testid": dataTestId,
  className = "",
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  onClear: () => void
  type?: string
  "data-testid"?: string
  className?: string
}) {
  const hasValue = value.length > 0

  return (
    <div className={`relative ${className}`}>
      <input
        id={id}
        data-testid={dataTestId}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder=" "
        className="peer h-14 w-full rounded-lg border border-gray-300 bg-white px-4 py-4 text-sm text-gray-900 outline-none transition-colors focus:border-gray-900 focus:bg-white active:bg-white autofill:bg-white"
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
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-gray-400 hover:text-gray-600"
          aria-label={`Clear ${label}`}
        >
          <X className="size-4" />
        </button>
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
// Provinces
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ManageUnitPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const unitId = searchParams.get("id") ?? ""
  const { getUnit, updateUnit, deleteUnit, toggleUnitStatus } = useUnitStore()
  const { clients } = useClientStore()

  const unit = getUnit(unitId)

  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [isStatusOpen, setIsStatusOpen] = useState(false)
  const [clientId, setClientId] = useState("")
  const [unitName, setUnitName] = useState("")
  const [contactPersonName, setContactPersonName] = useState("")
  const [contactPersonSurname, setContactPersonSurname] = useState("")
  const [emailAddress, setEmailAddress] = useState("")
  const [province, setProvince] = useState("")

  useEffect(() => {
    if (unit) {
      setClientId(unit.clientId)
      setUnitName(unit.unitName)
      setContactPersonName(unit.contactPersonName)
      setContactPersonSurname(unit.contactPersonSurname)
      setEmailAddress(unit.email)
      setProvince(unit.province)
    }
  }, [unit])

  if (!unit) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-gray-500">Unit not found</p>
      </div>
    )
  }

  async function handleUpdateInformation() {
    await updateUnit(unitId, {
      unitName,
      clientId,
      contactPersonName,
      contactPersonSurname,
      email: emailAddress,
      province,
    })
    router.push("/unit-management")
  }

  async function handleToggleStatus() {
    const wasActive = unit!.status === "Active"
    const name = unit!.unitName
    await toggleUnitStatus(unitId)
    const params = new URLSearchParams({
      statusChanged: wasActive ? "disabled" : "activated",
      unitName: name,
    })
    router.push(`/unit-management?${params.toString()}`)
  }

  async function handleDeleteUnit() {
    await deleteUnit(unitId)
    const params = new URLSearchParams({
      deleted: unit!.unitName,
    })
    router.push(`/unit-management?${params.toString()}`)
  }

  // Build client options for the dropdown
  const clientOptions = clients.map((c) => ({
    value: c.id,
    label: c.clientName,
  }))

  return (
    <div
      data-testid="manage-unit-page"
      className="flex flex-1 flex-col"
    >
      {/* Top bar */}
      <div className="flex items-center justify-between rounded-xl bg-white px-6 py-4">
        <Button
          data-testid="top-back-button"
          variant="outline"
          size="sm"
          onClick={() => router.push("/unit-management")}
          className="rounded-lg border-black px-6 py-2 gap-3"
        >
          <ArrowLeft className="size-4" />
          Back
        </Button>

        <Button
          data-testid="delete-unit-button"
          size="sm"
          onClick={() => setIsDeleteOpen(true)}
          className="rounded-lg bg-[#FF3A69] px-6 py-2 text-white hover:bg-[#FF3A69]/90"
        >
          Delete Unit
        </Button>
      </div>

      {/* Content area */}
      <div className="flex flex-1 flex-col items-center justify-center gap-8 py-8">
        {/* Heading */}
        <div className="flex flex-col items-center gap-1 text-center">
          <h1
            data-testid="page-heading"
            className="text-3xl font-bold text-gray-900"
          >
            Manage {unit.unitName}
          </h1>
          <p className="text-base text-gray-500">
            Manage the unit&apos;s client and information below
          </p>
        </div>

        {/* Form */}
        <div className="flex w-full max-w-md flex-col gap-4">
          {/* Client dropdown */}
          <FloatingSelect
            id="client"
            data-testid="select-client"
            label="Client"
            value={clientId}
            onChange={setClientId}
            options={clientOptions}
          />

          {/* Unit Name */}
          <FloatingInput
            id="unit-name"
            data-testid="input-unit-name"
            label="Unit Name"
            value={unitName}
            onChange={setUnitName}
            onClear={() => setUnitName("")}
          />

          {/* Contact Person Name + Surname */}
          <div className="flex w-full gap-4">
            <FloatingInput
              id="contact-person-name"
              data-testid="input-contact-person-name"
              label="Contact Person Name"
              value={contactPersonName}
              onChange={setContactPersonName}
              onClear={() => setContactPersonName("")}
              className="flex-1"
            />
            <FloatingInput
              id="contact-person-surname"
              data-testid="input-contact-person-surname"
              label="Contact Person Surname"
              value={contactPersonSurname}
              onChange={setContactPersonSurname}
              onClear={() => setContactPersonSurname("")}
              className="flex-1"
            />
          </div>

          {/* Email */}
          <FloatingInput
            id="email-address"
            data-testid="input-email"
            label="Email"
            type="email"
            value={emailAddress}
            onChange={setEmailAddress}
            onClear={() => setEmailAddress("")}
          />

          {/* Province */}
          <FloatingSelect
            id="province"
            data-testid="select-province"
            label="Province"
            value={province}
            onChange={setProvince}
            options={PROVINCES.map((p) => ({ value: p, label: p }))}
          />
        </div>

        {/* Actions */}
        <div className="flex w-full max-w-md flex-col items-center gap-3">
          <Button
            data-testid="update-button"
            onClick={handleUpdateInformation}
            className="h-11 w-full rounded-xl bg-gray-300 text-gray-600 hover:bg-gray-900 hover:text-white"
          >
            Update Information
            <ArrowRight className="ml-1 size-4" />
          </Button>

          <Button
            data-testid="disable-unit-button"
            variant="outline"
            onClick={() => setIsStatusOpen(true)}
            className="h-11 w-full rounded-xl border border-black"
          >
            {unit.status === "Active" ? "Disable Unit" : "Activate Unit"}
          </Button>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="rounded-2xl p-8">
          <DialogHeader className="flex flex-col items-center gap-2 text-center">
            <DialogTitle className="text-2xl font-bold text-gray-900">
              Are you sure you want to delete {unit.unitName}?
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-500">
              Deleting this unit will permanently remove all associated records.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-3 pt-4">
            <Button
              data-testid="confirm-delete-button"
              onClick={handleDeleteUnit}
              className="h-11 w-full rounded-xl bg-gray-900 text-white hover:bg-gray-800"
            >
              Yes, delete unit
              <ArrowRight className="ml-1 size-4" />
            </Button>

            <Button
              data-testid="disable-instead-button"
              variant="outline"
              onClick={async () => {
                setIsDeleteOpen(false)
                const name = unit!.unitName
                await toggleUnitStatus(unitId)
                const params = new URLSearchParams({
                  statusChanged: "disabled",
                  unitName: name,
                })
                router.push(`/unit-management?${params.toString()}`)
              }}
              className="h-11 w-full rounded-xl border border-black"
            >
              Disable unit instead
            </Button>

            <button
              type="button"
              data-testid="cancel-delete-button"
              onClick={() => setIsDeleteOpen(false)}
              className="text-sm font-medium text-[#FF3A69] hover:text-[#FF3A69]/80"
            >
              Cancel
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Disable / Activate Confirmation Dialog */}
      <Dialog open={isStatusOpen} onOpenChange={setIsStatusOpen}>
        <DialogContent className="rounded-2xl p-8">
          <DialogHeader className="flex flex-col items-center gap-2 text-center">
            <DialogTitle className="text-2xl font-bold text-gray-900">
              {unit.status === "Active" ? "Disable" : "Activate"} {unit.unitName}?
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-500">
              {unit.status === "Active"
                ? "Disabling this unit will restrict access for all associated users. This can be reversed."
                : "Activating this unit will restore system access and permissions."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-3 pt-4">
            <Button
              data-testid="confirm-status-button"
              onClick={async () => {
                setIsStatusOpen(false)
                await handleToggleStatus()
              }}
              className="h-11 w-full rounded-xl bg-gray-900 text-white hover:bg-gray-800"
            >
              Yes, {unit.status === "Active" ? "disable" : "activate"} unit
              <ArrowRight className="ml-1 size-4" />
            </Button>

            <button
              type="button"
              data-testid="cancel-status-button"
              onClick={() => setIsStatusOpen(false)}
              className="text-sm font-medium text-[#FF3A69] hover:text-[#FF3A69]/80"
            >
              Cancel
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
