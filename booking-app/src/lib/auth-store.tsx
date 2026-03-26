"use client"

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react"
import { supabase } from "./supabase"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UserRole = "system_admin" | "unit_manager" | "user"

export interface AuthUser {
  id: string
  firstNames: string
  surname: string
  email: string
  pin: string
  role: UserRole
  status: "Active" | "Disabled"
  clientId: string | null
  clientName: string | null
  unitIds: string[]
  unitNames: string[]
  avatarUrl: string | null
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  signIn: (pin: string) => Promise<{ success: boolean; error?: string }>
  signOut: () => void
  isSystemAdmin: boolean
  isUnitManager: boolean
  isUser: boolean
  hasAccessToUnit: (unitId: string) => boolean
  activeUnitId: string | null
  activeUnitName: string | null
  setActiveUnitId: (unitId: string) => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

interface DbUser {
  id: string
  first_names: string
  surname: string
  email: string
  pin: string
  role: UserRole
  status: "Active" | "Disabled"
  client_id: string | null
  avatar_url: string | null
}

interface DbUserUnit {
  unit_id: string
}

interface DbUnit {
  id: string
  unit_name: string
}

interface DbClient {
  client_name: string
}

// ---------------------------------------------------------------------------
// Storage key
// ---------------------------------------------------------------------------

const AUTH_STORAGE_KEY = "carefirst_auth_user_id"
const ACTIVE_UNIT_STORAGE_KEY = "carefirst_active_unit_id"

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeUnitId, setActiveUnitIdState] = useState<string | null>(null)

  const loadUser = useCallback(async (userId: string): Promise<AuthUser | null> => {
    // Fetch user
    const { data: dbUser, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .single()

    if (error || !dbUser) return null

    const u = dbUser as DbUser
    if (u.status !== "Active") return null

    // Fetch user's units
    const { data: userUnits } = await supabase
      .from("user_units")
      .select("unit_id")
      .eq("user_id", u.id)

    const unitIds = (userUnits as DbUserUnit[] | null)?.map((uu) => uu.unit_id) ?? []

    // Fetch unit names (preserving same order as unitIds)
    let unitNames: string[] = []
    if (unitIds.length > 0) {
      const { data: units } = await supabase
        .from("units")
        .select("id, unit_name")
        .in("id", unitIds)

      const unitMap = new Map((units as DbUnit[] | null)?.map((u) => [u.id, u.unit_name]) ?? [])
      unitNames = unitIds.map((id) => unitMap.get(id) ?? "Unknown")
    }

    // Fetch client name
    let clientName: string | null = null
    if (u.client_id) {
      const { data: client } = await supabase
        .from("clients")
        .select("client_name")
        .eq("id", u.client_id)
        .single()

      clientName = (client as DbClient | null)?.client_name ?? null
    }

    return {
      id: u.id,
      firstNames: u.first_names,
      surname: u.surname,
      email: u.email,
      pin: u.pin,
      role: u.role,
      status: u.status,
      clientId: u.client_id,
      clientName,
      unitIds,
      unitNames,
      avatarUrl: u.avatar_url ?? null,
    }
  }, [])

  // Restore session on mount
  useEffect(() => {
    const storedUserId = localStorage.getItem(AUTH_STORAGE_KEY)
    if (storedUserId) {
      loadUser(storedUserId).then((u) => {
        setUser(u)
        setLoading(false)
        if (!u) {
          localStorage.removeItem(AUTH_STORAGE_KEY)
          localStorage.removeItem(ACTIVE_UNIT_STORAGE_KEY)
        } else {
          // Restore active unit or default to first
          const storedUnitId = localStorage.getItem(ACTIVE_UNIT_STORAGE_KEY)
          if (storedUnitId && u.unitIds.includes(storedUnitId)) {
            setActiveUnitIdState(storedUnitId)
          } else if (u.unitIds.length > 0) {
            setActiveUnitIdState(u.unitIds[0])
            localStorage.setItem(ACTIVE_UNIT_STORAGE_KEY, u.unitIds[0])
          }
        }
      })
    } else {
      setLoading(false)
    }
  }, [loadUser])

  const signIn = useCallback(
    async (pin: string): Promise<{ success: boolean; error?: string }> => {
      // Look up user by PIN
      const { data, error } = await supabase
        .from("users")
        .select("id")
        .eq("pin", pin)
        .eq("status", "Active")
        .limit(1)

      if (error) {
        return { success: false, error: "An error occurred. Please try again." }
      }

      if (!data || data.length === 0) {
        return { success: false, error: "Invalid Code - Please Retry" }
      }

      const userId = data[0].id
      const authUser = await loadUser(userId)

      if (!authUser) {
        return { success: false, error: "Account is disabled." }
      }

      setUser(authUser)
      localStorage.setItem(AUTH_STORAGE_KEY, userId)
      // Set default active unit
      if (authUser.unitIds.length > 0) {
        setActiveUnitIdState(authUser.unitIds[0])
        localStorage.setItem(ACTIVE_UNIT_STORAGE_KEY, authUser.unitIds[0])
      }
      return { success: true }
    },
    [loadUser]
  )

  const signOut = useCallback(() => {
    localStorage.removeItem(AUTH_STORAGE_KEY)
    localStorage.removeItem(ACTIVE_UNIT_STORAGE_KEY)
    // Full reload to clear all store state (bookings, users, units)
    window.location.href = "/sign-in"
  }, [])

  const isSystemAdmin = user?.role === "system_admin"
  const isUnitManager = user?.role === "unit_manager"
  const isUser = user?.role === "user"

  const refreshUser = useCallback(async () => {
    if (!user) return
    const refreshed = await loadUser(user.id)
    if (refreshed) setUser(refreshed)
  }, [user, loadUser])

  const setActiveUnitId = useCallback((unitId: string) => {
    setActiveUnitIdState(unitId)
    localStorage.setItem(ACTIVE_UNIT_STORAGE_KEY, unitId)
  }, [])

  // Resolve active unit name
  const [activeUnitName, setActiveUnitName] = useState<string | null>(null)

  useEffect(() => {
    if (!activeUnitId) {
      setActiveUnitName(null)
      return
    }

    // Try to resolve from user's own units first
    if (user) {
      const idx = user.unitIds.indexOf(activeUnitId)
      if (idx !== -1) {
        setActiveUnitName(user.unitNames[idx])
        return
      }
    }

    // For system admins who may select any unit, fetch from DB
    supabase
      .from("units")
      .select("unit_name")
      .eq("id", activeUnitId)
      .single()
      .then(({ data }) => {
        setActiveUnitName((data as { unit_name: string } | null)?.unit_name ?? null)
      })
  }, [activeUnitId, user])

  const hasAccessToUnit = useCallback(
    (unitId: string) => {
      if (!user) return false
      if (user.role === "system_admin") return true
      return user.unitIds.includes(unitId)
    },
    [user]
  )

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signIn,
        signOut,
        isSystemAdmin,
        isUnitManager,
        isUser,
        hasAccessToUnit,
        activeUnitId,
        activeUnitName,
        setActiveUnitId,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider")
  }
  return ctx
}
