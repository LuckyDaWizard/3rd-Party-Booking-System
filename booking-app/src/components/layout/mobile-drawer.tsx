"use client"

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { Sidebar } from "@/components/layout/sidebar"

// =============================================================================
// MobileDrawer
//
// Thin wrapper around Sheet + the existing Sidebar (drawer mode). Lives in
// its own file so the parent layout can pull it in lazily via next/dynamic
// — desktop sessions (lg: and up) never trigger the import, which keeps
// the ~15-25 kB Sheet + base-ui dialog portal chunk out of the initial
// bundle.
// =============================================================================

interface MobileDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MobileDrawer({ open, onOpenChange }: MobileDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-60 p-0 lg:hidden">
        <SheetTitle className="sr-only">Navigation menu</SheetTitle>
        <Sidebar mode="drawer" />
      </SheetContent>
    </Sheet>
  )
}
