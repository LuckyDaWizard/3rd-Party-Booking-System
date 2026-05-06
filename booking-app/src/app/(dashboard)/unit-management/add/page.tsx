"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, ArrowRight, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FloatingInput } from "@/components/ui/floating-input"
import { FloatingSelect } from "@/components/ui/floating-select"
import { useClientStore } from "@/lib/client-store"
import { useUnitStore } from "@/lib/unit-store"

// ---------------------------------------------------------------------------
// Searchable Client Select
// ---------------------------------------------------------------------------

function ClientSearchSelect({
  value,
  onChange,
  clients,
}: {
  value: string
  onChange: (clientId: string) => void
  clients: { id: string; clientName: string }[]
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState("")
  const ref = useRef<HTMLDivElement>(null)

  const selectedClient = clients.find((c) => c.id === value)
  const filtered = search.trim()
    ? clients.filter((c) =>
        c.clientName.toLowerCase().includes(search.toLowerCase())
      )
    : clients

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
    <div ref={ref} className="relative">
      <button
        type="button"
        data-testid="client-search-select"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex h-14 w-full items-center rounded-lg border bg-white px-4 text-left text-sm outline-none transition-colors ${
          isOpen ? "border-gray-900" : "border-gray-300"
        }`}
      >
        <span className={selectedClient ? "text-gray-900" : "text-gray-400"}>
          {selectedClient?.clientName || "Search client to assign this unit to"}
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
              data-testid="client-search-input"
              placeholder="Search clients..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
              autoFocus
            />
          </div>
          <div className="mx-2 my-2 flex max-h-64 flex-col gap-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-4 py-3 text-sm text-gray-400">
                No clients found
              </div>
            ) : (
              filtered.map((client) => (
                <button
                  key={client.id}
                  type="button"
                  data-testid={`client-option-${client.id}`}
                  onClick={() => {
                    onChange(client.id)
                    setSearch("")
                    setIsOpen(false)
                  }}
                  className={`w-full rounded-lg px-5 py-4 text-left text-base text-gray-900 transition-colors hover:bg-[var(--client-primary-15)] ${
                    value === client.id ? "bg-[var(--client-primary-15)] font-medium" : ""
                  }`}
                >
                  {client.clientName}
                </button>
              ))
            )}
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

export default function AddUnitPage() {
  const router = useRouter()
  const { clients } = useClientStore()
  const { addUnit } = useUnitStore()

  const [clientId, setClientId] = useState("")
  const [unitName, setUnitName] = useState("")
  const [contactPersonName, setContactPersonName] = useState("")
  const [contactPersonSurname, setContactPersonSurname] = useState("")
  const [emailAddress, setEmailAddress] = useState("")
  const [province, setProvince] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const isFormComplete =
    clientId.trim() !== "" &&
    unitName.trim() !== ""

  async function handleSubmit() {
    if (!isFormComplete || submitting) return

    const selectedClient = clients.find((c) => c.id === clientId)

    setSubmitting(true)
    try {
      await addUnit({
        unitName,
        clientId,
        clientName: selectedClient?.clientName ?? "",
        contactPersonName,
        contactPersonSurname,
        email: emailAddress,
        province,
      })
      const params = new URLSearchParams({ added: unitName })
      router.push(`/unit-management?${params.toString()}`)
    } catch (err) {
      console.error("Failed to add unit:", err)
      setSubmitting(false)
    }
  }

  return (
    <div data-testid="add-unit-page" className="flex flex-col gap-8">
      {/* Top bar */}
      <div className="flex items-center justify-between rounded-xl bg-white px-6 py-4">
        <Link href="/unit-management">
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
            Add new unit
          </h1>
          <p className="text-base text-gray-500">
            Please provide the unit&apos;s details below
          </p>
        </div>

        {/* Fields */}
        <div className="flex w-full flex-col gap-4">
          {/* Client search dropdown */}
          <ClientSearchSelect
            value={clientId}
            onChange={setClientId}
            clients={clients.map((c) => ({ id: c.id, clientName: c.clientName }))}
          />

          {/* Unit Name */}
          <FloatingInput
            id="unitName"
            data-testid="unit-name-input"
            label="Unit Name"
            value={unitName}
            onChange={setUnitName}
            onClear={() => setUnitName("")}
          />

          {/* Contact Person Name + Surname */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FloatingInput
              id="contactPersonName"
              data-testid="contact-person-name-input"
              label="Contact Person Name"
              value={contactPersonName}
              onChange={setContactPersonName}
              onClear={() => setContactPersonName("")}
            />
            <FloatingInput
              id="contactPersonSurname"
              data-testid="contact-person-surname-input"
              label="Contact Person Surname"
              value={contactPersonSurname}
              onChange={setContactPersonSurname}
              onClear={() => setContactPersonSurname("")}
            />
          </div>

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

          {/* Select Province */}
          <FloatingSelect
            id="province"
            data-testid="select-province"
            label="Select Province"
            value={province}
            onChange={setProvince}
            options={PROVINCES.map((p) => ({ value: p, label: p }))}
          />
        </div>

        {/* Submit button */}
        <Button
          data-testid="add-unit-button"
          className="mt-2 w-full rounded-xl bg-gray-900 py-7 text-base font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          onClick={handleSubmit}
          disabled={!isFormComplete || submitting}
        >
          {submitting ? (
            <>
              Adding Unit...
              <svg className="ml-2 size-4 animate-spin" viewBox="0 0 40 40" fill="none">
                <circle cx="20" cy="20" r="15" stroke="#6b7280" strokeWidth="5" strokeLinecap="round" />
                <circle cx="20" cy="20" r="15" stroke="white" strokeWidth="5" strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset="70" />
              </svg>
            </>
          ) : (
            <>
              Add Unit
              <ArrowRight className="ml-2 size-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
