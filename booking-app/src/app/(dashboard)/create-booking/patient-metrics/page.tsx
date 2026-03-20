"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"

function MetricCard({
  label,
  placeholder,
  unit,
  value,
  onChange,
  optional = false,
  unitInline = false,
}: {
  label: string
  placeholder: string
  unit: string
  value: string
  onChange: (v: string) => void
  optional?: boolean
  unitInline?: boolean
}) {
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
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              className="w-16 bg-transparent text-center text-3xl font-bold text-gray-900 placeholder:text-gray-300 outline-none"
            />
            <span className="text-2xl font-bold text-gray-900">{unit}</span>
          </div>
        ) : (
          <>
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
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
          onClick={() => router.push("/home")}
          className="rounded-lg border-0 px-6 py-2 text-white hover:opacity-90"
          style={{ backgroundColor: "#FF3A69" }}
        >
          Discard Flow
        </Button>
      </div>

      {/* Content */}
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 py-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold text-gray-900">Enter patient metrics</h1>
          <p className="text-base text-gray-500">Please</p>
        </div>

        {/* Row 1 - 4 metrics */}
        <div className="grid grid-cols-4 gap-6">
          <MetricCard
            label="Blood Pressure"
            placeholder="000/00"
            unit="hhMG"
            value={bloodPressure}
            onChange={setBloodPressure}
          />
          <MetricCard
            label="Glucose"
            placeholder="000"
            unit="mg/dL"
            value={glucose}
            onChange={setGlucose}
          />
          <MetricCard
            label="Temperature"
            placeholder="000"
            unit="celcius"
            value={temperature}
            onChange={setTemperature}
          />
          <MetricCard
            label="Oxygen Saturation"
            placeholder="00"
            unit="%"
            value={oxygenSaturation}
            onChange={setOxygenSaturation}
          />
        </div>

        {/* Row 2 - 2 metrics + comments */}
        <div className="grid grid-cols-4 gap-6">
          <MetricCard
            label="Urine Dipstick reading"
            placeholder="00"
            unit="pH"
            value={urineDipstick}
            onChange={setUrineDipstick}
            optional
          />
          <MetricCard
            label="Heart Rate"
            placeholder="000"
            unit="bpm"
            value={heartRate}
            onChange={setHeartRate}
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
        <div className="flex w-full max-w-4xl justify-between pt-4">
          <Button
            variant="outline"
            onClick={() => router.push("/create-booking/creating")}
            className="h-12 w-[38%] rounded-xl border border-black text-base font-semibold"
          >
            Skip
          </Button>
          <Button
            onClick={() => {
              // TODO: save metrics to database
              router.push("/create-booking/creating")
            }}
            disabled={!isFormValid}
            className={`h-12 w-[38%] gap-2 rounded-xl text-base font-semibold transition-all ${
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
