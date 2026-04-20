"use client"

import { useState, useCallback } from "react"
import Link from "next/link"
import Image from "next/image"
import { ArrowRight, ArrowLeft, CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

// =============================================================================
// Forgot PIN — step 1 of the self-service PIN reset flow.
//
// User enters their email. We POST to /api/auth/forgot-pin which always
// returns 200 (no account enumeration). On success we show a "Check your
// email" screen with a prominent link to /reset-pin where they enter the
// code they received.
//
// The form intentionally does not tell the user whether the email existed
// or not. A user who typoed their email will see the same success message
// as one whose email was valid.
// =============================================================================

type State = "idle" | "loading" | "sent"

export default function ForgotPinPage() {
  const [email, setEmail] = useState("")
  const [state, setState] = useState<State>("idle")
  const [networkError, setNetworkError] = useState<string | null>(null)

  const handleSubmit = useCallback(async () => {
    if (state === "loading") return
    setState("loading")
    setNetworkError(null)
    try {
      const res = await fetch("/api/auth/forgot-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      })
      if (!res.ok) {
        // The server always returns 200 under normal conditions — a non-2xx
        // here means something broke. Still show the same "sent" message
        // (don't leak server errors to the UI) but surface a warning.
        console.error("[forgot-pin] non-2xx:", res.status)
      }
      setState("sent")
    } catch {
      setState("idle")
      setNetworkError("Network error. Please check your connection and try again.")
    }
  }, [email, state])

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-8">
      <Image
        src="/carefirst-logo.png"
        alt="CareFirst"
        width={200}
        height={36}
        priority
        className="h-auto w-[200px]"
      />

      {state === "sent" ? (
        <>
          <CheckCircle className="size-14 text-green-500" strokeWidth={1.5} />

          <div className="flex flex-col items-center gap-2 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Check your email
            </h1>
            <p className="text-sm text-gray-500">
              If an active account matches that email, we&apos;ve sent a 6-digit
              reset code to it. The code expires in 15 minutes.
            </p>
          </div>

          <Link
            href={`/reset-pin?email=${encodeURIComponent(email.trim())}`}
            className="w-full"
          >
            <Button
              className="h-11 w-full rounded-xl text-base font-medium"
              data-testid="continue-to-reset"
            >
              Enter the code
              <ArrowRight className="ml-1 size-4" />
            </Button>
          </Link>

          <Link
            href="/sign-in"
            className="text-sm font-medium text-[#3ea3db] hover:underline"
          >
            Back to sign in
          </Link>
        </>
      ) : (
        <>
          <div className="flex flex-col items-center gap-2 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Reset your PIN
            </h1>
            <p className="text-sm text-gray-500">
              Enter the email address on your CareFirst account. We&apos;ll email
              you a 6-digit code to reset your PIN.
            </p>
          </div>

          <form
            className="flex w-full flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              handleSubmit()
            }}
          >
            <Input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="h-11 rounded-xl"
              disabled={state === "loading"}
              data-testid="forgot-pin-email"
            />

            {networkError && (
              <p
                className="text-center text-sm font-medium text-destructive"
                role="alert"
              >
                {networkError}
              </p>
            )}

            <Button
              type="submit"
              disabled={state === "loading" || !email.trim()}
              className="h-11 w-full rounded-xl text-base font-medium"
              data-testid="forgot-pin-submit"
            >
              {state === "loading" ? (
                "Sending..."
              ) : (
                <>
                  Send reset code
                  <ArrowRight className="ml-1 size-4" />
                </>
              )}
            </Button>
          </form>

          <Link
            href="/sign-in"
            className="inline-flex items-center gap-1 text-sm font-medium text-[#3ea3db] hover:underline"
          >
            <ArrowLeft className="size-3" />
            Back to sign in
          </Link>
        </>
      )}

      <p className="text-center text-xs text-gray-500">
        Having trouble?{" "}
        <a
          href="mailto:lehlohonolom@firstcare.solutions?subject=CareFirst%20Booking%20-%20PIN%20reset%20help"
          className="font-medium text-[#3ea3db] hover:underline"
        >
          Contact support
        </a>
      </p>
    </div>
  )
}
