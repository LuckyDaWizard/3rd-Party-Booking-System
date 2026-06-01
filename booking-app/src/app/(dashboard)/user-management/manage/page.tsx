"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, ArrowRight, X, ChevronDown, User as UserIcon } from "lucide-react"
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
import { PinVerificationModal } from "@/components/ui/pin-verification-modal"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { OtpInput } from "@/components/ui/otp-input"
import { SubNav } from "@/components/ui/sub-nav"
import { useUserStore } from "@/lib/user-store"
import { useUnitStore } from "@/lib/unit-store"
import { PIN_LENGTH } from "@/lib/constants"
import { useAuth } from "@/lib/auth-store"
import { validateImageMinDimensions } from "@/lib/image-dimensions"
import { compressImage } from "@/lib/compress-image"

// Minimum pixel dimensions for the avatar — guards against tiny crops that
// would scale up unattractively in the header. SVG / ICO skip the check.
const AVATAR_MIN_WIDTH = 80
const AVATAR_MIN_HEIGHT = 80

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
                className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-gray-400"
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
                    className="w-full rounded-lg px-5 py-4 text-left text-base text-ink transition-colors hover:bg-[var(--client-primary-15)]"
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
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--client-primary-30)] bg-[var(--client-primary-10)] px-3 py-1 text-sm text-[var(--client-primary)]"
            >
              {unit.unitName}
              <button
                type="button"
                onClick={() => handleRemove(unit.id)}
                className="rounded-full p-0.5 text-[var(--client-primary)] hover:bg-[var(--client-primary-20)]"
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
  const { getUser, updateUser, updateUserUnits, deleteUser, toggleUserStatus, refreshUsers } = useUserStore()
  const { units: allUnits } = useUnitStore()

  const user = getUser(userId)

  const { activeUnitId, user: currentAuthUser, refreshUser: refreshAuthUser } = useAuth()
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [isStatusOpen, setIsStatusOpen] = useState(false)
  const [isResetPinOpen, setIsResetPinOpen] = useState(false)
  const [isVerificationOpen, setIsVerificationOpen] = useState(false)
  const [verificationCode, setVerificationCode] = useState("")
  const [verificationError, setVerificationError] = useState("")
  const [verifying, setVerifying] = useState(false)
  const [resetPinResult, setResetPinResult] = useState<{
    success: boolean
    emailSent: boolean
    pin?: string
    emailError?: string
  } | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [resettingPin, setResettingPin] = useState(false)
  // PIN verification modal state — used for destructive + privilege-change actions
  const [pinAction, setPinAction] = useState<"delete" | "toggle" | "role-change" | null>(null)
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([])
  const [firstNames, setFirstNames] = useState("")
  const [surname, setSurname] = useState("")
  const [emailAddress, setEmailAddress] = useState("")
  const [contactNumber, setContactNumber] = useState("")
  const [userRole, setUserRole] = useState("")

  const { isSystemAdmin } = useAuth()

  // Only system_admin can change roles. Unit-managers and regular users
  // don't see the field at all — a single-option dropdown was useless and
  // misleading (a unit_manager opening their own profile would see the
  // dropdown stuck on a value not in its options).
  const roleOptions = [
    { value: "user", label: "User" },
    { value: "unit_manager", label: "Unit Manager" },
    { value: "system_admin", label: "System Admin" },
  ]

  // --- Avatar upload state -------------------------------------------------
  // Optimistic UI for the upload — store the URL locally so the preview
  // updates immediately without waiting for the user-store refresh round-trip.
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)

  useEffect(() => {
    if (user) {
      setFirstNames(user.firstNames)
      setSurname(user.surname)
      setEmailAddress(user.email)
      setContactNumber(user.contactNumber)
      setSelectedUnitIds(user.units.map((u) => u.unitId))
      setUserRole(user.role)
      setAvatarUrl(user.avatarUrl)
    }
  }, [user])

  // Whether the current viewer is allowed to manage this user's avatar.
  // Spec: self OR system_admin. Unit-managers managing their staff cannot
  // change avatars (deliberate — keeps avatars personal / admin-curated).
  const canManageAvatar =
    isSystemAdmin || (currentAuthUser?.id === userId && currentAuthUser !== null)

  async function handleAvatarUpload(file: File) {
    if (!userId) return
    if (file.size > 2 * 1024 * 1024) {
      setAvatarError("Image must be 2 MB or smaller.")
      return
    }
    const dimsError = await validateImageMinDimensions(
      file,
      AVATAR_MIN_WIDTH,
      AVATAR_MIN_HEIGHT
    )
    if (dimsError) {
      setAvatarError(dimsError)
      return
    }
    setAvatarBusy(true)
    setAvatarError(null)
    try {
      const compressed = await compressImage(file, { maxDimension: 512, quality: 0.85 })
      const fd = new FormData()
      fd.append("file", compressed)
      const res = await fetch(`/api/users/${userId}/avatar`, {
        method: "POST",
        body: fd,
      })
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        avatarUrl?: string
        error?: string
      }
      if (!res.ok || !data.ok) {
        setAvatarError(data.error ?? "Upload failed")
        return
      }
      setAvatarUrl(data.avatarUrl ?? null)
      // Refresh the user-store so the list thumbnail picks up the new avatar.
      await refreshUsers()
      // If the viewer just updated their own avatar, refresh the auth-store
      // so the header avatar updates without a page reload.
      if (currentAuthUser?.id === userId) {
        await refreshAuthUser()
      }
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setAvatarBusy(false)
    }
  }

  async function handleAvatarRemove() {
    if (!userId) return
    setAvatarBusy(true)
    setAvatarError(null)
    try {
      const res = await fetch(`/api/users/${userId}/avatar`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setAvatarError(data.error ?? "Failed to remove avatar")
        return
      }
      setAvatarUrl(null)
      await refreshUsers()
      if (currentAuthUser?.id === userId) {
        await refreshAuthUser()
      }
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : "Failed to remove avatar")
    } finally {
      setAvatarBusy(false)
    }
  }

  if (!user) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-ink-muted">User not found</p>
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

  // The actual update work — called by the PIN modal if role changed,
  // or directly by handleUpdateInformation if nothing privileged changed.
  async function doUpdateUser() {
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

  function handleUpdateInformation() {
    // Role change is a privilege change — require PIN re-verification.
    const roleChanged = user && userRole !== user.role
    if (roleChanged) {
      setPinAction("role-change")
      return
    }
    doUpdateUser()
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

  // The actual toggle/delete work — called by the PIN modal once verified.
  async function doToggleStatus() {
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

  async function doDeleteUser() {
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
      <SubNav
        onBack={() => router.push("/user-management")}
        backTestId="top-back-button"
      >
        <Button
          data-testid="delete-user-button"
          variant="danger"
          size="cta"
          onClick={() => setIsDeleteOpen(true)}
        >
          Delete User
        </Button>
      </SubNav>

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
                  <span className="text-base font-bold text-ink">
                    PIN Reset Successfully
                  </span>
                  <p className="text-sm text-ink-muted">
                    A new access PIN has been sent to the user&apos;s email address.
                  </p>
                </>
              ) : (
                <>
                  <span className="text-base font-bold text-ink">
                    PIN Reset — Email Failed
                  </span>
                  <p className="text-sm text-ink-muted">
                    The PIN was reset but the email could not be delivered.
                    Please share the new PIN with the user securely.
                  </p>
                  {resetPinResult.pin && (
                    <p className="mt-1 text-sm font-medium text-ink">
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
                <span className="text-base font-bold text-ink">
                  PIN Reset Failed
                </span>
                <p className="text-sm text-ink-muted">
                  {resetPinResult.emailError || "An unknown error occurred."}
                </p>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => setResetPinResult(null)}
            className="shrink-0 rounded-full p-1 text-gray-400 hover:text-ink-muted"
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
            className="text-3xl font-bold text-ink"
          >
            Manage {user.firstNames} {user.surname}
          </h1>
          <p className="text-base text-ink-muted">
            Manage the user&apos;s units and personal information below
          </p>
        </div>

        {/* Avatar — visible to everyone (read-only fallback for those who
            can't manage), upload controls only render for self or admin. */}
        <div
          data-testid="avatar-section"
          className="flex flex-col items-center gap-3"
        >
          <div
            data-testid="avatar-preview"
            className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-gray-50"
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt={`${user.firstNames} ${user.surname}`}
                className="size-full object-cover"
              />
            ) : (
              <UserIcon className="size-12 text-gray-300" strokeWidth={1.5} />
            )}
          </div>
          {canManageAvatar && (
            <div className="flex flex-col items-center gap-1">
              <div className="flex items-center gap-3">
                <label
                  htmlFor="avatar-file"
                  className={`inline-flex w-fit items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-ink ${
                    avatarBusy
                      ? "cursor-wait opacity-60"
                      : "cursor-pointer hover:bg-gray-100"
                  }`}
                >
                  {avatarBusy
                    ? "Uploading..."
                    : avatarUrl
                      ? "Replace photo"
                      : "Upload photo"}
                </label>
                <input
                  id="avatar-file"
                  data-testid="input-avatar-file"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={avatarBusy}
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ""
                    if (file) void handleAvatarUpload(file)
                  }}
                />
                {avatarUrl && (
                  <button
                    type="button"
                    data-testid="avatar-remove-button"
                    onClick={handleAvatarRemove}
                    disabled={avatarBusy}
                    className="text-xs text-red-600 hover:underline disabled:opacity-50"
                  >
                    Remove
                  </button>
                )}
              </div>
              <span className="text-[11px] text-ink-muted">
                PNG, JPEG, or WEBP. Max 2 MB.
              </span>
              {avatarError && (
                <span className="text-[11px] text-red-600">{avatarError}</span>
              )}
            </div>
          )}
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

          {/* Access Role — system_admin only. Unit-managers and regular
              users can't change roles, so the field is hidden entirely
              instead of shown as a single-option dropdown. */}
          {isSystemAdmin && (
            <FloatingSelect
              id="role"
              data-testid="select-role"
              label="Select Access Role"
              value={userRole}
              onChange={setUserRole}
              options={roleOptions}
            />
          )}
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
            variant="primary-outline"
            size="cta"
            onClick={() => setIsResetPinOpen(true)}
            className="w-full"
          >
            Reset Pin
          </Button>

          <button
            type="button"
            data-testid="disable-user-button"
            onClick={() => setIsStatusOpen(true)}
            className="mt-1 text-sm font-bold text-ink hover:text-ink-muted"
          >
            {user.status === "Active" ? "Disable User" : "Activate User"}
          </button>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        title={`Are you sure you want to delete ${user.firstNames} ${user.surname}?`}
        description="Deleting this user will permanently remove all associated records."
        confirmLabel="Yes, delete user"
        confirmLoadingLabel="Deleting..."
        confirmPending={deleting}
        confirmDisabled={toggling}
        onConfirm={() => {
          setIsDeleteOpen(false)
          setPinAction("delete")
        }}
        secondaryLabel="Disable user instead"
        secondaryLoadingLabel="Disabling..."
        secondaryPending={toggling}
        secondaryDisabled={deleting}
        onSecondary={() => {
          setIsDeleteOpen(false)
          setPinAction("toggle")
        }}
        cancelDisabled={deleting || toggling}
        confirmTestId="confirm-delete-button"
        secondaryTestId="disable-instead-button"
        cancelTestId="cancel-delete-button"
      />

      {/* Reset Pin Confirmation Dialog */}
      <Dialog open={isResetPinOpen} onOpenChange={setIsResetPinOpen}>
        <DialogContent className="rounded-2xl p-6 sm:p-8">
          <DialogHeader className="flex flex-col items-center gap-2 text-center">
            <DialogTitle>
              Are you sure you want to reset access pin?
            </DialogTitle>
            <DialogDescription className="text-sm text-ink-muted">
              You&apos;re about to reset this user&apos;s access pin, do you want to proceed?
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-3 pt-4">
            <Button
              data-testid="confirm-reset-pin-button"
              onClick={() => {
                setIsResetPinOpen(false)
                setVerificationCode("")
                setIsVerificationOpen(true)
              }}
              variant="primary"
              size="cta"
              className="w-full"
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
            <DialogTitle className="mx-4">
              Enter your nurse verification code to reset access pin
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col items-center gap-4 pt-3">
            <OtpInput
              value={verificationCode}
              onChange={setVerificationCode}
              error={!!verificationError}
              ariaLabel="Verification code"
              testId="verification-otp"
            />

            {verificationError && (
              <p className="text-center text-sm font-medium text-[#FF3A69]">
                {verificationError}
              </p>
            )}

            <Button
              data-testid="confirm-verification-button"
              disabled={verificationCode.length < PIN_LENGTH || verifying}
              onClick={async () => {
                setVerificationError("")
                setVerifying(true)

                const pin = verificationCode

                // Two-person sign-off via /api/verify/manager-pin (Phase 5
                // RLS forbids reading other users' PINs directly).
                // purpose="manager-action" restricts to unit_manager /
                // system_admin only — regular user PINs are rejected.
                const verifyRes = await fetch("/api/verify/manager-pin", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ pin, unitId: activeUnitId, purpose: "manager-action" }),
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
              variant="primary"
              size="cta"
              className="w-full"
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
      <ConfirmDialog
        open={isStatusOpen}
        onOpenChange={setIsStatusOpen}
        title={`${user.status === "Active" ? "Disable" : "Activate"} ${user.firstNames} ${user.surname}?`}
        description={
          user.status === "Active"
            ? "Disabling this user will restrict their access to the system. This can be reversed."
            : "Activating this user will restore their system access and permissions."
        }
        confirmLabel={`Yes, ${user.status === "Active" ? "disable" : "activate"} user`}
        confirmLoadingLabel={user.status === "Active" ? "Disabling..." : "Activating..."}
        confirmPending={toggling}
        onConfirm={() => {
          setIsStatusOpen(false)
          setPinAction("toggle")
        }}
        cancelDisabled={toggling}
        confirmTestId="confirm-status-button"
        cancelTestId="cancel-status-button"
      />

      {/* PIN verification modal — gates destructive + privilege-change actions.
          manager-action keeps this restricted to unit_manager / system_admin
          only; a regular user PIN can't authorise user-management changes. */}
      <PinVerificationModal
        open={pinAction !== null}
        onOpenChange={(open) => {
          if (!open) setPinAction(null)
        }}
        activeUnitId={activeUnitId}
        purpose="manager-action"
        heading={
          pinAction === "delete"
            ? "Confirm user deletion"
            : pinAction === "role-change"
              ? "Confirm role change"
              : pinAction === "toggle"
                ? user.status === "Active"
                  ? "Confirm user disable"
                  : "Confirm user activation"
                : "Enter your PIN"
        }
        subtitle={
          pinAction === "delete"
            ? "Enter your access PIN to permanently delete this user."
            : pinAction === "role-change"
              ? "Enter your access PIN to change this user's role."
              : pinAction === "toggle"
                ? "Enter your access PIN to change this user's status."
                : undefined
        }
        onVerified={async () => {
          const action = pinAction
          setPinAction(null)
          if (action === "delete") {
            await doDeleteUser()
          } else if (action === "role-change") {
            await doUpdateUser()
          } else if (action === "toggle") {
            await doToggleStatus()
          }
        }}
      />
    </div>
  )
}
