"use client"

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"
import { supabase } from "./supabase"
import { useAuth } from "./auth-store"


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UnitStatus = "Active" | "Disabled"

export interface UnitRecord {
  id: string
  status: UnitStatus
  unitName: string
  clientId: string
  clientName: string
  contactPersonName: string
  contactPersonSurname: string
  email: string
  province: string
  collectPaymentAtUnit: boolean
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface UnitStoreContextValue {
  units: UnitRecord[]
  loading: boolean
  addUnit: (unit: Omit<UnitRecord, "id" | "status">) => Promise<string>
  updateUnit: (id: string, updates: Partial<Omit<UnitRecord, "id">>) => Promise<void>
  deleteUnit: (id: string) => Promise<void>
  toggleUnitStatus: (id: string) => Promise<void>
  getUnit: (id: string) => UnitRecord | undefined
  refreshUnits: () => Promise<void>
}

const UnitStoreContext = createContext<UnitStoreContextValue | null>(null)

// ---------------------------------------------------------------------------
// DB types
// ---------------------------------------------------------------------------

interface DbUnit {
  id: string
  client_id: string
  unit_name: string
  contact_person_name: string | null
  contact_person_surname: string | null
  email: string | null
  province: string | null
  status: UnitStatus
  collect_payment_at_unit: boolean | null
}

interface DbClient {
  id: string
  client_name: string
}

function mapDbToUnit(row: DbUnit, clientName: string): UnitRecord {
  return {
    id: row.id,
    status: row.status ?? "Active",
    unitName: row.unit_name,
    clientId: row.client_id,
    clientName,
    contactPersonName: row.contact_person_name ?? "",
    contactPersonSurname: row.contact_person_surname ?? "",
    email: row.email ?? "",
    province: row.province ?? "",
    collectPaymentAtUnit: row.collect_payment_at_unit ?? false,
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function UnitStoreProvider({ children }: { children: ReactNode }) {
  const [units, setUnits] = useState<UnitRecord[]>([])
  const [loading, setLoading] = useState(true)
  const { user: authUser, refreshUser } = useAuth()

  const fetchUnits = useCallback(async () => {
    setLoading(true)

    // Fetch all clients for name lookup
    const { data: clientRows } = await supabase
      .from("clients")
      .select("id, client_name")

    const clientMap = new Map<string, string>()
    ;(clientRows as DbClient[] | null)?.forEach((c) => {
      clientMap.set(c.id, c.client_name)
    })

    const { data: unitRows, error } = await supabase
      .from("units")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching units:", error)
      setLoading(false)
      return
    }

    const mapped: UnitRecord[] = (unitRows as DbUnit[]).map((row) =>
      mapDbToUnit(row, clientMap.get(row.client_id) ?? "Unknown")
    )

    // Unit managers only see their assigned units
    if (authUser && authUser.role === "unit_manager") {
      setUnits(mapped.filter((u) => authUser.unitIds.includes(u.id)))
    } else {
      setUnits(mapped)
    }
    setLoading(false)
  }, [authUser])

  useEffect(() => {
    fetchUnits()
  }, [fetchUnits])

  // Province normalization moved to src/app/api/admin/units/route.ts where
  // all write paths now live. Client-side no longer needs the helper.

  async function addUnit(unit: Omit<UnitRecord, "id" | "status">) {
    // Routed through /api/admin/units — under Phase 5 RLS, the authenticated
    // role has no INSERT policy on public.units, so direct writes fail
    // silently. The API route also handles the auto-assign-to-creator
    // side-effect via `assignToUserId`.
    const res = await fetch("/api/admin/units", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        unitName: unit.unitName,
        clientId: unit.clientId,
        contactPersonName: unit.contactPersonName,
        contactPersonSurname: unit.contactPersonSurname,
        email: unit.email,
        province: unit.province,
        assignToUserId: authUser?.id ?? null,
      }),
    })

    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: res.statusText }))
      console.error("Error adding unit:", error)
      throw new Error(error || "Failed to create unit")
    }

    const { id: newUnitId } = (await res.json()) as { id: string }

    // Refresh auth user so unitIds includes the new unit (the route auto-
    // assigned us in user_units).
    if (authUser) {
      await refreshUser()
    }

    await fetchUnits()
    return newUnitId
  }

  async function updateUnit(id: string, updates: Partial<Omit<UnitRecord, "id">>) {
    const body: Record<string, unknown> = {}
    if (updates.unitName !== undefined) body.unitName = updates.unitName
    if (updates.contactPersonName !== undefined) body.contactPersonName = updates.contactPersonName
    if (updates.contactPersonSurname !== undefined) body.contactPersonSurname = updates.contactPersonSurname
    if (updates.email !== undefined) body.email = updates.email
    if (updates.province !== undefined) body.province = updates.province
    if (updates.status !== undefined) body.status = updates.status
    if (updates.clientId !== undefined) body.clientId = updates.clientId
    if (updates.collectPaymentAtUnit !== undefined) body.collectPaymentAtUnit = updates.collectPaymentAtUnit

    if (Object.keys(body).length > 0) {
      const res = await fetch(`/api/admin/units/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: res.statusText }))
        console.error("Error updating unit:", error)
      }
    }

    await fetchUnits()
  }

  async function deleteUnit(id: string) {
    const res = await fetch(`/api/admin/units/${id}`, { method: "DELETE" })
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: res.statusText }))
      console.error("Error deleting unit:", error)
      return
    }
    await fetchUnits()
  }

  async function toggleUnitStatus(id: string) {
    const unit = units.find((u) => u.id === id)
    if (!unit) return

    const newStatus: UnitStatus = unit.status === "Active" ? "Disabled" : "Active"
    const res = await fetch(`/api/admin/units/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    })
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: res.statusText }))
      console.error("Error toggling unit status:", error)
    }
    await fetchUnits()
  }

  function getUnit(id: string) {
    return units.find((u) => u.id === id)
  }

  return (
    <UnitStoreContext.Provider value={{ units, loading, addUnit, updateUnit, deleteUnit, toggleUnitStatus, getUnit, refreshUnits: fetchUnits }}>
      {children}
    </UnitStoreContext.Provider>
  )
}

export function useUnitStore() {
  const ctx = useContext(UnitStoreContext)
  if (!ctx) {
    throw new Error("useUnitStore must be used within UnitStoreProvider")
  }
  return ctx
}
