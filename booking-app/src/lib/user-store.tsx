"use client"

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"
import { supabase } from "./supabase"
import { useAuth } from "./auth-store"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UserStatus = "Active" | "Disabled"

export interface UserUnitInfo {
  unitId: string
  unitName: string
}

export interface UserRecord {
  id: string
  status: UserStatus
  role: string
  firstNames: string
  surname: string
  email: string
  contactNumber: string
  units: UserUnitInfo[]
  unitName: string // comma-separated display string
  clientId: string
  clientName: string
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface AddUserInput {
  firstNames: string
  surname: string
  email: string
  contactNumber: string
  role: string
  unitIds: string[]
  clientId: string
}

export interface AddUserResult {
  id: string
  pin: string
}

interface UserStoreContextValue {
  users: UserRecord[]
  loading: boolean
  addUser: (user: AddUserInput) => Promise<AddUserResult>
  updateUser: (id: string, updates: Partial<Omit<UserRecord, "id" | "unitName" | "clientName" | "units">>) => Promise<void>
  updateUserUnits: (userId: string, unitIds: string[]) => Promise<void>
  deleteUser: (id: string) => Promise<void>
  toggleUserStatus: (id: string) => Promise<void>
  getUser: (id: string) => UserRecord | undefined
  refreshUsers: () => Promise<void>
}

const UserStoreContext = createContext<UserStoreContextValue | null>(null)

// ---------------------------------------------------------------------------
// DB types
// ---------------------------------------------------------------------------

interface DbUser {
  id: string
  first_names: string
  surname: string
  email: string
  contact_number: string
  role: string
  unit_id: string | null
  client_id: string | null
  status: UserStatus
}

interface DbUnit {
  id: string
  unit_name: string
}

interface DbClient {
  id: string
  client_name: string
}

interface DbUserUnit {
  user_id: string
  unit_id: string
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function UserStoreProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<UserRecord[]>([])
  const [loading, setLoading] = useState(true)
  const { user: authUser, activeUnitId } = useAuth()

  const fetchUsers = useCallback(async () => {
    setLoading(true)

    // Fetch lookup data
    const { data: unitRows } = await supabase
      .from("units")
      .select("id, unit_name")
    const unitMap = new Map<string, string>()
    ;(unitRows as DbUnit[] | null)?.forEach((u) => {
      unitMap.set(u.id, u.unit_name)
    })

    const { data: clientRows } = await supabase
      .from("clients")
      .select("id, client_name")
    const clientMap = new Map<string, string>()
    ;(clientRows as DbClient[] | null)?.forEach((c) => {
      clientMap.set(c.id, c.client_name)
    })

    // Fetch user-unit assignments
    const { data: userUnitRows } = await supabase
      .from("user_units")
      .select("user_id, unit_id")
    const userUnitsMap = new Map<string, string[]>()
    ;(userUnitRows as DbUserUnit[] | null)?.forEach((uu) => {
      const existing = userUnitsMap.get(uu.user_id) ?? []
      existing.push(uu.unit_id)
      userUnitsMap.set(uu.user_id, existing)
    })

    // The plaintext `pin` column has been dropped — credentials live in
    // auth.users. Read the raw users table.
    const { data: userRows, error } = await supabase
      .from("users")
      .select("id, first_names, surname, email, contact_number, role, unit_id, client_id, status")
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching users:", error)
      setLoading(false)
      return
    }

    const mapped: UserRecord[] = (userRows as DbUser[]).map((row) => {
      // Get units from junction table, fallback to legacy unit_id
      const assignedUnitIds = userUnitsMap.get(row.id) ?? (row.unit_id ? [row.unit_id] : [])
      const unitInfos: UserUnitInfo[] = assignedUnitIds.map((uid) => ({
        unitId: uid,
        unitName: unitMap.get(uid) ?? "-",
      }))
      const unitDisplayName = unitInfos.length > 0
        ? unitInfos.map((u) => u.unitName).join(", ")
        : "-"

      return {
        id: row.id,
        status: row.status,
        role: row.role ?? "user",
        firstNames: row.first_names,
        surname: row.surname,
        email: row.email,
        contactNumber: row.contact_number,
        units: unitInfos,
        unitName: unitDisplayName,
        clientId: row.client_id ?? "",
        clientName: row.client_id ? clientMap.get(row.client_id) ?? "-" : "-",
      }
    })

    // Filter by active unit for unit managers, and hide system admins from non-admins
    if (authUser && authUser.role === "unit_manager" && activeUnitId) {
      const filtered = mapped.filter((u) =>
        u.role !== "system_admin" &&
        u.units.some((unit) => unit.unitId === activeUnitId)
      )
      setUsers(filtered)
    } else {
      setUsers(mapped)
    }
    setLoading(false)
  }, [authUser, activeUnitId])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  async function addUser(user: AddUserInput): Promise<AddUserResult> {
    // Routed through /api/admin/users so the server-side service-role client
    // can create both the auth.users entry and the public.users row atomically.
    // The server generates the PIN with crypto.randomInt() for security.
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        firstNames: user.firstNames,
        surname: user.surname,
        email: user.email,
        contactNumber: user.contactNumber,
        role: user.role,
        unitIds: user.unitIds,
        clientId: user.clientId || null,
      }),
    })

    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: res.statusText }))
      console.error("Error adding user:", error)
      throw new Error(error || "Failed to create user")
    }

    const data = (await res.json()) as { id: string; pin: string }
    await fetchUsers()
    return { id: data.id, pin: data.pin }
  }

  async function updateUser(id: string, updates: Partial<Omit<UserRecord, "id" | "unitName" | "clientName" | "units">>) {
    // Routed through /api/admin/users/[id] so PIN changes also update the
    // linked auth.users (email + password) atomically.
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(updates),
    })

    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: res.statusText }))
      console.error("Error updating user:", error)
      throw new Error(error || "Failed to update user")
    }

    await fetchUsers()
  }

  async function updateUserUnits(userId: string, unitIds: string[]) {
    // Routed through PATCH /api/admin/users/[id] which handles deleting old
    // user_units rows, inserting new ones, and updating the legacy unit_id column.
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ unitIds }),
    })

    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: res.statusText }))
      console.error("Error updating user units:", error)
      throw new Error(error || "Failed to update user units")
    }

    await fetchUsers()
  }

  async function deleteUser(id: string) {
    // Routed through DELETE /api/admin/users/[id] so the linked auth.users
    // entry is also removed.
    const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" })
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: res.statusText }))
      console.error("Error deleting user:", error)
      return
    }
    await fetchUsers()
  }

  async function toggleUserStatus(id: string) {
    const user = users.find((u) => u.id === id)
    if (!user) return

    const newStatus: UserStatus = user.status === "Active" ? "Disabled" : "Active"
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    })
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: res.statusText }))
      console.error("Error toggling user status:", error)
    }
    await fetchUsers()
  }

  function getUser(id: string) {
    return users.find((u) => u.id === id)
  }

  return (
    <UserStoreContext.Provider value={{ users, loading, addUser, updateUser, updateUserUnits, deleteUser, toggleUserStatus, getUser, refreshUsers: fetchUsers }}>
      {children}
    </UserStoreContext.Provider>
  )
}

export function useUserStore() {
  const ctx = useContext(UserStoreContext)
  if (!ctx) {
    throw new Error("useUserStore must be used within UserStoreProvider")
  }
  return ctx
}
