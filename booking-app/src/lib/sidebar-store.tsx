"use client"

import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from "react"

interface SidebarContextValue {
  /** Desktop sidebar collapse state (only meaningful at lg: and up). */
  collapsed: boolean
  toggle: () => void
  /** Mobile drawer open state (only meaningful below lg:). */
  mobileOpen: boolean
  setMobileOpen: (open: boolean) => void
  openMobile: () => void
  closeMobile: () => void
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  const toggle = useCallback(() => {
    setCollapsed((prev) => !prev)
  }, [])

  const openMobile = useCallback(() => {
    setMobileOpen(true)
  }, [])

  const closeMobile = useCallback(() => {
    setMobileOpen(false)
  }, [])

  const value = useMemo(
    () => ({ collapsed, toggle, mobileOpen, setMobileOpen, openMobile, closeMobile }),
    [collapsed, mobileOpen, toggle, openMobile, closeMobile]
  )

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
}

export function useSidebar() {
  const ctx = useContext(SidebarContext)
  if (!ctx) {
    throw new Error("useSidebar must be used within SidebarProvider")
  }
  return ctx
}
