"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/lib/auth-store"
import { useBookingStore } from "@/lib/booking-store"

export default function HomeDashboardPage() {
  const { user, activeUnitName } = useAuth()
  const { bookings } = useBookingStore()
  const canSwitchUnit = user?.role === "system_admin" || user?.role === "unit_manager" || (user?.unitIds?.length ?? 0) > 1
  const unitDisplay = activeUnitName ?? "No unit assigned"

  // Count bookings that need attention (in progress or abandoned)
  const pendingCount = bookings.filter(
    (b) => b.status === "In Progress" || b.status === "Abandoned"
  ).length

  return (
    <div
      data-testid="home-dashboard"
      className="flex flex-1 items-center justify-center"
    >
      <div className="flex w-full max-w-[560px] flex-col items-center gap-8">
        {/* Heading */}
        <h1
          data-testid="dashboard-heading"
          className="text-center text-2xl font-bold text-gray-900 sm:text-3xl"
        >
          VHC Third Party Booking
        </h1>

        {/* Subtitle */}
        <p
          data-testid="dashboard-subtitle"
          className="text-base text-gray-500"
        >
          Please select an option below to proceed
        </p>

        {/* Current unit + Switch Unit button */}
        <div
          data-testid="current-unit-display"
          className="flex w-full items-center justify-between"
        >
          <span
            data-testid="current-unit-name"
            className="text-xl font-bold text-gray-900"
          >
            {unitDisplay}
          </span>
          {canSwitchUnit && (
            <Link href="/switch-unit">
              <Button
                data-testid="switch-unit-button"
                variant="outline"
                size="sm"
                className="rounded-lg border-black px-6 py-2 text-xs"
              >
                Switch Unit
              </Button>
            </Link>
          )}
        </div>

        {/* Action cards */}
        <div className="flex w-full flex-col gap-4">
          {/* Create a booking card */}
          <Link
            href="/create-booking"
            data-testid="create-booking-card"
            className="flex w-full flex-col gap-2 rounded-lg bg-white px-6 py-5 shadow-sm transition-shadow hover:shadow-md"
          >
            <span className="text-base font-bold text-gray-900">
              Create a booking
            </span>
            <span className="text-sm text-gray-500">
              Make a booking on behalf of the patient.
            </span>
          </Link>

          {/* Patient History card */}
          <Link
            href="/patient-history"
            data-testid="patient-history-card"
            className="flex w-full items-center justify-between rounded-lg bg-white px-6 py-5 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-gray-900">
                  Patient History
                </span>
                {pendingCount > 0 && (
                  <Badge
                    data-testid="patient-history-badge"
                    className="size-5 items-center justify-center rounded-full bg-red-400 text-[10px] text-white border-transparent p-0"
                  >
                    {pendingCount}
                  </Badge>
                )}
              </div>
              <span className="text-sm text-gray-500">
                {bookings.length === 0
                  ? "No patient bookings yet."
                  : `View ${bookings.length} booking${bookings.length === 1 ? "" : "s"} for your unit.`}
              </span>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}
