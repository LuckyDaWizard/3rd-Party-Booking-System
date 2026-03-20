"use client"

import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

export default function TermsAndConditionsPage() {
  const router = useRouter()

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6">
      <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
        VERSION 1.0.0
      </span>

      <h1 className="text-3xl font-extrabold text-gray-900">Terms and Conditions</h1>

      <p className="max-w-xl text-center text-base text-gray-500">
        By accepting these Terms and Conditions, you agree to use this web application and platform as set out
        therein and you consent and agree that we can display the information you upload onto the platform.
      </p>

      <div className="flex w-full max-w-sm flex-col gap-3">
        <Button
          onClick={() => router.push("/home")}
          className="h-12 w-full rounded-xl bg-gray-900 text-base font-semibold text-white hover:bg-gray-800"
        >
          Accept
        </Button>

        <Button
          variant="outline"
          onClick={() => {
            // TODO: show full terms and conditions
          }}
          className="h-12 w-full rounded-xl border border-black text-base font-semibold"
        >
          View full T&apos;s and C&apos;s
        </Button>
      </div>
    </div>
  )
}
