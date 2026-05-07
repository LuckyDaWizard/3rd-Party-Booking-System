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
  logoUrl: string | null
  faviconUrl: string | null
  accentColor: string | null
  /**
   * When TRUE, every unit under this client skips the payment gateway and
   * the unit collects the consultation fee directly. Set system-admin-side
   * on the Manage Client page; defaults to FALSE for new clients.
   */
  collectPaymentAtUnit: boolean
  /**
   * When TRUE, every booking under this client skips the payment step
   * entirely (no gateway, no in-unit confirm) and is auto-marked
   * Payment Complete with payment_type = 'monthly_invoice'. The client
   * is invoiced separately at month-end. Mutually exclusive with
   * collectPaymentAtUnit at the UI layer; both default to FALSE.
   */
  billMonthly: boolean
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface ClientStoreContextValue {
  clients: ClientRecord[]
  loading: boolean
  /**
   * `collectPaymentAtUnit` is excluded from create — the column defaults to
   * FALSE at the DB level and is only ever set via the Manage Client page
   * toggle (system_admin only). New clients always start gateway-billed.
   */
  addClient: (
    client: Omit<ClientRecord, "id" | "status" | "collectPaymentAtUnit" | "billMonthly">
  ) => Promise<string>
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
  logo_url: string | null
  favicon_url: string | null
  accent_color: string | null
  collect_payment_at_unit: boolean | null
  bill_monthly: boolean | null
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
    logoUrl: row.logo_url,
    faviconUrl: row.favicon_url,
    accentColor: row.accent_color,
    collectPaymentAtUnit: row.collect_payment_at_unit ?? false,
    billMonthly: row.bill_monthly ?? false,
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

  async function addClient(
    client: Omit<ClientRecord, "id" | "status" | "collectPaymentAtUnit" | "billMonthly">
  ) {
    // Routed through /api/admin/clients — under Phase 5 RLS, the authenticated
    // role has no INSERT policy on public.clients, so direct writes fail
    // silently. All admin writes go through service-role API routes.
    const res = await fetch("/api/admin/clients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientName: client.clientName,
        contactPersonName: client.contactPersonName,
        contactPersonSurname: client.contactPersonSurname,
        email: client.email,
        contactNumber: client.number,
        initialUnitName: client.units && client.units !== "-" ? client.units : null,
        accentColor: client.accentColor ?? null,
      }),
    })

    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: res.statusText }))
      console.error("Error adding client:", error)
      throw new Error(error || "Failed to create client")
    }

    const { id } = (await res.json()) as { id: string }
    await fetchClients()
    return id
  }

  async function updateClient(id: string, updates: Partial<Omit<ClientRecord, "id">>) {
    // Routed through /api/admin/clients/[id] (see addClient note).
    const body: Record<string, unknown> = {}
    if (updates.clientName !== undefined) body.clientName = updates.clientName
    if (updates.contactPersonName !== undefined) body.contactPersonName = updates.contactPersonName
    if (updates.contactPersonSurname !== undefined) body.contactPersonSurname = updates.contactPersonSurname
    if (updates.email !== undefined) body.email = updates.email
    if (updates.number !== undefined) body.contactNumber = updates.number
    if (updates.status !== undefined) body.status = updates.status
    if (updates.accentColor !== undefined) body.accentColor = updates.accentColor
    if (updates.collectPaymentAtUnit !== undefined) body.collectPaymentAtUnit = updates.collectPaymentAtUnit
    if (updates.billMonthly !== undefined) body.billMonthly = updates.billMonthly

    if (Object.keys(body).length > 0) {
      const res = await fetch(`/api/admin/clients/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: res.statusText }))
        console.error("Error updating client:", error)
        // Throw so the caller can surface the failure. Previously we
        // returned silently and the manage page would navigate away on
        // a 500 / RLS denial without any feedback. Mirrors the
        // deleteClient pattern set up for the cascade fix.
        throw new Error(error || "Failed to update client")
      }
    }

    await fetchClients()
  }

  async function updateClientUnit(id: string, unitName: string) {
    // This mutates a related unit rather than the client itself. Look up the
    // first existing unit for this client and either PATCH it or POST a new
    // one via the admin units routes.
    const { data: existingUnits } = await supabase
      .from("units")
      .select("id")
      .eq("client_id", id)
      .limit(1)

    if (existingUnits && existingUnits.length > 0) {
      const res = await fetch(`/api/admin/units/${existingUnits[0].id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ unitName }),
      })
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: res.statusText }))
        console.error("Error updating client unit:", error)
      }
    } else {
      const res = await fetch("/api/admin/units", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId: id, unitName }),
      })
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: res.statusText }))
        console.error("Error creating client unit:", error)
      }
    }

    await fetchClients()
  }

  async function deleteClient(id: string) {
    const res = await fetch(`/api/admin/clients/${id}`, { method: "DELETE" })
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: res.statusText }))
      console.error("Error deleting client:", error)
      // Throw so the caller can surface the failure instead of navigating
      // to a fake "deleted" success banner. Previously this returned
      // silently and Manage Client would push to /client-management?deleted=...
      // even when the row was still in the DB.
      throw new Error(error || "Failed to delete client")
    }
    await fetchClients()
  }

  async function toggleClientStatus(id: string) {
    const client = clients.find((c) => c.id === id)
    if (!client) return

    const newStatus: ClientStatus = client.status === "Active" ? "Disabled" : "Active"
    const res = await fetch(`/api/admin/clients/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    })
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: res.statusText }))
      console.error("Error toggling client status:", error)
    }
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
