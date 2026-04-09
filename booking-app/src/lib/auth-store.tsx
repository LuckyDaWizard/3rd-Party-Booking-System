"use client"

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react"
import { supabase, pinToEmail } from "./supabase"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UserRole = "system_admin" | "unit_manager" | "user"

export interface AuthUser {
  id: string
  firstNames: string
  surname: string
  email: string
  pin: string | null  // null for non-system_admin (masked by users_visible view)
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
  pin: string | null
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
// Storage keys
//
// Auth session is now managed by Supabase Auth via cookies (set automatically
// by createBrowserClient in src/lib/supabase.ts). The legacy localStorage key
// is no longer read or written, but we still clean it up on sign-out so users
// who upgrade from the old code don't have stale data lying around.
// ---------------------------------------------------------------------------

const LEGACY_AUTH_STORAGE_KEY = "carefirst_auth_user_id"
const ACTIVE_UNIT_STORAGE_KEY = "carefirst_active_unit_id"

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeUnitId, setActiveUnitIdState] = useState<string | null>(null)

  const loadUser = useCallback(async (authUserId: string): Promise<AuthUser | null> => {
    // Fetch the public.users row by its auth_user_id link.
    // (Backfilled in scripts/backfill-auth-users.mjs; populated for new users
    // in /api/admin/users POST.)
    // Read from users_visible VIEW so the `pin` column is masked for
    // non-system_admin callers (see migration 006_mask_pin_column.sql).
    const { data: dbUser, error } = await supabase
      .from("users_visible")
      .select("*")
      .eq("auth_user_id", authUserId)
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

  // Restore session on mount + subscribe to auth state changes.
  //
  // Supabase's createBrowserClient persists the session in cookies; on first
  // load we ask for the current user, then subscribe to SIGNED_IN/SIGNED_OUT
  // events so the UI reacts when sign-in/out happens elsewhere or on token
  // refresh.
  useEffect(() => {
    let cancelled = false

    // Drop any stale session id from the previous (localStorage) auth scheme.
    // Harmless no-op for users who never had it.
    try {
      localStorage.removeItem(LEGACY_AUTH_STORAGE_KEY)
    } catch {
      // ignore — SSR / private mode
    }

    async function applyAuthUser(authUserId: string | null) {
      if (cancelled) return
      if (!authUserId) {
        setUser(null)
        setActiveUnitIdState(null)
        setLoading(false)
        return
      }

      const u = await loadUser(authUserId)
      if (cancelled) return

      if (!u) {
        // auth user exists but no matching public.users row, or row is
        // disabled. Fail closed: sign them out so we don't render the app
        // in a half-loaded state.
        await supabase.auth.signOut()
        setUser(null)
        setActiveUnitIdState(null)
        setLoading(false)
        return
      }

      setUser(u)

      // Restore active unit from localStorage, or default to first.
      try {
        const storedUnitId = localStorage.getItem(ACTIVE_UNIT_STORAGE_KEY)
        if (storedUnitId && u.unitIds.includes(storedUnitId)) {
          setActiveUnitIdState(storedUnitId)
        } else if (u.unitIds.length > 0) {
          setActiveUnitIdState(u.unitIds[0])
          localStorage.setItem(ACTIVE_UNIT_STORAGE_KEY, u.unitIds[0])
        } else {
          setActiveUnitIdState(null)
        }
      } catch {
        // ignore
      }

      setLoading(false)
    }

    // Initial load.
    supabase.auth.getUser().then(({ data }) => {
      applyAuthUser(data.user?.id ?? null)
    })

    // React to sign-in / sign-out / token refresh.
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      applyAuthUser(session?.user?.id ?? null)
    })

    return () => {
      cancelled = true
      subscription.subscription.unsubscribe()
    }
  }, [loadUser])

  const signIn = useCallback(
    async (pin: string): Promise<{ success: boolean; error?: string }> => {
      // Sign in via Supabase Auth using the synthetic email scheme. The
      // password IS the PIN — see scripts/backfill-auth-users.mjs and the
      // /api/admin/users POST route which both follow the same convention.
      const { data, error } = await supabase.auth.signInWithPassword({
        email: pinToEmail(pin),
        password: pin,
      })

      if (error || !data.user) {
        // Supabase returns "Invalid login credentials" for both wrong email
        // and wrong password — collapse to the friendlier UX message.
        return { success: false, error: "Invalid Code - Please Retry" }
      }

      // Successful auth — now load the public.users row to check status and
      // collect role/unit info.
      const authUser = await loadUser(data.user.id)

      if (!authUser) {
        // No matching public.users row, or status !== Active. Fail closed.
        await supabase.auth.signOut()
        return { success: false, error: "Account is disabled." }
      }

      // onAuthStateChange will fire and set the user state, but we also set
      // it eagerly so the sign-in page can navigate away immediately.
      setUser(authUser)
      if (authUser.unitIds.length > 0) {
        setActiveUnitIdState(authUser.unitIds[0])
        try {
          localStorage.setItem(ACTIVE_UNIT_STORAGE_KEY, authUser.unitIds[0])
        } catch {
          // ignore
        }
      }
      return { success: true }
    },
    [loadUser]
  )

  const signOut = useCallback(async () => {
    // Tell Supabase Auth to clear the session cookie. Errors here are
    // non-fatal — we still want to redirect the user away.
    try {
      await supabase.auth.signOut()
    } catch {
      // ignore
    }
    try {
      localStorage.removeItem(LEGACY_AUTH_STORAGE_KEY)
      localStorage.removeItem(ACTIVE_UNIT_STORAGE_KEY)
    } catch {
      // ignore
    }
    // Full reload to clear all store state (bookings, users, units).
    window.location.href = "/sign-in"
  }, [])

  const isSystemAdmin = user?.role === "system_admin"
  const isUnitManager = user?.role === "unit_manager"
  const isUser = user?.role === "user"

  const refreshUser = useCallback(async () => {
    // loadUser now expects the auth.users id, not public.users.id, so look
    // it up via the live session rather than from cached state.
    const { data } = await supabase.auth.getUser()
    if (!data.user) return
    const refreshed = await loadUser(data.user.id)
    if (refreshed) setUser(refreshed)
  }, [loadUser])

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
