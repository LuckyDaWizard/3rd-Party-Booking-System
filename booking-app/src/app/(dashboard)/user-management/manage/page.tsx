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
import { useUserStore } from "@/lib/user-store"
import { useUnitStore } from "@/lib/unit-store"
import { PIN_LENGTH } from "@/lib/constants"
import { useAuth } from "@/lib/auth-store"

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
  const selectRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (selectRef.current && !selectRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside)
    }
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isOpen])

  return (
    <div ref={selectRef} className={`relative ${className}`}>
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
// Multi-Select Unit Dropdown with Chips
// ---------------------------------------------------------------------------

function UnitMultiSelect({
  selectedIds,
  onChange,
  units,
}: {
  selectedIds: string[]
  onChange: (unitIds: string[]) => void
  units: { id: string; unitName: string; clientName: string }[]
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState("")
  const ref = useRef<HTMLDivElement>(null)

  const available = units.filter((u) => !selectedIds.includes(u.id))
  const filtered = search.trim()
    ? available.filter(
        (u) =>
          u.unitName.toLowerCase().includes(search.toLowerCase()) ||
          u.clientName.toLowerCase().includes(search.toLowerCase())
      )
    : available

  const selectedUnits = units.filter((u) => selectedIds.includes(u.id))

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

  function handleSelect(unitId: string) {
    onChange([...selectedIds, unitId])
    setSearch("")
  }

  function handleRemove(unitId: string) {
    onChange(selectedIds.filter((id) => id !== unitId))
  }

  return (
    <div ref={ref} className="flex flex-col gap-2">
      <div className="relative">
        <button
          type="button"
          data-testid="unit-multi-select"
          onClick={() => setIsOpen(!isOpen)}
          className={`flex h-14 w-full items-center rounded-lg border bg-white px-4 text-left text-sm outline-none transition-colors ${
            isOpen ? "border-gray-900" : "border-gray-300"
          }`}
        >
          <span className="text-gray-400">
            Search unit to assign user to
          </span>
        </button>
        <ChevronDown
          className={`pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-gray-400 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />

        {isOpen && (
          <div className="absolute left-0 top-full z-10 mt-1 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
            <div className="border-b border-gray-100 px-4 py-3">
              <input
                type="text"
                data-testid="unit-search-input"
                placeholder="Search units..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
                autoFocus
              />
            </div>
            <div className="mx-2 my-2 flex max-h-64 flex-col gap-1 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="px-4 py-3 text-sm text-gray-400">
                  {available.length === 0 ? "All units assigned" : "No units found"}
                </div>
              ) : (
                filtered.map((unit) => (
                  <button
                    key={unit.id}
                    type="button"
                    onClick={() => handleSelect(unit.id)}
                    className="w-full rounded-lg px-5 py-4 text-left text-base text-gray-900 transition-colors hover:bg-[#3ea3db]/15"
                  >
                    <span>{unit.unitName}</span>
                    <span className="ml-2 text-sm text-gray-400">
                      ({unit.clientName})
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {selectedUnits.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedUnits.map((unit) => (
            <span
              key={unit.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#3ea3db]/30 bg-[#3ea3db]/10 px-3 py-1 text-sm text-[#3ea3db]"
            >
              {unit.unitName}
              <button
                type="button"
                onClick={() => handleRemove(unit.id)}
                className="rounded-full p-0.5 text-[#3ea3db] hover:bg-[#3ea3db]/20"
                aria-label={`Remove ${unit.unitName}`}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ManageUserPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const userId = searchParams.get("id") ?? ""
  const { getUser, updateUser, updateUserUnits, deleteUser, toggleUserStatus } = useUserStore()
  const { units: allUnits } = useUnitStore()

  const user = getUser(userId)

  const { activeUnitId } = useAuth()
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [isStatusOpen, setIsStatusOpen] = useState(false)
  const [isResetPinOpen, setIsResetPinOpen] = useState(false)
  const [isVerificationOpen, setIsVerificationOpen] = useState(false)
  const [verificationCode, setVerificationCode] = useState<string[]>(Array.from({ length: PIN_LENGTH }, () => ""))
  const [verificationError, setVerificationError] = useState("")
  const [verifying, setVerifying] = useState(false)
  const [resetPinResult, setResetPinResult] = useState<{
    success: boolean
    emailSent: boolean
    pin?: string
    emailError?: string
  } | null>(null)
  const verificationRefs = useRef<(HTMLInputElement | null)[]>([])
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [resettingPin, setResettingPin] = useState(false)
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([])
  const [firstNames, setFirstNames] = useState("")
  const [surname, setSurname] = useState("")
  const [emailAddress, setEmailAddress] = useState("")
  const [contactNumber, setContactNumber] = useState("")
  const [userRole, setUserRole] = useState("")

  const { isSystemAdmin } = useAuth()

  // System admin can assign any role; unit managers can only set regular users
  const roleOptions = isSystemAdmin
    ? [
        { value: "user", label: "User" },
        { value: "unit_manager", label: "Unit Manager" },
        { value: "system_admin", label: "System Admin" },
      ]
    : [
        { value: "user", label: "User" },
      ]

  useEffect(() => {
    if (user) {
      setFirstNames(user.firstNames)
      setSurname(user.surname)
      setEmailAddress(user.email)
      setContactNumber(user.contactNumber)
      setSelectedUnitIds(user.units.map((u) => u.unitId))
      setUserRole(user.role)
    }
  }, [user])

  if (!user) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-gray-500">User not found</p>
      </div>
    )
  }

  // Check if any field has changed from the original
  const originalUnitIds = user.units.map((u) => u.unitId)
  const hasChanges =
    firstNames !== user.firstNames ||
    surname !== user.surname ||
    emailAddress !== user.email ||
    contactNumber !== user.contactNumber ||
    userRole !== user.role ||
    selectedUnitIds.length !== originalUnitIds.length ||
    selectedUnitIds.some((id) => !originalUnitIds.includes(id))

  async function handleUpdateInformation() {
    setSaving(true)
    try {
      await updateUser(userId, {
        firstNames,
        surname,
        email: emailAddress,
        contactNumber,
        role: userRole,
      })
      await updateUserUnits(userId, selectedUnitIds)
      router.push("/user-management")
    } catch (err) {
      console.error("Failed to update user:", err)
      setSaving(false)
    }
  }

  async function handleResetPin() {
    setResettingPin(true)
    try {
      const res = await fetch(`/api/admin/users/${userId}/reset-pin`, {
        method: "POST",
      })
      const data = (await res.json()) as {
        ok?: boolean
        emailSent?: boolean
        pin?: string
        emailError?: string
        error?: string
      }

      if (!res.ok || !data.ok) {
        setResetPinResult({
          success: false,
          emailSent: false,
          pin: undefined,
          emailError: data.error ?? "Failed to reset PIN",
        })
        return
      }

      setResetPinResult({
        success: true,
        emailSent: data.emailSent ?? false,
        pin: data.pin,
        emailError: data.emailError,
      })
    } catch (err) {
      setResetPinResult({
        success: false,
        emailSent: false,
        emailError: err instanceof Error ? err.message : "Unknown error",
      })
    } finally {
      setResettingPin(false)
    }
  }

  async function handleToggleStatus() {
    setToggling(true)
    try {
      const wasActive = user!.status === "Active"
      const name = `${user!.firstNames} ${user!.surname}`
      await toggleUserStatus(userId)
      const params = new URLSearchParams({
        statusChanged: wasActive ? "disabled" : "activated",
        userName: name,
      })
      router.push(`/user-management?${params.toString()}`)
    } catch (err) {
      console.error("Failed to toggle status:", err)
      setToggling(false)
    }
  }

  async function handleDeleteUser() {
    setDeleting(true)
    try {
      const name = `${user!.firstNames} ${user!.surname}`
      await deleteUser(userId)
      const params = new URLSearchParams({ deleted: name })
      router.push(`/user-management?${params.toString()}`)
    } catch (err) {
      console.error("Failed to delete user:", err)
      setDeleting(false)
    }
  }

  return (
    <div
      data-testid="manage-user-page"
      className="flex flex-1 flex-col"
    >
      {/* Top bar */}
      <div className="flex items-center justify-between rounded-xl bg-white px-6 py-4">
        <Button
          data-testid="top-back-button"
          variant="outline"
          size="sm"
          onClick={() => router.push("/user-management")}
          className="rounded-lg border-black px-6 py-2 gap-3"
        >
          <ArrowLeft className="size-4" />
          Back
        </Button>

        <Button
          data-testid="delete-user-button"
          size="sm"
          onClick={() => setIsDeleteOpen(true)}
          className="rounded-lg bg-[#FF3A69] px-6 py-2 text-white hover:bg-[#FF3A69]/90"
        >
          Delete User
        </Button>
      </div>

      {/* PIN Reset Result Banner */}
      {resetPinResult && (
        <div
          className={`mx-4 mt-4 flex items-start justify-between rounded-xl border px-6 py-5 ${
            resetPinResult.success
              ? resetPinResult.emailSent
                ? "border-green-200 bg-green-50"
                : "border-amber-200 bg-amber-50"
              : "border-red-200 bg-red-50"
          }`}
        >
          <div className="flex flex-col gap-1">
            {resetPinResult.success ? (
              resetPinResult.emailSent ? (
                <>
                  <span className="text-base font-bold text-gray-900">
                    PIN Reset Successfully
                  </span>
                  <p className="text-sm text-gray-500">
                    A new access PIN has been sent to the user&apos;s email address.
                  </p>
                </>
              ) : (
                <>
                  <span className="text-base font-bold text-gray-900">
                    PIN Reset — Email Failed
                  </span>
                  <p className="text-sm text-gray-500">
                    The PIN was reset but the email could not be delivered.
                    Please share the new PIN with the user securely.
                  </p>
                  {resetPinResult.pin && (
                    <p className="mt-1 text-sm font-medium text-gray-700">
                      New PIN: <span className="font-bold tracking-wider">{resetPinResult.pin}</span>
                    </p>
                  )}
                  {resetPinResult.emailError && (
                    <p className="mt-1 text-xs text-amber-600">
                      Error: {resetPinResult.emailError}
                    </p>
                  )}
                </>
              )
            ) : (
              <>
                <span className="text-base font-bold text-gray-900">
                  PIN Reset Failed
                </span>
                <p className="text-sm text-gray-500">
                  {resetPinResult.emailError || "An unknown error occurred."}
                </p>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => setResetPinResult(null)}
            className="shrink-0 rounded-full p-1 text-gray-400 hover:text-gray-600"
            aria-label="Dismiss"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Content area */}
      <div className="flex flex-1 flex-col items-center justify-center gap-8 py-8">
        {/* Heading */}
        <div className="flex flex-col items-center gap-1 text-center">
          <h1
            data-testid="page-heading"
            className="text-3xl font-bold text-gray-900"
          >
            Manage {user.firstNames} {user.surname}
          </h1>
          <p className="text-base text-gray-500">
            Manage the user&apos;s units and personal information below
          </p>
        </div>

        {/* Form */}
        <div className="flex w-full max-w-md flex-col gap-4">
          {/* Unit multi-select */}
          <UnitMultiSelect
            selectedIds={selectedUnitIds}
            onChange={setSelectedUnitIds}
            units={allUnits.map((u) => ({
              id: u.id,
              unitName: u.unitName,
              clientName: u.clientName,
            }))}
          />

          {/* First Names */}
          <FloatingInput
            id="first-names"
            data-testid="input-first-names"
            label="First Names"
            value={firstNames}
            onChange={setFirstNames}
            onClear={() => setFirstNames("")}
          />

          {/* Surname */}
          <FloatingInput
            id="surname"
            data-testid="input-surname"
            label="Surname"
            value={surname}
            onChange={setSurname}
            onClear={() => setSurname("")}
          />

          {/* Email Address */}
          <FloatingInput
            id="email-address"
            data-testid="input-email"
            label="Email Address"
            type="email"
            value={emailAddress}
            onChange={setEmailAddress}
            onClear={() => setEmailAddress("")}
          />

          {/* Contact Number */}
          <FloatingInput
            id="contact-number"
            data-testid="input-contact-number"
            label="Contact Number"
            type="tel"
            value={contactNumber}
            onChange={setContactNumber}
            onClear={() => setContactNumber("")}
          />

          {/* Access Role */}
          <FloatingSelect
            id="role"
            data-testid="select-role"
            label="Select Access Role"
            value={userRole}
            onChange={setUserRole}
            options={roleOptions}
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
            data-testid="reset-pin-button"
            variant="outline"
            onClick={() => setIsResetPinOpen(true)}
            className="h-11 w-full rounded-xl border border-black"
          >
            Reset Pin
          </Button>

          <button
            type="button"
            data-testid="disable-user-button"
            onClick={() => setIsStatusOpen(true)}
            className="mt-1 text-sm font-bold text-gray-900 hover:text-gray-600"
          >
            {user.status === "Active" ? "Disable User" : "Activate User"}
          </button>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="rounded-2xl p-6 sm:p-8">
          <DialogHeader className="flex flex-col items-center gap-2 text-center">
            <DialogTitle className="text-2xl font-bold text-gray-900">
              Are you sure you want to delete {user.firstNames} {user.surname}?
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-500">
              Deleting this user will permanently remove all associated records.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-3 pt-4">
            <Button
              data-testid="confirm-delete-button"
              onClick={handleDeleteUser}
              disabled={deleting || toggling}
              className="h-11 w-full rounded-xl bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50"
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
                  Yes, delete user
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
                  const name = `${user!.firstNames} ${user!.surname}`
                  await toggleUserStatus(userId)
                  const params = new URLSearchParams({
                    statusChanged: "disabled",
                    userName: name,
                  })
                  router.push(`/user-management?${params.toString()}`)
                } catch {
                  setToggling(false)
                }
              }}
              className="h-11 w-full rounded-xl border border-black disabled:opacity-50"
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
                "Disable user instead"
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

      {/* Reset Pin Confirmation Dialog */}
      <Dialog open={isResetPinOpen} onOpenChange={setIsResetPinOpen}>
        <DialogContent className="rounded-2xl p-6 sm:p-8">
          <DialogHeader className="flex flex-col items-center gap-2 text-center">
            <DialogTitle className="text-2xl font-bold text-gray-900">
              Are you sure you want to reset access pin?
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-500">
              You&apos;re about to reset this user&apos;s access pin, do you want to proceed?
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-3 pt-4">
            <Button
              data-testid="confirm-reset-pin-button"
              onClick={() => {
                setIsResetPinOpen(false)
                setVerificationCode(Array.from({ length: PIN_LENGTH }, () => ""))
                setIsVerificationOpen(true)
                setTimeout(() => verificationRefs.current[0]?.focus(), 100)
              }}
              className="h-11 w-full rounded-xl bg-gray-900 text-white hover:bg-gray-800"
            >
              Yes, send pin
              <ArrowRight className="ml-1 size-4" />
            </Button>

            <button
              type="button"
              data-testid="cancel-reset-pin-button"
              onClick={() => setIsResetPinOpen(false)}
              className="text-sm font-medium text-[#FF3A69] hover:text-[#FF3A69]/80"
            >
              Cancel
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Verification Code Dialog */}
      <Dialog open={isVerificationOpen} onOpenChange={setIsVerificationOpen}>
        <DialogContent className="max-w-sm rounded-2xl p-6">
          <DialogHeader className="flex flex-col items-center gap-1 text-center">
            <DialogTitle className="mx-4 text-xl font-bold text-gray-900">
              Enter your nurse verification code to reset access pin
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col items-center gap-4 pt-3">
            {/* 6-digit code inputs */}
            <div className="flex w-full items-center justify-between">
              {verificationCode.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => { verificationRefs.current[index] = el }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  data-testid={`verification-digit-${index}`}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "")
                    const newCode = [...verificationCode]
                    newCode[index] = val
                    setVerificationCode(newCode)
                    if (val && index < PIN_LENGTH - 1) {
                      verificationRefs.current[index + 1]?.focus()
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Backspace" && !digit && index > 0) {
                      verificationRefs.current[index - 1]?.focus()
                    }
                  }}
                  className="size-10 rounded-lg border border-gray-300 bg-gray-100 text-center text-base font-medium text-gray-900 outline-none transition-colors focus:border-gray-900 focus:bg-white sm:size-11"
                />
              ))}
            </div>

            {verificationError && (
              <p className="text-center text-sm font-medium text-[#FF3A69]">
                {verificationError}
              </p>
            )}

            <Button
              data-testid="confirm-verification-button"
              disabled={verificationCode.some((d) => !d) || verifying}
              onClick={async () => {
                setVerificationError("")
                setVerifying(true)

                const pin = verificationCode.join("")

                // Two-person sign-off via /api/verify/manager-pin (Phase 5
                // RLS forbids reading other users' PINs directly).
                const verifyRes = await fetch("/api/verify/manager-pin", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ pin, unitId: activeUnitId }),
                })
                const verifyData = (await verifyRes.json().catch(() => ({}))) as {
                  valid?: boolean
                }
                if (!verifyRes.ok || !verifyData.valid) {
                  setVerificationError("Invalid verification code")
                  setVerifying(false)
                  return
                }

                setVerifying(false)
                setIsVerificationOpen(false)
                setVerificationError("")
                await handleResetPin()
              }}
              className={`h-11 w-full rounded-xl transition-colors ${
                verificationCode.every((d) => d) && !verifying
                  ? "bg-gray-900 text-white hover:bg-gray-800"
                  : "bg-gray-300 text-gray-600"
              }`}
            >
              {verifying ? (
                <>
                  Verifying...
                  <svg className="ml-1 size-4 animate-spin" viewBox="0 0 40 40" fill="none">
                    <circle cx="20" cy="20" r="15" stroke="#6b7280" strokeWidth="5" strokeLinecap="round" />
                    <circle cx="20" cy="20" r="15" stroke="white" strokeWidth="5" strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset="70" />
                  </svg>
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight className="ml-1 size-4" />
                </>
              )}
            </Button>

            <button
              type="button"
              data-testid="cancel-verification-button"
              onClick={() => {
                setIsVerificationOpen(false)
                setVerificationError("")
              }}
              className="text-sm font-medium text-[#FF3A69] hover:text-[#FF3A69]/80"
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
              {user.status === "Active" ? "Disable" : "Activate"} {user.firstNames} {user.surname}?
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-500">
              {user.status === "Active"
                ? "Disabling this user will restrict their access to the system. This can be reversed."
                : "Activating this user will restore their system access and permissions."}
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
              className="h-11 w-full rounded-xl bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {toggling ? (
                <>
                  {user.status === "Active" ? "Disabling..." : "Activating..."}
                  <svg className="ml-1 size-4 animate-spin" viewBox="0 0 40 40" fill="none">
                    <circle cx="20" cy="20" r="15" stroke="#6b7280" strokeWidth="5" strokeLinecap="round" />
                    <circle cx="20" cy="20" r="15" stroke="white" strokeWidth="5" strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset="70" />
                  </svg>
                </>
              ) : (
                <>
                  Yes, {user.status === "Active" ? "disable" : "activate"} user
                  <ArrowRight className="ml-1 size-4" />
                </>
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
