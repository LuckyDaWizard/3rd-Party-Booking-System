"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, ArrowRight, X, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useUnitStore } from "@/lib/unit-store"
import { useUserStore } from "@/lib/user-store"

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

  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([])
  const [firstNames, setFirstNames] = useState("")
  const [surname, setSurname] = useState("")
  const [emailAddress, setEmailAddress] = useState("")
  const [contactNumber, setContactNumber] = useState("")

  const isFormComplete =
    firstNames.trim() !== "" &&
    surname.trim() !== ""

  async function handleSubmit() {
    if (!isFormComplete) return

    // Get client from first selected unit
    const firstUnit = units.find((u) => u.id === selectedUnitIds[0])

    try {
      await addUser({
        firstNames,
        surname,
        email: emailAddress,
        contactNumber,
        pin: "1234",
        unitIds: selectedUnitIds,
        clientId: firstUnit?.clientId ?? "",
      })
      const params = new URLSearchParams({
        added: `${firstNames} ${surname}`,
      })
      router.push(`/user-management?${params.toString()}`)
    } catch (err) {
      console.error("Failed to add user:", err)
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
            onChange={setEmailAddress}
            onClear={() => setEmailAddress("")}
            type="email"
          />

          {/* Contact Number */}
          <FloatingInput
            id="contactNumber"
            data-testid="contact-number-input"
            label="Contact Number"
            value={contactNumber}
            onChange={setContactNumber}
            onClear={() => setContactNumber("")}
            type="tel"
          />
        </div>

        {/* Submit button */}
        <Button
          data-testid="add-user-button"
          className="mt-2 w-full rounded-xl bg-gray-900 py-7 text-base font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          onClick={handleSubmit}
          disabled={!isFormComplete}
        >
          Add User
          <ArrowRight className="ml-2 size-4" />
        </Button>
      </div>
    </div>
  )
}
