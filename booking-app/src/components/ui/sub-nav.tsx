"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// =============================================================================
// SubNav
//
// Top "back button" row that sits at the top of every dashboard page.
// Outer white card + Back button on the left + optional right-side action
// passed as `children` (typically a Discard Flow button on booking-flow
// pages).
//
// Consolidates 17 inline copies — each one was an identical
//   <div className="flex items-center [justify-between] rounded-xl bg-white px-6 py-4">
//     <Link/Button><ArrowLeft /> Back</Button></Link>
//     {optional right action}
//   </div>
//
// Pass exactly one of `backHref` (renders as `<Link>` for static
// navigation) or `onBack` (renders as a controlled `<Button onClick>`).
//
// Usage:
//   // Static link to /home
//   <SubNav backHref="/home" />
//
//   // Custom back handler
//   <SubNav onBack={handleBack} backTestId="top-back-button">
//     <Button variant="danger" size="cta" onClick={handleDiscardFlow}>
//       Discard Flow
//     </Button>
//   </SubNav>
// =============================================================================

export interface SubNavProps {
  /** Static back URL (renders the Back button as a <Link>). */
  backHref?: string
  /** Click handler for the Back button (renders as a <Button onClick>). */
  onBack?: () => void
  /** Optional right-side action (typically a Discard Flow button). */
  children?: React.ReactNode
  /** Disable the Back button (e.g. while a save is in flight). */
  backDisabled?: boolean
  /** data-testid for the Back button. */
  backTestId?: string
  /** Extra classes appended to the outer wrapper. */
  className?: string
}

export function SubNav({
  backHref,
  onBack,
  children,
  backDisabled,
  backTestId,
  className,
}: SubNavProps) {
  const hasRightAction = Boolean(children)

  const backButton = (
    <Button
      data-testid={backTestId}
      variant="primary-outline"
      size="nav"
      onClick={onBack}
      disabled={backDisabled}
    >
      <ArrowLeft className="size-4" />
      Back
    </Button>
  )

  return (
    <div
      className={cn(
        "flex items-center rounded-xl bg-white px-4 py-3 sm:px-6 sm:py-4",
        hasRightAction && "justify-between",
        className
      )}
    >
      {backHref ? <Link href={backHref}>{backButton}</Link> : backButton}
      {children}
    </div>
  )
}
