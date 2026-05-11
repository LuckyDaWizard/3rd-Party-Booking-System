import type { ReactNode } from "react"

export type CardVariant = "plain" | "brand" | "ok" | "warn" | "err"

export function Card({
  variant = "plain",
  title,
  children,
}: {
  variant?: CardVariant
  title?: string
  children: ReactNode
}) {
  const variantClass = variant === "plain" ? "" : variant
  return (
    <div className={`card ${variantClass}`}>
      {title ? <h4>{title}</h4> : null}
      {children}
    </div>
  )
}
