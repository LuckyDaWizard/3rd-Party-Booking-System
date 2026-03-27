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
  pin: string
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
  pin: string
  role: string
  unitIds: string[]
  clientId: string
}

interface UserStoreContextValue {
  users: UserRecord[]
  loading: boolean
  addUser: (user: AddUserInput) => Promise<string>
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
  pin: string
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

    const { data: userRows, error } = await supabase
      .from("users")
      .select("*")
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
        pin: row.pin,
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

  async function addUser(user: AddUserInput) {
    const { data, error } = await supabase
      .from("users")
      .insert({
        first_names: user.firstNames,
        surname: user.surname,
        email: user.email,
        contact_number: user.contactNumber,
        pin: user.pin,
        role: user.role,
        unit_id: user.unitIds[0] || null,
        client_id: user.clientId || null,
        status: "Active",
      })
      .select("id")
      .single()

    if (error) {
      console.error("Error adding user:", error)
      throw error
    }

    const userId = data.id

    // Insert user-unit assignments
    if (user.unitIds.length > 0) {
      const rows = user.unitIds.map((unitId) => ({
        user_id: userId,
        unit_id: unitId,
      }))
      await supabase.from("user_units").insert(rows)
    }

    await fetchUsers()
    return userId
  }

  async function updateUser(id: string, updates: Partial<Omit<UserRecord, "id" | "unitName" | "clientName" | "units">>) {
    const dbUpdates: Record<string, unknown> = {}
    if (updates.firstNames !== undefined) dbUpdates.first_names = updates.firstNames
    if (updates.surname !== undefined) dbUpdates.surname = updates.surname
    if (updates.email !== undefined) dbUpdates.email = updates.email
    if (updates.contactNumber !== undefined) dbUpdates.contact_number = updates.contactNumber
    if (updates.role !== undefined) dbUpdates.role = updates.role
    if (updates.pin !== undefined) dbUpdates.pin = updates.pin
    if (updates.clientId !== undefined) dbUpdates.client_id = updates.clientId || null
    if (updates.status !== undefined) dbUpdates.status = updates.status

    if (Object.keys(dbUpdates).length > 0) {
      const { error } = await supabase.from("users").update(dbUpdates).eq("id", id)
      if (error) console.error("Error updating user:", error)
    }

    await fetchUsers()
  }

  async function updateUserUnits(userId: string, unitIds: string[]) {
    // Delete existing assignments
    await supabase.from("user_units").delete().eq("user_id", userId)

    // Insert new assignments
    if (unitIds.length > 0) {
      const rows = unitIds.map((unitId) => ({
        user_id: userId,
        unit_id: unitId,
      }))
      await supabase.from("user_units").insert(rows)
    }

    // Also update legacy unit_id column
    await supabase
      .from("users")
      .update({ unit_id: unitIds[0] || null })
      .eq("id", userId)

    await fetchUsers()
  }

  async function deleteUser(id: string) {
    const { error } = await supabase.from("users").delete().eq("id", id)
    if (error) {
      console.error("Error deleting user:", error)
      return
    }
    await fetchUsers()
  }

  async function toggleUserStatus(id: string) {
    const user = users.find((u) => u.id === id)
    if (!user) return

    const newStatus = user.status === "Active" ? "Disabled" : "Active"
    await supabase.from("users").update({ status: newStatus }).eq("id", id)
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
