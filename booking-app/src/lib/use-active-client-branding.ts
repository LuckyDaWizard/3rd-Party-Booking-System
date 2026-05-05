"use client"

import { useMemo } from "react"
import { useAuth } from "@/lib/auth-store"
import { useUnitStore } from "@/lib/unit-store"
import { useClientStore } from "@/lib/client-store"

// =============================================================================
// useActiveClientBranding
//
// Returns logo + favicon URLs and the resolved accent colour for the client
// that owns the user's active unit. Resolution chain:
//
//   activeUnitId → units (find).clientId → clients (find).{logoUrl,
//     faviconUrl, accentColor}
//
// Logo + favicon default to null when missing.
//
// Accent always resolves to a valid hex — the system default (SYSTEM_ACCENT)
// when the active client has no accent set, when the stored value is
// somehow malformed, or before the stores have hydrated. This means the
// caller can pass `accent` straight into a CSS variable without a null
// check.
//
// Cheap to call — memoised against the relevant store slices, so it only
// recomputes when the active unit changes or the underlying store data is
// refreshed.
// =============================================================================

/**
 * System accent — used as the fallback when a client has no accent set.
 * Matches the `--brand` and `--client-primary` defaults in globals.css.
 */
const SYSTEM_ACCENT = "#3ea3db"

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

export interface ActiveClientBranding {
  /** Public URL of the client's wide logo, or null if none. */
  logoUrl: string | null
  /** Public URL of the square favicon variant, or null if none. */
  faviconUrl: string | null
  /** Display name of the client this branding belongs to, or null. */
  clientName: string | null
  /** Resolved hex accent — never null; falls back to the system default. */
  accent: string
}

export function useActiveClientBranding(): ActiveClientBranding {
  const { activeUnitId } = useAuth()
  const { units } = useUnitStore()
  const { clients } = useClientStore()

  return useMemo(() => {
    const unit = activeUnitId ? units.find((u) => u.id === activeUnitId) : undefined
    const client = unit ? clients.find((c) => c.id === unit.clientId) : undefined
    const storedAccent = client?.accentColor ?? null
    const accent =
      storedAccent && HEX_RE.test(storedAccent) ? storedAccent : SYSTEM_ACCENT
    return {
      logoUrl: client?.logoUrl ?? null,
      faviconUrl: client?.faviconUrl ?? null,
      clientName: client?.clientName ?? null,
      accent,
    }
  }, [activeUnitId, units, clients])
}
