"use client"

import { createContext, useContext, useState, type ReactNode } from "react"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ClientStatus = "Active" | "Disabled"

export interface ClientRecord {
  id: string
  status: ClientStatus
  clientName: string
  units: string
  email: string
  number: string
}

// ---------------------------------------------------------------------------
// Initial data
// ---------------------------------------------------------------------------

const INITIAL_CLIENTS: ClientRecord[] = [
  {
    id: "1",
    status: "Active",
    clientName: "MediRite Pharmacy",
    units: "MediRite Pharmacy",
    email: "contact@mediRite.co.za",
    number: "078 456 7890",
  },
  {
    id: "2",
    status: "Active",
    clientName: "Arrie Nel Pharmacy Group",
    units: "Eastgate Shopping Centre",
    email: "contact@arrienel-demo.co.za",
    number: "073 116 3913",
  },
  {
    id: "3",
    status: "Active",
    clientName: "Alpha Pharm",
    units: "Alpha Rustenburg",
    email: "contact@arrienel-demo.co.za",
    number: "072 222 1990",
  },
  {
    id: "4",
    status: "Disabled",
    clientName: "Mediclinic Pharmacy",
    units: "Checkers Hyper Cresta",
    email: "support@medirite-demo.co.za",
    number: "084 156 2000",
  },
]

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface ClientStoreContextValue {
  clients: ClientRecord[]
  addClient: (client: Omit<ClientRecord, "id" | "status">) => string
  updateClient: (id: string, updates: Partial<Omit<ClientRecord, "id">>) => void
  updateClientUnit: (id: string, units: string) => void
  deleteClient: (id: string) => void
  toggleClientStatus: (id: string) => void
  getClient: (id: string) => ClientRecord | undefined
}

const ClientStoreContext = createContext<ClientStoreContextValue | null>(null)

export function ClientStoreProvider({ children }: { children: ReactNode }) {
  const [clients, setClients] = useState<ClientRecord[]>(INITIAL_CLIENTS)

  function addClient(client: Omit<ClientRecord, "id" | "status">) {
    const id = String(Date.now())
    const newClient: ClientRecord = {
      ...client,
      id,
      status: "Active",
    }
    setClients((prev) => [...prev, newClient])
    return id
  }

  function updateClient(id: string, updates: Partial<Omit<ClientRecord, "id">>) {
    setClients((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
    )
  }

  function updateClientUnit(id: string, units: string) {
    setClients((prev) =>
      prev.map((c) => (c.id === id ? { ...c, units } : c))
    )
  }

  function deleteClient(id: string) {
    setClients((prev) => prev.filter((c) => c.id !== id))
  }

  function toggleClientStatus(id: string) {
    setClients((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, status: c.status === "Active" ? "Disabled" : "Active" }
          : c
      )
    )
  }

  function getClient(id: string) {
    return clients.find((c) => c.id === id)
  }

  return (
    <ClientStoreContext.Provider value={{ clients, addClient, updateClient, updateClientUnit, deleteClient, toggleClientStatus, getClient }}>
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
