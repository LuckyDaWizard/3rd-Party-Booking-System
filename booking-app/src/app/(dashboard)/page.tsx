"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

const CURRENT_UNIT = "Unicare Sandton"
const PATIENT_HISTORY_COUNT = 2

export default function HomeDashboardPage() {
  return (
    <div
      data-testid="home-dashboard"
      className="flex flex-1 items-center justify-center"
    >
      <div className="flex w-full max-w-[560px] flex-col items-center gap-8">
        {/* Heading */}
        <h1
          data-testid="dashboard-heading"
          className="text-3xl font-bold text-gray-900"
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
            {CURRENT_UNIT}
          </span>
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
                <Badge
                  data-testid="patient-history-badge"
                  className="size-5 items-center justify-center rounded-full bg-red-400 text-[10px] text-white border-transparent p-0"
                >
                  {PATIENT_HISTORY_COUNT}
                </Badge>
              </div>
              <span className="text-sm text-gray-500">
                View the patients of the last 24 hours.
              </span>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}
