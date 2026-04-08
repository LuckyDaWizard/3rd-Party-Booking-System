"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog"
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
          className="text-center text-2xl font-bold text-gray-900 sm:text-3xl"
        >
          Select Unit
        </h1>

        {/* Subtitle */}
        <p
          data-testid="switch-unit-subtitle"
          className="text-base text-gray-500"
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
            <p className="py-8 text-center text-sm text-gray-500">
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
                      ? "border-[#3ea3db] bg-[#3ea3db]/15"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  {/* Radio indicator */}
                  <span
                    className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${
                      isSelected
                        ? "border-[#3ea3db]"
                        : "border-gray-300"
                    }`}
                  >
                    {isSelected && (
                      <span className="size-2.5 rounded-full bg-[#3ea3db]" />
                    )}
                  </span>
                  <span className="text-base font-medium text-gray-900">
                    {unit.unitName}
                  </span>
                </button>
              )
            })
          )}
        </div>

        {/* Continue button */}
        <Button
          data-testid="continue-button"
          onClick={handleContinue}
          className="h-11 w-full rounded-xl bg-black text-white hover:bg-gray-800"
        >
          Continue
          <ArrowRight data-icon="inline-end" className="ml-1 size-4" />
        </Button>

        {/* Back button */}
        <Button
          data-testid="back-button"
          variant="outline"
          onClick={handleBack}
          className="h-11 w-full rounded-xl border border-black"
        >
          Back
        </Button>
      </div>

      {/* Confirmation dialog */}
      <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <DialogContent
          data-testid="switch-unit-dialog"
          showCloseButton={false}
          className="border-none p-6 shadow-lg sm:p-8"
        >
          <DialogHeader>
            <DialogTitle data-testid="dialog-title">
              Switch to {selectedUnit?.unitName}?
            </DialogTitle>
            <DialogDescription data-testid="dialog-description">
              You&apos;ve selected {selectedUnit?.unitName}. Please confirm if this
              is correct.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 pt-2">
            <Button
              data-testid="confirm-switch-button"
              onClick={handleConfirmSwitch}
              className="h-11 w-full rounded-xl bg-black text-white hover:bg-gray-800"
            >
              Yes, Switch Units
            </Button>
            <DialogClose
              data-testid="cancel-switch-button"
              render={
                <button
                  type="button"
                  className="w-full text-center text-sm font-medium text-red-500 hover:text-red-600"
                />
              }
            >
              Cancel
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
