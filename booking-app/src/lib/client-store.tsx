"use client"

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"
import { supabase } from "./supabase"
import { useAuth } from "./auth-store"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ClientStatus = "Active" | "Disabled"

export interface ClientRecord {
  id: string
  status: ClientStatus
  clientName: string
  contactPersonName: string
  contactPersonSurname: string
  units: string
  email: string
  number: string
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface ClientStoreContextValue {
  clients: ClientRecord[]
  loading: boolean
  addClient: (client: Omit<ClientRecord, "id" | "status">) => Promise<string>
  updateClient: (id: string, updates: Partial<Omit<ClientRecord, "id">>) => Promise<void>
  updateClientUnit: (id: string, units: string) => Promise<void>
  deleteClient: (id: string) => Promise<void>
  toggleClientStatus: (id: string) => Promise<void>
  getClient: (id: string) => ClientRecord | undefined
  refreshClients: () => Promise<void>
}

const ClientStoreContext = createContext<ClientStoreContextValue | null>(null)

// ---------------------------------------------------------------------------
// Helpers — map between DB snake_case and frontend camelCase
// ---------------------------------------------------------------------------

interface DbClient {
  id: string
  client_name: string
  email: string
  contact_number: string
  status: ClientStatus
  contact_person_name: string | null
  contact_person_surname: string | null
}

interface DbUnit {
  unit_name: string
}

interface DbUnitWithClientId {
  client_id: string
  unit_name: string
}

function mapDbToClient(row: DbClient, unitName: string): ClientRecord {
  return {
    id: row.id,
    status: row.status,
    clientName: row.client_name,
    contactPersonName: row.contact_person_name ?? "",
    contactPersonSurname: row.contact_person_surname ?? "",
    units: unitName,
    email: row.email,
    number: row.contact_number,
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function ClientStoreProvider({ children }: { children: ReactNode }) {
  const [clients, setClients] = useState<ClientRecord[]>([])
  const [loading, setLoading] = useState(true)
  const { user: authUser } = useAuth()

  const fetchClients = useCallback(async () => {
    setLoading(true)
    const { data: clientRows, error } = await supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching clients:", error)
      setLoading(false)
      return
    }

    // Fetch ALL units for ALL clients in a single query, then group by
    // client_id. This replaces the previous N+1 pattern that also incorrectly
    // limited each client to just its first unit (breaking display for any
    // client with multiple units, e.g. Brian The Analyst → Linden, Sandton).
    const clientIds = (clientRows as DbClient[]).map((c) => c.id)
    const unitsByClient = new Map<string, string[]>()
    if (clientIds.length > 0) {
      const { data: allUnits } = await supabase
        .from("units")
        .select("client_id, unit_name")
        .in("client_id", clientIds)
        .order("unit_name", { ascending: true })

      for (const row of (allUnits as DbUnitWithClientId[] | null) ?? []) {
        const list = unitsByClient.get(row.client_id) ?? []
        list.push(row.unit_name)
        unitsByClient.set(row.client_id, list)
      }
    }

    const mapped: ClientRecord[] = (clientRows as DbClient[]).map((row) => {
      const names = unitsByClient.get(row.id) ?? []
      const display = names.length > 0 ? names.join(", ") : "-"
      return mapDbToClient(row, display)
    })

    // Unit managers only see clients linked to their assigned units
    if (authUser && authUser.role === "unit_manager" && authUser.unitIds.length > 0) {
      // Get client IDs from manager's assigned units
      const { data: managerUnits } = await supabase
        .from("units")
        .select("client_id")
        .in("id", authUser.unitIds)

      const allowedClientIds = new Set(
        (managerUnits as { client_id: string }[] | null)?.map((u) => u.client_id) ?? []
      )
      setClients(mapped.filter((c) => allowedClientIds.has(c.id)))
    } else {
      setClients(mapped)
    }
    setLoading(false)
  }, [authUser])

  useEffect(() => {
    fetchClients()
  }, [fetchClients])

  async function addClient(client: Omit<ClientRecord, "id" | "status">) {
    const { data, error } = await supabase
      .from("clients")
      .insert({
        client_name: client.clientName,
        contact_person_name: client.contactPersonName,
        contact_person_surname: client.contactPersonSurname,
        email: client.email,
        contact_number: client.number,
        status: "Active",
      })
      .select("id")
      .single()

    if (error) {
      console.error("Error adding client:", error)
      throw error
    }

    const id = data.id

    // If unit name provided, insert unit
    if (client.units && client.units !== "-") {
      await supabase.from("units").insert({
        client_id: id,
        unit_name: client.units,
      })
    }

    await fetchClients()
    return id
  }

  async function updateClient(id: string, updates: Partial<Omit<ClientRecord, "id">>) {
    const dbUpdates: Record<string, unknown> = {}
    if (updates.clientName !== undefined) dbUpdates.client_name = updates.clientName
    if (updates.contactPersonName !== undefined) dbUpdates.contact_person_name = updates.contactPersonName
    if (updates.contactPersonSurname !== undefined) dbUpdates.contact_person_surname = updates.contactPersonSurname
    if (updates.email !== undefined) dbUpdates.email = updates.email
    if (updates.number !== undefined) dbUpdates.contact_number = updates.number
    if (updates.status !== undefined) dbUpdates.status = updates.status

    if (Object.keys(dbUpdates).length > 0) {
      const { error } = await supabase.from("clients").update(dbUpdates).eq("id", id)
      if (error) console.error("Error updating client:", error)
    }

    await fetchClients()
  }

  async function updateClientUnit(id: string, unitName: string) {
    // Update the first unit or insert one
    const { data: existingUnits } = await supabase
      .from("units")
      .select("id")
      .eq("client_id", id)
      .limit(1)

    if (existingUnits && existingUnits.length > 0) {
      await supabase.from("units").update({ unit_name: unitName }).eq("id", existingUnits[0].id)
    } else {
      await supabase.from("units").insert({ client_id: id, unit_name: unitName })
    }

    await fetchClients()
  }

  async function deleteClient(id: string) {
    const { error } = await supabase.from("clients").delete().eq("id", id)
    if (error) {
      console.error("Error deleting client:", error)
      return
    }
    await fetchClients()
  }

  async function toggleClientStatus(id: string) {
    const client = clients.find((c) => c.id === id)
    if (!client) return

    const newStatus = client.status === "Active" ? "Disabled" : "Active"
    await supabase.from("clients").update({ status: newStatus }).eq("id", id)
    await fetchClients()
  }

  function getClient(id: string) {
    return clients.find((c) => c.id === id)
  }

  return (
    <ClientStoreContext.Provider value={{ clients, loading, addClient, updateClient, updateClientUnit, deleteClient, toggleClientStatus, getClient, refreshClients: fetchClients }}>
      {children}
    </ClientStoreContext.Provider>
  )
}

export function useClientStore() {
  const ctx = useContext(ClientStoreContext)
  if (!ctx) {
    throw new Error("useClientStore must be used within ClientStoreProvider")
  }
  return ctx
}
