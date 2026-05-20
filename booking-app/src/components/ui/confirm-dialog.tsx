"use client"

import * as React from "react"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

// =============================================================================
// ConfirmDialog
//
// Standard yes/cancel confirmation modal. Consolidates 7 inline copies:
//   - switch-unit (yes/cancel)
//   - user-management/manage (delete + status — both with 3 buttons)
//   - unit-management/manage (delete + status — both with 3 buttons)
//   - client-management/manage (delete + status — both with 3 buttons)
//
// Two layouts:
//   - 2-button: title + description + confirm + cancel link
//   - 3-button: title + description + confirm + secondary (outline) + cancel
//
// All buttons support a `pending` boolean that swaps the label for a
// loading variant and renders a small spinner. The confirm button also
// gets a right-pointing arrow when not pending.
//
// Usage (yes/cancel):
//   <ConfirmDialog
//     open={open}
//     onOpenChange={setOpen}
//     title="Switch to Sandton?"
//     description="You'll see Sandton's bookings after switching."
//     confirmLabel="Yes, Switch Units"
//     onConfirm={handleSwitch}
//   />
//
// Usage (3-button delete-with-disable-alt):
//   <ConfirmDialog
//     open={open}
//     onOpenChange={setOpen}
//     title="Are you sure you want to delete this user?"
//     description="Deleting permanently removes all associated records."
//     confirmLabel="Yes, delete user"
//     confirmLoadingLabel="Deleting..."
//     confirmPending={deleting}
//     onConfirm={handleDelete}
//     secondaryLabel="Disable user instead"
//     secondaryLoadingLabel="Disabling..."
//     secondaryPending={toggling}
//     onSecondary={handleDisable}
//     preventCloseWhilePending={deleting || toggling}
//   />
// =============================================================================

function Spinner({ tone = "light" }: { tone?: "light" | "dark" }) {
  return (
    <svg className="ml-1 size-4 animate-spin" viewBox="0 0 40 40" fill="none">
      <circle
        cx="20"
        cy="20"
        r="15"
        stroke={tone === "light" ? "#6b7280" : "#d1d5db"}
        strokeWidth="5"
        strokeLinecap="round"
      />
      <circle
        cx="20"
        cy="20"
        r="15"
        stroke={tone === "light" ? "white" : "#111827"}
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray="94.25"
        strokeDashoffset="70"
      />
    </svg>
  )
}

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description?: React.ReactNode
  /** Primary action label. */
  confirmLabel: string
  /** Label shown when `confirmPending` is true. */
  confirmLoadingLabel?: string
  confirmPending?: boolean
  confirmDisabled?: boolean
  onConfirm: () => void
  /** Optional secondary action (outline button between primary + cancel). */
  secondaryLabel?: string
  secondaryLoadingLabel?: string
  secondaryPending?: boolean
  secondaryDisabled?: boolean
  onSecondary?: () => void
  /** Cancel link label. Defaults to "Cancel". */
  cancelLabel?: string
  cancelDisabled?: boolean
  /**
   * When TRUE, the dialog refuses to close (via Escape / overlay click)
   * — used while an action is mid-flight so the user can't cancel
   * a request that's already in transit.
   */
  preventCloseWhilePending?: boolean
  testId?: string
  confirmTestId?: string
  secondaryTestId?: string
  cancelTestId?: string
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  confirmLoadingLabel,
  confirmPending,
  confirmDisabled,
  onConfirm,
  secondaryLabel,
  secondaryLoadingLabel,
  secondaryPending,
  secondaryDisabled,
  onSecondary,
  cancelLabel = "Cancel",
  cancelDisabled,
  preventCloseWhilePending,
  testId,
  confirmTestId,
  secondaryTestId,
  cancelTestId,
}: ConfirmDialogProps) {
  const hasSecondary = Boolean(secondaryLabel && onSecondary)

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (preventCloseWhilePending) return
        onOpenChange(v)
      }}
    >
      <DialogContent
        data-testid={testId}
        className="rounded-2xl p-6 sm:p-8"
      >
        <DialogHeader className="flex flex-col items-center gap-2 text-center">
          <DialogTitle>{title}</DialogTitle>
          {description && (
            <DialogDescription className="text-sm text-ink-muted">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="flex flex-col items-center gap-3 pt-4">
          <Button
            data-testid={confirmTestId}
            disabled={confirmDisabled || confirmPending}
            onClick={onConfirm}
            variant="primary"
            size="cta"
            className="w-full"
          >
            {confirmPending
              ? (confirmLoadingLabel ?? confirmLabel)
              : confirmLabel}
            {confirmPending ? <Spinner tone="light" /> : <ArrowRight className="ml-1 size-4" />}
          </Button>

          {hasSecondary && (
            <Button
              data-testid={secondaryTestId}
              variant="primary-outline"
              size="cta"
              disabled={secondaryDisabled || secondaryPending}
              onClick={onSecondary}
              className="w-full"
            >
              {secondaryPending
                ? (secondaryLoadingLabel ?? secondaryLabel)
                : secondaryLabel}
              {secondaryPending && <Spinner tone="dark" />}
            </Button>
          )}

          <button
            type="button"
            data-testid={cancelTestId}
            onClick={() => onOpenChange(false)}
            disabled={cancelDisabled}
            className="text-sm font-medium text-[#FF3A69] hover:text-[#FF3A69]/80 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
