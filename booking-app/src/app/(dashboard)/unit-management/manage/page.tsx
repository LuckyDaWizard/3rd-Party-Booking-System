"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { FloatingInput } from "@/components/ui/floating-input"
import { FloatingSelect } from "@/components/ui/floating-select"
import { useUnitStore } from "@/lib/unit-store"
import { useClientStore } from "@/lib/client-store"

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
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [toggling, setToggling] = useState(false)
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
    setSaving(true)
    try {
      await updateUnit(unitId, {
        unitName,
        clientId,
        contactPersonName,
        contactPersonSurname,
        email: emailAddress,
        province,
      })
      router.push("/unit-management")
    } catch {
      setSaving(false)
    }
  }

  async function handleToggleStatus() {
    setToggling(true)
    try {
      const wasActive = unit!.status === "Active"
      const name = unit!.unitName
      await toggleUnitStatus(unitId)
      const params = new URLSearchParams({
        statusChanged: wasActive ? "disabled" : "activated",
        unitName: name,
      })
      router.push(`/unit-management?${params.toString()}`)
    } catch {
      setToggling(false)
    }
  }

  async function handleDeleteUnit() {
    setDeleting(true)
    try {
      await deleteUnit(unitId)
      const params = new URLSearchParams({
        deleted: unit!.unitName,
      })
      router.push(`/unit-management?${params.toString()}`)
    } catch {
      setDeleting(false)
    }
  }

  // Check if any field has changed from the original
  const hasChanges = unit ? (
    clientId !== unit.clientId ||
    unitName !== unit.unitName ||
    contactPersonName !== unit.contactPersonName ||
    contactPersonSurname !== unit.contactPersonSurname ||
    emailAddress !== unit.email ||
    province !== unit.province
  ) : false

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
          <div className="flex w-full flex-col gap-4 sm:flex-row">
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
            disabled={!hasChanges || saving}
            className={`h-11 w-full rounded-xl ${
              hasChanges && !saving
                ? "bg-gray-900 text-white hover:bg-gray-800"
                : "bg-gray-300 text-gray-600 cursor-not-allowed"
            }`}
          >
            {saving ? "Saving..." : "Update Information"}
            {saving ? (
              <svg className="ml-1 size-4 animate-spin" viewBox="0 0 40 40" fill="none">
                <circle cx="20" cy="20" r="15" stroke="#6b7280" strokeWidth="5" strokeLinecap="round" />
                <circle cx="20" cy="20" r="15" stroke="white" strokeWidth="5" strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset="70" />
              </svg>
            ) : (
              <ArrowRight className="ml-1 size-4" />
            )}
          </Button>

          <Button
            data-testid="disable-unit-button"
            variant="outline"
            onClick={() => setIsStatusOpen(true)}
            disabled={toggling}
            className="h-11 w-full rounded-xl border border-black"
          >
            {toggling
              ? (unit.status === "Active" ? "Disabling..." : "Activating...")
              : (unit.status === "Active" ? "Disable Unit" : "Activate Unit")}
            {toggling && (
              <svg className="ml-1 size-4 animate-spin" viewBox="0 0 40 40" fill="none">
                <circle cx="20" cy="20" r="15" stroke="#d1d5db" strokeWidth="5" strokeLinecap="round" />
                <circle cx="20" cy="20" r="15" stroke="#111827" strokeWidth="5" strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset="70" />
              </svg>
            )}
          </Button>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="rounded-2xl p-6 sm:p-8">
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
              disabled={deleting || toggling}
              className="h-11 w-full rounded-xl bg-gray-900 text-white hover:bg-gray-800"
            >
              {deleting ? "Deleting..." : "Yes, delete unit"}
              {deleting ? (
                <svg className="ml-1 size-4 animate-spin" viewBox="0 0 40 40" fill="none">
                  <circle cx="20" cy="20" r="15" stroke="#6b7280" strokeWidth="5" strokeLinecap="round" />
                  <circle cx="20" cy="20" r="15" stroke="white" strokeWidth="5" strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset="70" />
                </svg>
              ) : (
                <ArrowRight className="ml-1 size-4" />
              )}
            </Button>

            <Button
              data-testid="disable-instead-button"
              variant="outline"
              disabled={deleting || toggling}
              onClick={async () => {
                setToggling(true)
                try {
                  setIsDeleteOpen(false)
                  const name = unit!.unitName
                  await toggleUnitStatus(unitId)
                  const params = new URLSearchParams({
                    statusChanged: "disabled",
                    unitName: name,
                  })
                  router.push(`/unit-management?${params.toString()}`)
                } catch {
                  setToggling(false)
                }
              }}
              className="h-11 w-full rounded-xl border border-black"
            >
              {toggling ? "Disabling..." : "Disable unit instead"}
              {toggling && (
                <svg className="ml-1 size-4 animate-spin" viewBox="0 0 40 40" fill="none">
                  <circle cx="20" cy="20" r="15" stroke="#d1d5db" strokeWidth="5" strokeLinecap="round" />
                  <circle cx="20" cy="20" r="15" stroke="#111827" strokeWidth="5" strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset="70" />
                </svg>
              )}
            </Button>

            <button
              type="button"
              data-testid="cancel-delete-button"
              onClick={() => setIsDeleteOpen(false)}
              disabled={deleting || toggling}
              className="text-sm font-medium text-[#FF3A69] hover:text-[#FF3A69]/80 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Disable / Activate Confirmation Dialog */}
      <Dialog open={isStatusOpen} onOpenChange={setIsStatusOpen}>
        <DialogContent className="rounded-2xl p-6 sm:p-8">
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
              disabled={toggling}
              onClick={async () => {
                setIsStatusOpen(false)
                await handleToggleStatus()
              }}
              className="h-11 w-full rounded-xl bg-gray-900 text-white hover:bg-gray-800"
            >
              {toggling
                ? (unit.status === "Active" ? "Disabling..." : "Activating...")
                : `Yes, ${unit.status === "Active" ? "disable" : "activate"} unit`}
              {toggling ? (
                <svg className="ml-1 size-4 animate-spin" viewBox="0 0 40 40" fill="none">
                  <circle cx="20" cy="20" r="15" stroke="#6b7280" strokeWidth="5" strokeLinecap="round" />
                  <circle cx="20" cy="20" r="15" stroke="white" strokeWidth="5" strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset="70" />
                </svg>
              ) : (
                <ArrowRight className="ml-1 size-4" />
              )}
            </Button>

            <button
              type="button"
              data-testid="cancel-status-button"
              onClick={() => setIsStatusOpen(false)}
              disabled={toggling}
              className="text-sm font-medium text-[#FF3A69] hover:text-[#FF3A69]/80 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
