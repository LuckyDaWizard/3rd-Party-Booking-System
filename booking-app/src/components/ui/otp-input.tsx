"use client"

import * as React from "react"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp"
import { PIN_LENGTH } from "@/lib/constants"
import { cn } from "@/lib/utils"

// =============================================================================
// OtpInput
//
// 6-digit (default) PIN / OTP input. Thin wrapper around the InputOTP
// primitive that bakes in the canonical slot styling used across the auth
// pages, nurse-verification dialog and booking-verification dialog.
//
// Consolidates 6 inline copies that all declared their own:
//   <InputOTP ...><InputOTPGroup className="gap-2 sm:gap-3">
//     {Array.from({ length: PIN_LENGTH }, (_, i) => (
//       <InputOTPSlot key={i} index={i} className="!size-10 ... sm:!size-12" />
//     ))}
//   </InputOTPGroup></InputOTP>
//
// Each call site differed only in tiny ways (border colour, bg fill, error
// state, gap). Those small differences are surfaced as props.
//
// State convention: value is a single string ("123456"), not an array.
// =============================================================================

export interface OtpInputProps {
  value: string
  onChange: (value: string) => void
  /** Number of slots. Defaults to PIN_LENGTH (6). */
  length?: number
  /** Render the destructive-red border + tint. */
  error?: boolean
  disabled?: boolean
  /** Accessible label for the OTP group. */
  ariaLabel?: string
  /** data-testid on the OTPInput root for tests. */
  testId?: string
  /** Override the inner group's flex gap. Defaults to "gap-2 sm:gap-3". */
  groupClassName?: string
  /** Extra classes appended to every slot. */
  slotClassName?: string
  /**
   * When TRUE, slots render with a white fill (matches the in-flow
   * verification dialogs). When omitted, slots inherit the default
   * border-input look.
   */
  whiteFill?: boolean
}

export function OtpInput({
  value,
  onChange,
  length = PIN_LENGTH,
  error,
  disabled,
  ariaLabel,
  testId,
  groupClassName,
  slotClassName,
  whiteFill,
}: OtpInputProps) {
  return (
    <InputOTP
      maxLength={length}
      value={value}
      onChange={(v) => onChange(v.replace(/\D/g, ""))}
      disabled={disabled}
      aria-label={ariaLabel}
      data-testid={testId}
    >
      <InputOTPGroup className={cn("gap-2 sm:gap-3", groupClassName)}>
        {Array.from({ length }, (_, i) => (
          <InputOTPSlot
            key={i}
            index={i}
            className={cn(
              "!size-10 !rounded-lg !border text-lg font-semibold sm:!size-12",
              whiteFill && "border-input !bg-white",
              error && "!border-destructive bg-destructive/5",
              slotClassName
            )}
          />
        ))}
      </InputOTPGroup>
    </InputOTP>
  )
}
