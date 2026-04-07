"use client"

import { useState, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp"
import { useAuth } from "@/lib/auth-store"

const MAX_ATTEMPTS = 5
const PIN_LENGTH = 6

type SignInState = "idle" | "loading" | "error" | "lockout"

export default function SignInPage() {
  const router = useRouter()
  const { signIn, user } = useAuth()
  const [pin, setPin] = useState("")
  const [state, setState] = useState<SignInState>("idle")
  const [attemptCount, setAttemptCount] = useState(0)
  const [customError, setCustomError] = useState<string | null>(null)

  // If already signed in, redirect to home
  useEffect(() => {
    if (user) router.push("/home")
  }, [user, router])

  const errorMessage =
    customError ??
    (state === "error"
      ? "Invalid Code - Please Retry"
      : state === "lockout"
        ? "Invalid Code - Max attempts exceeded please contact your admin to reset your access pin"
        : null)

  const isInputDisabled = state === "loading" || state === "lockout"
  const isButtonDisabled = state === "loading" || state === "lockout"
  const hasError = state === "error" || state === "lockout"

  const handleSubmit = useCallback(async () => {
    if (pin.length !== PIN_LENGTH || isButtonDisabled) return

    setState("loading")
    setCustomError(null)

    try {
      const result = await signIn(pin)

      if (result.success) {
        router.push("/home")
        return
      }

      const newAttemptCount = attemptCount + 1
      setAttemptCount(newAttemptCount)
      setPin("")

      if (newAttemptCount >= MAX_ATTEMPTS) {
        setState("lockout")
      } else {
        setState("error")
        if (result.error) setCustomError(result.error)
      }
    } catch {
      const newAttemptCount = attemptCount + 1
      setAttemptCount(newAttemptCount)
      setPin("")

      if (newAttemptCount >= MAX_ATTEMPTS) {
        setState("lockout")
      } else {
        setState("error")
      }
    }
  }, [pin, isButtonDisabled, attemptCount, signIn, router])

  const handlePinChange = useCallback(
    (value: string) => {
      if (isInputDisabled) return
      setPin(value)

      if (state === "error") {
        setState("idle")
        setCustomError(null)
      }
    },
    [isInputDisabled, state]
  )

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-8">
      {/* Logo */}
      <Image
        src="/carefirst-logo.png"
        alt="CareFirst"
        width={200}
        height={36}
        priority
        className="h-auto w-[200px]"
        data-testid="sign-in-logo"
      />

      {/* Heading and subtitle */}
      <div className="flex flex-col items-center gap-2 text-center">
        <h1
          className="text-3xl font-bold tracking-tight text-foreground"
          data-testid="sign-in-heading"
        >
          Enter your access pin
        </h1>
        <p
          className="text-base text-muted-foreground"
          data-testid="sign-in-subtitle"
        >
          Please enter the unique pin to start a journey.
        </p>
      </div>

      {/* Form area */}
      <form
        className="flex w-full flex-col items-center gap-6"
        onSubmit={(e) => {
          e.preventDefault()
          handleSubmit()
        }}
        data-testid="sign-in-form"
      >
        {/* Error message */}
        {errorMessage && (
          <p
            className="text-center text-sm font-medium text-destructive"
            role="alert"
            data-testid="sign-in-error"
          >
            {errorMessage}
          </p>
        )}

        {/* PIN input or loading spinner */}
        {state === "loading" ? (
          <div
            className="flex h-14 items-center justify-center"
            data-testid="sign-in-loading"
          >
            <svg className="size-10 animate-spin" viewBox="0 0 40 40" fill="none">
              <circle cx="20" cy="20" r="15" stroke="#d1d5db" strokeWidth="7" strokeLinecap="round" />
              <circle cx="20" cy="20" r="15" stroke="#3ea3db" strokeWidth="7" strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset="70" />
            </svg>
          </div>
        ) : (
          <InputOTP
            maxLength={PIN_LENGTH}
            value={pin}
            onChange={handlePinChange}
            disabled={isInputDisabled}
            aria-label="Access pin"
            data-testid="sign-in-pin-input"
          >
            <InputOTPGroup className="gap-3">
              {Array.from({ length: PIN_LENGTH }, (_, i) => (
                <InputOTPSlot
                  key={i}
                  index={i}
                  className={`!size-12 !rounded-lg !border text-lg font-semibold ${
                    hasError
                      ? "!border-destructive bg-destructive/5"
                      : "border-input"
                  }`}
                />
              ))}
            </InputOTPGroup>
          </InputOTP>
        )}

        {/* Submit button */}
        <Button
          type="submit"
          disabled={isButtonDisabled || pin.length !== PIN_LENGTH}
          className="h-11 w-full rounded-xl text-base font-medium"
          data-testid="sign-in-submit"
        >
          {state === "loading" ? (
            "Verifying..."
          ) : (
            <>
              Next
              <ArrowRight className="ml-1 size-4" data-icon="inline-end" />
            </>
          )}
        </Button>
      </form>
    </div>
  )
}
