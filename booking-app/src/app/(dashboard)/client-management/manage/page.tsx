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
import { PinVerificationModal } from "@/components/ui/pin-verification-modal"
import { useClientStore } from "@/lib/client-store"
import { useAuth } from "@/lib/auth-store"

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ManageClientPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const clientId = searchParams.get("id") ?? ""
  const { getClient, updateClient, deleteClient, toggleClientStatus } = useClientStore()
  const { activeUnitId, isSystemAdmin } = useAuth()

  const client = getClient(clientId)

  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [isStatusOpen, setIsStatusOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [toggling, setToggling] = useState(false)
  // PIN re-verification required for client deletion (destructive).
  const [pinOpen, setPinOpen] = useState(false)
  const [clientName, setClientName] = useState("")
  const [contactPersonName, setContactPersonName] = useState("")
  const [contactPersonSurname, setContactPersonSurname] = useState("")
  const [emailAddress, setEmailAddress] = useState("")
  const [contactNumber, setContactNumber] = useState("")
  const [collectPaymentAtUnit, setCollectPaymentAtUnit] = useState(false)

  useEffect(() => {
    if (client) {
      setClientName(client.clientName)
      setContactPersonName(client.contactPersonName)
      setContactPersonSurname(client.contactPersonSurname)
      setEmailAddress(client.email)
      setContactNumber(client.number)
      setCollectPaymentAtUnit(client.collectPaymentAtUnit)
    }
  }, [client])

  if (!client) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-gray-500">Client not found</p>
      </div>
    )
  }

  async function handleUpdateInformation() {
    setSaving(true)
    try {
      await updateClient(clientId, {
        clientName,
        contactPersonName,
        contactPersonSurname,
        email: emailAddress,
        number: contactNumber,
        ...(isSystemAdmin ? { collectPaymentAtUnit } : {}),
      })
      router.push("/client-management")
    } catch {
      setSaving(false)
    }
  }

  async function handleDisableClient() {
    setToggling(true)
    try {
      const wasActive = client!.status === "Active"
      const name = client!.clientName
      await toggleClientStatus(clientId)
      const params = new URLSearchParams({
        statusChanged: wasActive ? "disabled" : "activated",
        clientName: name,
      })
      router.push(`/client-management?${params.toString()}`)
    } catch {
      setToggling(false)
    }
  }

  async function handleDeleteClient() {
    setDeleting(true)
    try {
      const deletedData = {
        clientName: client!.clientName,
        contactPersonName: client!.contactPersonName,
        contactPersonSurname: client!.contactPersonSurname,
        units: client!.units,
        email: client!.email,
        number: client!.number,
      }
      await deleteClient(clientId)
      const params = new URLSearchParams({
        deleted: client!.clientName,
        data: JSON.stringify(deletedData),
      })
      router.push(`/client-management?${params.toString()}`)
    } catch {
      setDeleting(false)
    }
  }

  return (
    <div
      data-testid="manage-client-page"
      className="flex flex-1 flex-col"
    >
      {/* Top bar */}
      <div className="flex items-center justify-between rounded-xl bg-white px-6 py-4">
        <Button
          data-testid="top-back-button"
          variant="outline"
          size="sm"
          onClick={() => router.push("/client-management")}
          className="rounded-lg border-black px-6 py-2 gap-3"
        >
          <ArrowLeft className="size-4" />
          Back
        </Button>

        <Button
          data-testid="delete-client-button"
          size="sm"
          onClick={() => setIsDeleteOpen(true)}
          className="rounded-lg bg-[#FF3A69] px-6 py-2 text-white hover:bg-[#FF3A69]/90"
        >
          Delete Client
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
            Manage {client.clientName}
          </h1>
          <p className="text-base text-gray-500">
            Update client information and status below
          </p>
        </div>

        {/* Form */}
        <div className="flex w-full max-w-md flex-col gap-4">
          <FloatingInput
            id="client-name"
            data-testid="input-client-name"
            label="Client Name"
            value={clientName}
            onChange={setClientName}
            onClear={() => setClientName("")}
          />

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

          <FloatingInput
            id="email-address"
            data-testid="input-email-address"
            label="Email Address"
            type="email"
            value={emailAddress}
            onChange={setEmailAddress}
            onClear={() => setEmailAddress("")}
          />

          <FloatingInput
            id="contact-number"
            data-testid="input-contact-number"
            label="Contact Number"
            type="tel"
            value={contactNumber}
            onChange={setContactNumber}
            onClear={() => setContactNumber("")}
          />

          {/* Collect payment at unit (system_admin only) — applies to ALL units under this client */}
          {isSystemAdmin && (
            <div
              data-testid="collect-payment-toggle-row"
              className="flex items-start justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 p-4"
            >
              <div className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-gray-900">
                  Collect payment at unit
                </span>
                <span className="text-xs text-gray-600">
                  When ON, every unit under this client skips the payment
                  gateway. Each unit is responsible for collecting the
                  consultation fee directly from the patient.
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={collectPaymentAtUnit}
                aria-label="Collect payment at unit"
                data-testid="collect-payment-toggle"
                onClick={() => setCollectPaymentAtUnit((v) => !v)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                  collectPaymentAtUnit ? "bg-[#3ea3db]" : "bg-gray-300"
                }`}
              >
                <span
                  className={`inline-block size-5 transform rounded-full bg-white shadow transition-transform ${
                    collectPaymentAtUnit ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex w-full max-w-md flex-col items-center gap-3">
          <Button
            data-testid="update-button"
            disabled={saving}
            onClick={handleUpdateInformation}
            className="h-11 w-full rounded-xl bg-gray-300 text-gray-600 hover:bg-gray-900 hover:text-white"
          >
            {saving ? (
              <>
                Saving...
                <svg className="ml-1 size-4 animate-spin" viewBox="0 0 40 40" fill="none">
                  <circle cx="20" cy="20" r="15" stroke="#6b7280" strokeWidth="5" strokeLinecap="round" />
                  <circle cx="20" cy="20" r="15" stroke="white" strokeWidth="5" strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset="70" />
                </svg>
              </>
            ) : (
              <>
                Update Information
                <ArrowRight className="ml-1 size-4" />
              </>
            )}
          </Button>

          <Button
            data-testid="disable-client-button"
            variant="outline"
            disabled={saving}
            onClick={() => setIsStatusOpen(true)}
            className={`h-11 w-full rounded-xl border border-black ${saving ? "disabled:opacity-50" : ""}`}
          >
            {client.status === "Active" ? "Disable Client" : "Activate Client"}
          </Button>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteOpen} onOpenChange={(v) => { if (!deleting && !toggling) setIsDeleteOpen(v) }}>
        <DialogContent className="rounded-2xl p-6 sm:p-8">
          <DialogHeader className="flex flex-col items-center gap-2 text-center">
            <DialogTitle className="text-2xl font-bold text-gray-900">
              Are you sure you want to delete {client.clientName}
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-500">
              Deleting this client will permanently remove all associated records.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-3 pt-4">
            <Button
              data-testid="confirm-delete-button"
              disabled={deleting || toggling}
              onClick={() => {
                setIsDeleteOpen(false)
                setPinOpen(true)
              }}
              className="h-11 w-full rounded-xl bg-gray-900 text-white hover:bg-gray-800"
            >
              {deleting ? (
                <>
                  Deleting...
                  <svg className="ml-1 size-4 animate-spin" viewBox="0 0 40 40" fill="none">
                    <circle cx="20" cy="20" r="15" stroke="#6b7280" strokeWidth="5" strokeLinecap="round" />
                    <circle cx="20" cy="20" r="15" stroke="white" strokeWidth="5" strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset="70" />
                  </svg>
                </>
              ) : (
                <>
                  Yes, delete client
                  <ArrowRight className="ml-1 size-4" />
                </>
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
                  const name = client!.clientName
                  await toggleClientStatus(clientId)
                  const params = new URLSearchParams({
                    statusChanged: "disabled",
                    clientName: name,
                  })
                  router.push(`/client-management?${params.toString()}`)
                } catch {
                  setToggling(false)
                }
              }}
              className="h-11 w-full rounded-xl border border-black"
            >
              {toggling ? (
                <>
                  Disabling...
                  <svg className="ml-1 size-4 animate-spin" viewBox="0 0 40 40" fill="none">
                    <circle cx="20" cy="20" r="15" stroke="#d1d5db" strokeWidth="5" strokeLinecap="round" />
                    <circle cx="20" cy="20" r="15" stroke="#111827" strokeWidth="5" strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset="70" />
                  </svg>
                </>
              ) : (
                "Disable client instead"
              )}
            </Button>

            <button
              type="button"
              data-testid="cancel-delete-button"
              disabled={deleting || toggling}
              onClick={() => setIsDeleteOpen(false)}
              className={`text-sm font-medium text-[#FF3A69] hover:text-[#FF3A69]/80 ${deleting || toggling ? "disabled:opacity-50" : ""}`}
            >
              Cancel
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Disable / Activate Confirmation Dialog */}
      <Dialog open={isStatusOpen} onOpenChange={(v) => { if (!toggling) setIsStatusOpen(v) }}>
        <DialogContent className="rounded-2xl p-6 sm:p-8">
          <DialogHeader className="flex flex-col items-center gap-2 text-center">
            <DialogTitle className="text-2xl font-bold text-gray-900">
              {client.status === "Active" ? "Disable" : "Activate"} {client.clientName}?
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-500">
              {client.status === "Active"
                ? "Disabling this client will restrict access to all associated units and users. This can be reversed"
                : "Activating this client will restore system access and permissions."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-3 pt-4">
            <Button
              data-testid="confirm-status-button"
              disabled={toggling}
              onClick={async () => {
                setIsStatusOpen(false)
                await handleDisableClient()
              }}
              className="h-11 w-full rounded-xl bg-gray-900 text-white hover:bg-gray-800"
            >
              {toggling ? (
                <>
                  {client.status === "Active" ? "Disabling..." : "Activating..."}
                  <svg className="ml-1 size-4 animate-spin" viewBox="0 0 40 40" fill="none">
                    <circle cx="20" cy="20" r="15" stroke="#6b7280" strokeWidth="5" strokeLinecap="round" />
                    <circle cx="20" cy="20" r="15" stroke="white" strokeWidth="5" strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset="70" />
                  </svg>
                </>
              ) : (
                <>
                  Yes, {client.status === "Active" ? "disable" : "activate"} client
                  <ArrowRight className="ml-1 size-4" />
                </>
              )}
            </Button>

            <button
              type="button"
              data-testid="cancel-status-button"
              disabled={toggling}
              onClick={() => setIsStatusOpen(false)}
              className={`text-sm font-medium text-[#FF3A69] hover:text-[#FF3A69]/80 ${toggling ? "disabled:opacity-50" : ""}`}
            >
              Cancel
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* PIN verification — required before client deletion */}
      <PinVerificationModal
        open={pinOpen}
        onOpenChange={setPinOpen}
        activeUnitId={activeUnitId}
        heading="Confirm client deletion"
        subtitle="Enter your access PIN to permanently delete this client."
        onVerified={async () => {
          await handleDeleteClient()
        }}
      />
    </div>
  )
}
