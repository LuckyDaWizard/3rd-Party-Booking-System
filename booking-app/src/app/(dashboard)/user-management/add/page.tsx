"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, ArrowRight, X, ChevronDown, User as UserIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FloatingInput } from "@/components/ui/floating-input"
import { FloatingSelect } from "@/components/ui/floating-select"
import { useUnitStore } from "@/lib/unit-store"
import { useUserStore } from "@/lib/user-store"
import { useAuth } from "@/lib/auth-store"
import { supabase } from "@/lib/supabase"
import { validateImageMinDimensions } from "@/lib/image-dimensions"

const AVATAR_MIN_WIDTH = 80
const AVATAR_MIN_HEIGHT = 80
const AVATAR_MAX_BYTES = 2 * 1024 * 1024
const AVATAR_ACCEPT = "image/png,image/jpeg,image/webp"

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
      {/* Dropdown trigger */}
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
                    data-testid={`unit-option-${unit.id}`}
                    onClick={() => {
                      handleSelect(unit.id)
                    }}
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

      {/* Selected chips */}
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

export default function AddUserPage() {
  const router = useRouter()
  const { units } = useUnitStore()
  const { addUser } = useUserStore()
  const { isSystemAdmin } = useAuth()

  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([])
  const [firstNames, setFirstNames] = useState("")
  const [surname, setSurname] = useState("")
  const [emailAddress, setEmailAddress] = useState("")
  const [contactNumber, setContactNumber] = useState("")
  const [role, setRole] = useState("")
  const [emailError, setEmailError] = useState("")
  const [contactError, setContactError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null)

  // System admin can assign any role; unit managers can only create regular users
  const roleOptions = isSystemAdmin
    ? [
        { value: "user", label: "User" },
        { value: "unit_manager", label: "Unit Manager" },
        { value: "system_admin", label: "System Admin" },
      ]
    : [
        { value: "user", label: "User" },
      ]

  const isFormComplete =
    firstNames.trim() !== "" &&
    surname.trim() !== "" &&
    role.trim() !== "" &&
    !emailError &&
    !contactError

  async function checkEmailExists(email: string) {
    if (!email.trim()) {
      setEmailError("")
      return
    }
    const { data } = await supabase
      .from("users")
      .select("id")
      .eq("email", email.trim())
      .limit(1)

    if (data && data.length > 0) {
      setEmailError("This email is already assigned to an existing user")
    } else {
      setEmailError("")
    }
  }

  async function checkContactExists(contact: string) {
    if (!contact.trim()) {
      setContactError("")
      return
    }
    const { data } = await supabase
      .from("users")
      .select("id")
      .eq("contact_number", contact.trim())
      .limit(1)

    if (data && data.length > 0) {
      setContactError("This contact number is already assigned to an existing user")
    } else {
      setContactError("")
    }
  }

  async function handleSubmit() {
    if (!isFormComplete || submitting) return

    setSubmitting(true)
    try {
      // Final check before submit
      await checkEmailExists(emailAddress)
      await checkContactExists(contactNumber)
      if (emailError || contactError) {
        setSubmitting(false)
        return
      }

      // Get client from first selected unit
      const firstUnit = units.find((u) => u.id === selectedUnitIds[0])

      // The server generates a cryptographically secure PIN with crypto.randomInt()
      // and returns it so we can show it once to the admin in the success banner.
      const { id: newUserId, pin: newPin } = await addUser({
        firstNames,
        surname,
        email: emailAddress,
        contactNumber,
        role,
        unitIds: selectedUnitIds,
        clientId: firstUnit?.clientId ?? "",
      })
      try {
        sessionStorage.setItem("carefirst_new_user_pin", newPin)
      } catch {
        // ignore — SSR / private mode
      }

      // Avatar (optional). Best-effort: if upload fails the user still
      // exists and admin can retry from Manage User. We surface a soft
      // alert rather than blocking the flow.
      if (avatarFile && newUserId) {
        try {
          const fd = new FormData()
          fd.append("file", avatarFile)
          const uploadRes = await fetch(`/api/users/${newUserId}/avatar`, {
            method: "POST",
            body: fd,
          })
          if (!uploadRes.ok) {
            const { error } = await uploadRes.json().catch(() => ({}))
            alert(`User created, but avatar upload failed: ${error ?? uploadRes.statusText}. You can upload it from Manage User.`)
          }
        } catch (uploadErr) {
          console.warn("Avatar upload failed:", uploadErr)
        }
      }
      const params = new URLSearchParams({
        added: `${firstNames} ${surname}`,
      })
      router.push(`/user-management?${params.toString()}`)
    } catch (err) {
      console.error("Failed to add user:", err)
      setSubmitting(false)
    }
  }

  return (
    <div data-testid="add-user-page" className="flex flex-col gap-8">
      {/* Top bar */}
      <div className="flex items-center justify-between rounded-xl bg-white px-6 py-4">
        <Link href="/user-management">
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

      {/* Form card */}
      <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-6 pt-4">
        {/* Heading */}
        <div className="flex flex-col items-center gap-2">
          <h1
            data-testid="page-heading"
            className="text-3xl font-bold text-gray-900"
          >
            Add new user
          </h1>
          <p className="text-base text-gray-500">
            Please provide the User&apos;s details below
          </p>
        </div>

        {/* Avatar (optional). Uploaded after the user record is created — we
            need an id first. Best-effort; the user can upload later from
            Manage User if this fails. */}
        <div
          data-testid="avatar-section"
          className="flex flex-col items-center gap-3"
        >
          <div
            data-testid="avatar-preview"
            className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-gray-50"
          >
            {avatarPreviewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarPreviewUrl}
                alt="Avatar preview"
                className="size-full object-cover"
              />
            ) : (
              <UserIcon className="size-12 text-gray-300" strokeWidth={1.5} />
            )}
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-3">
              <label
                htmlFor="avatar-file"
                className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
              >
                {avatarFile ? "Replace photo" : "Upload photo (optional)"}
              </label>
              <input
                id="avatar-file"
                data-testid="input-avatar-file"
                type="file"
                accept={AVATAR_ACCEPT}
                className="hidden"
                onChange={async (e) => {
                  const picked = e.target.files?.[0] ?? null
                  e.target.value = ""
                  if (!picked) return
                  if (picked.size > AVATAR_MAX_BYTES) {
                    alert("Photo must be 2 MB or smaller.")
                    return
                  }
                  const dimsError = await validateImageMinDimensions(
                    picked,
                    AVATAR_MIN_WIDTH,
                    AVATAR_MIN_HEIGHT
                  )
                  if (dimsError) {
                    alert(dimsError)
                    return
                  }
                  if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl)
                  setAvatarFile(picked)
                  setAvatarPreviewUrl(URL.createObjectURL(picked))
                }}
              />
              {avatarFile && (
                <button
                  type="button"
                  data-testid="avatar-remove-button"
                  onClick={() => {
                    if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl)
                    setAvatarFile(null)
                    setAvatarPreviewUrl(null)
                  }}
                  className="text-xs text-red-600 hover:underline"
                >
                  Remove
                </button>
              )}
            </div>
            <span className="text-[11px] text-gray-500">
              PNG, JPEG, or WEBP. Max 2 MB.
            </span>
          </div>
        </div>

        {/* Fields */}
        <div className="flex w-full flex-col gap-4">
          {/* Unit multi-select dropdown */}
          <UnitMultiSelect
            selectedIds={selectedUnitIds}
            onChange={setSelectedUnitIds}
            units={units.map((u) => ({
              id: u.id,
              unitName: u.unitName,
              clientName: u.clientName,
            }))}
          />

          {/* First Names */}
          <FloatingInput
            id="firstNames"
            data-testid="first-names-input"
            label="First Names"
            value={firstNames}
            onChange={setFirstNames}
            onClear={() => setFirstNames("")}
          />

          {/* Surname */}
          <FloatingInput
            id="surname"
            data-testid="surname-input"
            label="Surname"
            value={surname}
            onChange={setSurname}
            onClear={() => setSurname("")}
          />

          {/* Email Address */}
          <FloatingInput
            id="emailAddress"
            data-testid="email-input"
            label="Email Address"
            value={emailAddress}
            onChange={(v) => {
              setEmailAddress(v)
              if (emailError) setEmailError("")
            }}
            onClear={() => { setEmailAddress(""); setEmailError("") }}
            onBlur={() => checkEmailExists(emailAddress)}
            type="email"
            error={emailError}
          />

          {/* Contact Number */}
          <FloatingInput
            id="contactNumber"
            data-testid="contact-number-input"
            label="Contact Number"
            value={contactNumber}
            onChange={(v) => {
              setContactNumber(v)
              if (contactError) setContactError("")
            }}
            onClear={() => { setContactNumber(""); setContactError("") }}
            onBlur={() => checkContactExists(contactNumber)}
            type="tel"
            error={contactError}
          />

          {/* Access Role */}
          <FloatingSelect
            id="role"
            data-testid="select-role"
            label="Select Access Role"
            value={role}
            onChange={setRole}
            options={roleOptions}
          />
        </div>

        {/* Submit button */}
        <Button
          data-testid="add-user-button"
          className="mt-2 w-full rounded-xl bg-gray-900 py-7 text-base font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          onClick={handleSubmit}
          disabled={!isFormComplete || submitting}
        >
          {submitting ? (
            <>
              Adding User...
              <svg className="ml-2 size-4 animate-spin" viewBox="0 0 40 40" fill="none">
                <circle cx="20" cy="20" r="15" stroke="#6b7280" strokeWidth="5" strokeLinecap="round" />
                <circle cx="20" cy="20" r="15" stroke="white" strokeWidth="5" strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset="70" />
              </svg>
            </>
          ) : (
            <>
              Add User
              <ArrowRight className="ml-2 size-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
