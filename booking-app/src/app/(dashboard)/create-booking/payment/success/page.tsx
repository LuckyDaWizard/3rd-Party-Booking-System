"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function PaymentSuccessPage() {
  const router = useRouter()
  const [countdown, setCountdown] = useState(10)

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          router.push("/home")
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [router])

  const formatted = `00:${countdown.toString().padStart(2, "0")}`

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-6">
        <CheckCircle className="size-16 text-green-500" strokeWidth={1.5} />

        <h1 className="text-3xl font-extrabold text-gray-900">Payment Successful</h1>

        <p className="text-center text-base text-gray-500">
          The payment was successful. If not redirected in a few seconds use the button below.
        </p>

        <Button
          onClick={() => router.push("/home")}
          className="h-12 w-64 rounded-xl bg-gray-900 text-base font-semibold text-white hover:bg-gray-800"
        >
          Redirecting ({formatted})
        </Button>
      </div>
    </div>
  )
}
