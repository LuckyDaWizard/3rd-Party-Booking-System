import type { ReactNode } from "react"

export type PillVariant = "brand" | "ok" | "warn" | "err" | "mute"

export function Pill({
  variant = "brand",
  children,
}: {
  variant?: PillVariant
  children: ReactNode
}) {
  return <span className={`pill ${variant}`}>{children}</span>
}
