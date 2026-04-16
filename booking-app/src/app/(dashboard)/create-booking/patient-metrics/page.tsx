"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useBookingStore } from "@/lib/booking-store"

type MetricFormat = "integer" | "decimal" | "blood-pressure"

/**
 * Filter raw input down to only the characters allowed for this metric.
 * Mobile keyboards still show numeric (via inputMode), and we re-clean here
 * to defend against paste / desktop typing.
 */
function sanitiseMetricInput(raw: string, format: MetricFormat): string {
  switch (format) {
    case "integer":
      // digits only
      return raw.replace(/[^\d]/g, "")
    case "decimal":
      // digits + at most one decimal point (.)
      const cleaned = raw.replace(/[^\d.]/g, "")
      const parts = cleaned.split(".")
      if (parts.length <= 1) return cleaned
      return parts[0] + "." + parts.slice(1).join("")
    case "blood-pressure":
      // digits + at most one forward-slash (/)
      const bp = raw.replace(/[^\d/]/g, "")
      const slashParts = bp.split("/")
      if (slashParts.length <= 1) return bp
      return slashParts[0] + "/" + slashParts.slice(1).join("")
  }
}

function MetricCard({
  label,
  placeholder,
  unit,
  value,
  onChange,
  optional = false,
  unitInline = false,
  format,
}: {
  label: string
  placeholder: string
  unit: string
  value: string
  onChange: (v: string) => void
  optional?: boolean
  unitInline?: boolean
  format: MetricFormat
}) {
  // Use inputMode="decimal" for any field that allows non-digit chars (./)
  // so mobile keyboards include those keys. Pure integers get "numeric".
  const inputMode: "numeric" | "decimal" =
    format === "integer" ? "numeric" : "decimal"

  function handleChange(raw: string) {
    onChange(sanitiseMetricInput(raw, format))
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-semibold text-gray-900">
        {label}
        {optional && <span className="ml-1 text-xs font-normal text-gray-400">(optional)</span>}
      </span>
      <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white px-6 py-6">
        {unitInline ? (
          <div className="flex items-baseline justify-center gap-1">
            <input
              type="text"
              inputMode={inputMode}
              value={value}
              onChange={(e) => handleChange(e.target.value)}
              placeholder={placeholder}
              className="w-16 bg-transparent text-center text-3xl font-bold text-gray-900 placeholder:text-gray-300 outline-none"
            />
            <span className="text-2xl font-bold text-gray-900">{unit}</span>
          </div>
        ) : (
          <>
            <input
              type="text"
              inputMode={inputMode}
              value={value}
              onChange={(e) => handleChange(e.target.value)}
              placeholder={placeholder}
              className="w-full bg-transparent text-center text-3xl font-bold text-gray-900 placeholder:text-gray-300 outline-none"
            />
            <span className="mt-1 text-xs text-gray-400">{unit}</span>
          </>
        )}
      </div>
    </div>
  )
}

export default function PatientMetricsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const bookingId = searchParams.get("bookingId") ?? ""
  const { updateBooking, discardBooking, setActiveBookingId } = useBookingStore()

  useEffect(() => {
    if (bookingId) setActiveBookingId(bookingId)
  }, [bookingId, setActiveBookingId])

  const [bloodPressure, setBloodPressure] = useState("")
  const [glucose, setGlucose] = useState("")
  const [temperature, setTemperature] = useState("")
  const [oxygenSaturation, setOxygenSaturation] = useState("")
  const [urineDipstick, setUrineDipstick] = useState("")
  const [heartRate, setHeartRate] = useState("")
  const [comments, setComments] = useState("")

  const isFormValid =
    bloodPressure.trim() !== "" &&
    glucose.trim() !== "" &&
    temperature.trim() !== "" &&
    oxygenSaturation.trim() !== "" &&
    heartRate.trim() !== ""

  return (
    <div className="flex flex-1 flex-col gap-4">
      {/* Top bar */}
      <div className="flex items-center justify-between rounded-xl bg-white px-6 py-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.back()}
          className="gap-3 rounded-lg border-black px-6 py-2"
        >
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <Button
          size="sm"
          onClick={async () => {
            if (bookingId) await discardBooking(bookingId)
            router.push("/home")
          }}
          className="rounded-lg border-0 px-6 py-2 text-white hover:opacity-90"
          style={{ backgroundColor: "#FF3A69" }}
        >
          Discard Flow
        </Button>
      </div>

      {/* Content */}
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 py-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Enter patient metrics</h1>
          <p className="text-base text-gray-500">Please</p>
        </div>

        {/* Row 1 - 4 metrics */}
        <div className="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-4">
          <MetricCard
            label="Blood Pressure"
            placeholder="000/00"
            unit="hhMG"
            value={bloodPressure}
            onChange={setBloodPressure}
            format="blood-pressure"
          />
          <MetricCard
            label="Glucose"
            placeholder="000"
            unit="mg/dL"
            value={glucose}
            onChange={setGlucose}
            format="decimal"
          />
          <MetricCard
            label="Temperature"
            placeholder="000"
            unit="celcius"
            value={temperature}
            onChange={setTemperature}
            format="decimal"
          />
          <MetricCard
            label="Oxygen Saturation"
            placeholder="00"
            unit="%"
            value={oxygenSaturation}
            onChange={setOxygenSaturation}
            format="integer"
          />
        </div>

        {/* Row 2 - 2 metrics + comments */}
        <div className="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-4">
          <MetricCard
            label="Urine Dipstick reading"
            placeholder="00"
            unit="pH"
            value={urineDipstick}
            onChange={setUrineDipstick}
            optional
            format="decimal"
          />
          <MetricCard
            label="Heart Rate"
            placeholder="000"
            unit="bpm"
            value={heartRate}
            onChange={setHeartRate}
            format="integer"
          />
          <div className="col-span-2 flex flex-col gap-2">
            <span className="text-sm font-semibold text-gray-900">Additional Comments</span>
            <textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Comments"
              className="h-full min-h-[120px] w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none focus:border-gray-900"
            />
          </div>
        </div>

        {/* Bottom buttons */}
        <div className="flex w-full max-w-4xl flex-col-reverse gap-3 pt-4 sm:flex-row sm:justify-between sm:gap-4">
          <Button
            variant="outline"
            onClick={() => {
              // Skip without saving metrics
              router.push(`/create-booking/creating?bookingId=${bookingId}`)
            }}
            className="h-12 w-full rounded-xl border border-black text-base font-semibold sm:w-[38%]"
          >
            Skip
          </Button>
          <Button
            onClick={async () => {
              // Save metrics to database
              if (bookingId) {
                await updateBooking(bookingId, {
                  bloodPressure,
                  glucose,
                  temperature,
                  oxygenSaturation,
                  urineDipstick,
                  heartRate,
                  additionalComments: comments,
                  currentStep: "patient-metrics",
                })
              }
              router.push(`/create-booking/creating?bookingId=${bookingId}`)
            }}
            disabled={!isFormValid}
            className={`h-12 w-full gap-2 rounded-xl text-base font-semibold transition-all sm:w-[38%] ${
              isFormValid
                ? "bg-gray-900 text-white hover:bg-gray-800"
                : "bg-gray-300 text-gray-500 cursor-default"
            }`}
          >
            Next
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
