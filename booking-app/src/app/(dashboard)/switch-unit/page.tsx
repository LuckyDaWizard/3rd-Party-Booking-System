"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useUnitStore } from "@/lib/unit-store"
import { useAuth } from "@/lib/auth-store"


export default function SwitchUnitPage() {
  const router = useRouter()
  const { units, loading } = useUnitStore()
  const { user, activeUnitId: currentActiveUnitId, setActiveUnitId } = useAuth()

  // System admins see all active units; everyone else only sees their assigned units
  const activeUnits = units.filter((u) =>
    u.status === "Active" &&
    (user?.role === "system_admin" || (user?.unitIds ?? []).includes(u.id))
  )
  const [selectedUnitId, setSelectedUnitId] = useState<string>("")
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)

  // Auto-select current active unit or first unit
  useEffect(() => {
    if (activeUnits.length > 0 && !selectedUnitId) {
      const currentUnit = activeUnits.find((u) => u.id === currentActiveUnitId)
      setSelectedUnitId(currentUnit?.id ?? activeUnits[0].id)
    }
  }, [activeUnits, selectedUnitId, currentActiveUnitId])

  const selectedUnit = activeUnits.find((u) => u.id === selectedUnitId)

  function handleContinue() {
    setIsConfirmOpen(true)
  }

  function handleConfirmSwitch() {
    if (selectedUnitId) setActiveUnitId(selectedUnitId)
    setIsConfirmOpen(false)
    router.push("/home")
  }

  function handleBack() {
    router.back()
  }

  return (
    <div
      data-testid="switch-unit-page"
      className="flex flex-1 items-center justify-center"
    >
      <div className="flex w-full max-w-[400px] flex-col items-center gap-6">
        {/* Heading */}
        <h1
          data-testid="switch-unit-heading"
          className="text-center text-2xl font-bold text-ink sm:text-3xl"
        >
          Select Unit
        </h1>

        {/* Subtitle */}
        <p
          data-testid="switch-unit-subtitle"
          className="text-base text-ink-muted"
        >
          Please select the unit that you are currently at
        </p>

        {/* Unit list */}
        <div
          data-testid="unit-list"
          className="flex w-full flex-col gap-3"
          role="radiogroup"
          aria-label="Select a unit"
        >
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-6 animate-spin text-gray-400" />
            </div>
          ) : activeUnits.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-muted">
              No active units available
            </p>
          ) : (
            activeUnits.map((unit) => {
              const isSelected = unit.id === selectedUnitId
              return (
                <button
                  key={unit.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  data-testid={`unit-option-${unit.id}`}
                  onClick={() => setSelectedUnitId(unit.id)}
                  className={`flex w-full items-center gap-3 rounded-xl border-2 px-4 py-4 text-left transition-colors ${
                    isSelected
                      ? "border-[var(--client-primary)] bg-[var(--client-primary-15)]"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  {/* Radio indicator */}
                  <span
                    className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${
                      isSelected
                        ? "border-[var(--client-primary)]"
                        : "border-gray-300"
                    }`}
                  >
                    {isSelected && (
                      <span className="size-2.5 rounded-full bg-[var(--client-primary)]" />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-base font-medium text-ink">
                      {unit.unitName}
                    </span>
                    {unit.clientName && (
                      <span className="truncate text-xs text-ink-muted">
                        {unit.clientName}
                      </span>
                    )}
                  </span>
                </button>
              )
            })
          )}
        </div>

        {/* Continue + Back pair — gap-3 matches the unit-list spacing
            so the two buttons sit together as one action group rather
            than drifting apart from the bigger gap-6 above. */}
        <div className="flex w-full flex-col gap-3">
          <Button
            data-testid="continue-button"
            onClick={handleContinue}
            variant="primary"
            size="cta-lg"
            className="w-full"
          >
            Continue
            <ArrowRight data-icon="inline-end" className="size-4" />
          </Button>

          <Button
            data-testid="back-button"
            variant="primary-outline"
            size="cta-lg"
            onClick={handleBack}
            className="w-full"
          >
            Back
          </Button>
        </div>
      </div>

      {/* Confirmation dialog */}
      <ConfirmDialog
        open={isConfirmOpen}
        onOpenChange={setIsConfirmOpen}
        title={`Switch to ${selectedUnit?.unitName}?`}
        description={
          <>
            You&apos;ve selected <strong>{selectedUnit?.unitName}</strong>
            {selectedUnit?.clientName ? (
              <> &mdash; <span className="text-ink">{selectedUnit.clientName}</span></>
            ) : null}
            . Please confirm if this is correct.
          </>
        }
        confirmLabel="Yes, Switch Units"
        onConfirm={handleConfirmSwitch}
        testId="switch-unit-dialog"
        confirmTestId="confirm-switch-button"
        cancelTestId="cancel-switch-button"
      />
    </div>
  )
}
