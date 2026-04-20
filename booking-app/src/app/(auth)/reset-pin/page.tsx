"use client"

import { useState, useCallback, useEffect, Suspense } from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowRight, ArrowLeft, CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp"
import { PIN_LENGTH } from "@/lib/constants"

// =============================================================================
// Reset PIN — step 2 of the self-service PIN reset flow.
//
// User enters: email (pre-filled from /forgot-pin query param), 6-digit
// reset code from the email, and new PIN (twice for confirmation).
//
// POSTs to /api/auth/reset-pin which validates the code against the stored
// token hash, updates Supabase Auth password, revokes all sessions, and
// audit-logs the reset. If the chosen PIN collides with another user's
// synthetic email, the server returns 409 pin-taken and we prompt for a
// different PIN.
// =============================================================================

type State =
  | "idle"
  | "loading"
  | "success"
  | "error-invalid"     // wrong code / expired / no user
  | "error-pin-taken"   // new PIN collides with another user's
  | "error-rate-limited"
  | "error-server"

function formatRetryAfter(seconds: number): string {
  if (seconds <= 60) return `${seconds} seconds`
  const minutes = Math.ceil(seconds / 60)
  return `${minutes} minute${minutes === 1 ? "" : "s"}`
}

function ResetPinForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialEmail = searchParams.get("email") ?? ""

  const [email, setEmail] = useState(initialEmail)
  const [code, setCode] = useState("")
  const [newPin, setNewPin] = useState("")
  const [confirmPin, setConfirmPin] = useState("")
  const [state, setState] = useState<State>("idle")
  const [errorDetail, setErrorDetail] = useState<string | null>(null)

  // Reset the UI error state as soon as the user starts fixing input.
  useEffect(() => {
    if (state !== "idle" && state !== "loading" && state !== "success") {
      // A new keystroke means they're trying again — clear the error
      // once they've changed anything.
    }
  }, [state])

  const canSubmit =
    email.trim().length > 0 &&
    code.length === PIN_LENGTH &&
    newPin.length === PIN_LENGTH &&
    confirmPin.length === PIN_LENGTH &&
    state !== "loading"

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return

    if (newPin !== confirmPin) {
      setState("error-invalid")
      setErrorDetail("New PIN and confirmation don't match.")
      return
    }

    setState("loading")
    setErrorDetail(null)

    try {
      const res = await fetch("/api/auth/reset-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          code,
          newPin,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        reason?: string
        retryAfterSeconds?: number
      }

      if (res.ok && data.ok) {
        setState("success")
        return
      }

      switch (data.reason) {
        case "pin-taken":
          setState("error-pin-taken")
          setErrorDetail(null)
          setNewPin("")
          setConfirmPin("")
          break
        case "rate-limited":
          setState("error-rate-limited")
          setErrorDetail(
            `Too many attempts. Please try again in ${formatRetryAfter(
              data.retryAfterSeconds ?? 3600
            )}.`
          )
          break
        case "server-error":
          setState("error-server")
          setErrorDetail(
            "Something went wrong on our side. Try again in a moment."
          )
          break
        default:
          setState("error-invalid")
          setErrorDetail(
            "That code didn't work. It may be wrong, expired, or already used."
          )
          setCode("")
      }
    } catch {
      setState("error-server")
      setErrorDetail("Network error. Please check your connection and try again.")
    }
  }, [canSubmit, code, confirmPin, email, newPin])

  if (state === "success") {
    return (
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <Image
          src="/carefirst-logo.png"
          alt="CareFirst"
          width={200}
          height={36}
          priority
          className="h-auto w-[200px]"
        />
        <CheckCircle className="size-14 text-green-500" strokeWidth={1.5} />
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            PIN reset
          </h1>
          <p className="text-sm text-gray-500">
            Your PIN has been updated and any existing sessions have been
            signed out. Sign in with your new PIN to continue.
          </p>
        </div>
        <Button
          onClick={() => router.push("/sign-in")}
          className="h-11 w-full rounded-xl text-base font-medium"
        >
          Go to sign in
          <ArrowRight className="ml-1 size-4" />
        </Button>
      </div>
    )
  }

  const showError = state.startsWith("error")

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-6">
      <Image
        src="/carefirst-logo.png"
        alt="CareFirst"
        width={200}
        height={36}
        priority
        className="h-auto w-[200px]"
      />

      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Set a new PIN
        </h1>
        <p className="text-sm text-gray-500">
          Enter the 6-digit code we sent to your email, then choose a new PIN.
        </p>
      </div>

      <form
        className="flex w-full flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          handleSubmit()
        }}
      >
        {/* Email */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="reset-email" className="text-xs font-medium text-gray-700">
            Email
          </label>
          <Input
            id="reset-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
            className="h-11 rounded-xl"
            disabled={state === "loading"}
          />
        </div>

        {/* 6-digit code */}
        <div className="flex flex-col items-center gap-1.5">
          <label className="self-start text-xs font-medium text-gray-700">
            Reset code
          </label>
          <InputOTP
            maxLength={PIN_LENGTH}
            value={code}
            onChange={(v) => setCode(v.replace(/\D/g, ""))}
            disabled={state === "loading"}
            aria-label="6-digit reset code"
          >
            <InputOTPGroup className="gap-2 sm:gap-3">
              {Array.from({ length: PIN_LENGTH }, (_, i) => (
                <InputOTPSlot
                  key={i}
                  index={i}
                  className="!size-10 !rounded-lg !border text-lg font-semibold sm:!size-12"
                />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>

        {/* New PIN */}
        <div className="flex flex-col items-center gap-1.5">
          <label className="self-start text-xs font-medium text-gray-700">
            New PIN
          </label>
          <InputOTP
            maxLength={PIN_LENGTH}
            value={newPin}
            onChange={(v) => setNewPin(v.replace(/\D/g, ""))}
            disabled={state === "loading"}
            aria-label="New 6-digit PIN"
          >
            <InputOTPGroup className="gap-2 sm:gap-3">
              {Array.from({ length: PIN_LENGTH }, (_, i) => (
                <InputOTPSlot
                  key={i}
                  index={i}
                  className="!size-10 !rounded-lg !border text-lg font-semibold sm:!size-12"
                />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>

        {/* Confirm PIN */}
        <div className="flex flex-col items-center gap-1.5">
          <label className="self-start text-xs font-medium text-gray-700">
            Confirm new PIN
          </label>
          <InputOTP
            maxLength={PIN_LENGTH}
            value={confirmPin}
            onChange={(v) => setConfirmPin(v.replace(/\D/g, ""))}
            disabled={state === "loading"}
            aria-label="Confirm new 6-digit PIN"
          >
            <InputOTPGroup className="gap-2 sm:gap-3">
              {Array.from({ length: PIN_LENGTH }, (_, i) => (
                <InputOTPSlot
                  key={i}
                  index={i}
                  className="!size-10 !rounded-lg !border text-lg font-semibold sm:!size-12"
                />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>

        {showError && (
          <div
            className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            role="alert"
          >
            {state === "error-pin-taken" ? (
              <>
                <strong>That PIN is already in use.</strong> Pick a different
                one and try again.
              </>
            ) : (
              errorDetail ?? "Please check your entries and try again."
            )}
          </div>
        )}

        <Button
          type="submit"
          disabled={!canSubmit}
          className="h-11 w-full rounded-xl text-base font-medium"
          data-testid="reset-pin-submit"
        >
          {state === "loading" ? (
            "Resetting..."
          ) : (
            <>
              Reset PIN
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

      <p className="text-center text-xs text-gray-500">
        Didn&apos;t receive a code?{" "}
        <Link
          href="/forgot-pin"
          className="font-medium text-[#3ea3db] hover:underline"
        >
          Request a new one
        </Link>
      </p>
    </div>
  )
}

export default function ResetPinPage() {
  // useSearchParams must be wrapped in a Suspense boundary for app-router
  // static generation.
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center">
          <svg className="size-10 animate-spin" viewBox="0 0 40 40" fill="none">
            <circle cx="20" cy="20" r="15" stroke="#d1d5db" strokeWidth="5" strokeLinecap="round" />
            <circle cx="20" cy="20" r="15" stroke="#3ea3db" strokeWidth="5" strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset="70" />
          </svg>
        </div>
      }
    >
      <ResetPinForm />
    </Suspense>
  )
}
