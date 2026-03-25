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
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function UnitStoreProvider({ children }: { children: ReactNode }) {
  const [units, setUnits] = useState<UnitRecord[]>([])
  const [loading, setLoading] = useState(true)
  const { user: authUser } = useAuth()

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

  async function addUnit(unit: Omit<UnitRecord, "id" | "status">) {
    const { data, error } = await supabase
      .from("units")
      .insert({
        client_id: unit.clientId,
        unit_name: unit.unitName,
        contact_person_name: unit.contactPersonName,
        contact_person_surname: unit.contactPersonSurname,
        email: unit.email,
        province: unit.province,
        status: "Active",
      })
      .select("id")
      .single()

    if (error) {
      console.error("Error adding unit:", error)
      throw error
    }

    await fetchUnits()
    return data.id
  }

  async function updateUnit(id: string, updates: Partial<Omit<UnitRecord, "id">>) {
    const dbUpdates: Record<string, unknown> = {}
    if (updates.unitName !== undefined) dbUpdates.unit_name = updates.unitName
    if (updates.contactPersonName !== undefined) dbUpdates.contact_person_name = updates.contactPersonName
    if (updates.contactPersonSurname !== undefined) dbUpdates.contact_person_surname = updates.contactPersonSurname
    if (updates.email !== undefined) dbUpdates.email = updates.email
    if (updates.province !== undefined) dbUpdates.province = updates.province
    if (updates.status !== undefined) dbUpdates.status = updates.status
    if (updates.clientId !== undefined) dbUpdates.client_id = updates.clientId

    if (Object.keys(dbUpdates).length > 0) {
      const { error } = await supabase.from("units").update(dbUpdates).eq("id", id)
      if (error) console.error("Error updating unit:", error)
    }

    await fetchUnits()
  }

  async function deleteUnit(id: string) {
    const { error } = await supabase.from("units").delete().eq("id", id)
    if (error) {
      console.error("Error deleting unit:", error)
      return
    }
    await fetchUnits()
  }

  async function toggleUnitStatus(id: string) {
    const unit = units.find((u) => u.id === id)
    if (!unit) return

    const newStatus = unit.status === "Active" ? "Disabled" : "Active"
    await supabase.from("units").update({ status: newStatus }).eq("id", id)
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
