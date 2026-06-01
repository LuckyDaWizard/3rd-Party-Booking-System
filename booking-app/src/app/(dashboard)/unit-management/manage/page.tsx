"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { SubNav } from "@/components/ui/sub-nav"
import { FloatingInput } from "@/components/ui/floating-input"
import { FloatingSelect } from "@/components/ui/floating-select"
import { PinVerificationModal } from "@/components/ui/pin-verification-modal"
import { useUnitStore } from "@/lib/unit-store"
import { useClientStore } from "@/lib/client-store"
import { useAuth } from "@/lib/auth-store"

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
  const { activeUnitId } = useAuth()

  const unit = getUnit(unitId)

  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [isStatusOpen, setIsStatusOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  // PIN re-verification required for unit deletion (destructive).
  const [pinOpen, setPinOpen] = useState(false)
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
        <p className="text-ink-muted">Unit not found</p>
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
      <SubNav
        onBack={() => router.push("/unit-management")}
        backTestId="top-back-button"
      >
        <Button
          data-testid="delete-unit-button"
          variant="danger"
          size="cta"
          onClick={() => setIsDeleteOpen(true)}
        >
          Delete Unit
        </Button>
      </SubNav>

      {/* Content area */}
      <div className="flex flex-1 flex-col items-center justify-center gap-8 py-8">
        {/* Heading */}
        <div className="flex flex-col items-center gap-1 text-center">
          <h1
            data-testid="page-heading"
            className="text-3xl font-bold text-ink"
          >
            Manage {unit.unitName}
          </h1>
          <p className="text-base text-ink-muted">
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
            variant="primary"
            size="cta"
            className="w-full"
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
            variant="primary-outline"
            size="cta"
            onClick={() => setIsStatusOpen(true)}
            disabled={toggling}
              className="w-full"
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
      <ConfirmDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        title={`Are you sure you want to delete ${unit.unitName}?`}
        description="Deleting this unit will permanently remove all associated records."
        confirmLabel="Yes, delete unit"
        confirmLoadingLabel="Deleting..."
        confirmPending={deleting}
        confirmDisabled={toggling}
        onConfirm={() => {
          setIsDeleteOpen(false)
          setPinOpen(true)
        }}
        secondaryLabel="Disable unit instead"
        secondaryLoadingLabel="Disabling..."
        secondaryPending={toggling}
        secondaryDisabled={deleting}
        onSecondary={async () => {
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
        cancelDisabled={deleting || toggling}
        confirmTestId="confirm-delete-button"
        secondaryTestId="disable-instead-button"
        cancelTestId="cancel-delete-button"
      />

      {/* Disable / Activate Confirmation Dialog */}
      <ConfirmDialog
        open={isStatusOpen}
        onOpenChange={setIsStatusOpen}
        title={`${unit.status === "Active" ? "Disable" : "Activate"} ${unit.unitName}?`}
        description={
          unit.status === "Active"
            ? "Disabling this unit will restrict access for all associated users. This can be reversed."
            : "Activating this unit will restore system access and permissions."
        }
        confirmLabel={`Yes, ${unit.status === "Active" ? "disable" : "activate"} unit`}
        confirmLoadingLabel={unit.status === "Active" ? "Disabling..." : "Activating..."}
        confirmPending={toggling}
        onConfirm={async () => {
          setIsStatusOpen(false)
          await handleToggleStatus()
        }}
        cancelDisabled={toggling}
        confirmTestId="confirm-status-button"
        cancelTestId="cancel-status-button"
      />

      {/* PIN verification — required before unit deletion. Manager-only
          (regular user PINs cannot authorise this destructive change). */}
      <PinVerificationModal
        open={pinOpen}
        onOpenChange={setPinOpen}
        activeUnitId={activeUnitId}
        purpose="manager-action"
        heading="Confirm unit deletion"
        subtitle="Enter your access PIN to permanently delete this unit."
        onVerified={async () => {
          await handleDeleteUnit()
        }}
      />
    </div>
  )
}
