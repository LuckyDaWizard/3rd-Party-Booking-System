"use client"

import { useMemo } from "react"
import { useAuth } from "@/lib/auth-store"
import { useUnitStore } from "@/lib/unit-store"
import { useClientStore } from "@/lib/client-store"

// =============================================================================
// useActiveClientBranding
//
// Returns the logo + favicon URLs for the client that owns the user's active
// unit. Resolution chain:
//
//   activeUnitId → units (find).clientId → clients (find).{logoUrl, faviconUrl}
//
// Both URLs default to null when:
//   - No active unit is selected (user just signed in, hasn't picked one)
//   - The unit is not in the loaded unit list (timing race during sign-in)
//   - The client is not in the loaded client list (same)
//   - The client has no logo/favicon uploaded
//
// Callers are responsible for falling back to system defaults when null.
//
// Cheap to call — memoised against the relevant store slices, so it only
// recomputes when the active unit changes or the underlying store data is
// refreshed.
// =============================================================================

export interface ActiveClientBranding {
  /** Public URL of the client's wide logo, or null if none. */
  logoUrl: string | null
  /** Public URL of the square favicon variant, or null if none. */
  faviconUrl: string | null
  /** Display name of the client this branding belongs to, or null. */
  clientName: string | null
}

export function useActiveClientBranding(): ActiveClientBranding {
  const { activeUnitId } = useAuth()
  const { units } = useUnitStore()
  const { clients } = useClientStore()

  return useMemo(() => {
    const unit = activeUnitId ? units.find((u) => u.id === activeUnitId) : undefined
    const client = unit ? clients.find((c) => c.id === unit.clientId) : undefined
    return {
      logoUrl: client?.logoUrl ?? null,
      faviconUrl: client?.faviconUrl ?? null,
      clientName: client?.clientName ?? null,
    }
  }, [activeUnitId, units, clients])
}
