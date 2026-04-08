"use client"

import { createContext, useContext, useState, type ReactNode } from "react"

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

  function toggle() {
    setCollapsed((prev) => !prev)
  }

  function openMobile() {
    setMobileOpen(true)
  }

  function closeMobile() {
    setMobileOpen(false)
  }

  return (
    <SidebarContext.Provider
      value={{
        collapsed,
        toggle,
        mobileOpen,
        setMobileOpen,
        openMobile,
        closeMobile,
      }}
    >
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar() {
  const ctx = useContext(SidebarContext)
  if (!ctx) {
    throw new Error("useSidebar must be used within SidebarProvider")
  }
  return ctx
}
