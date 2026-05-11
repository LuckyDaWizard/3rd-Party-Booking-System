import type { ReactNode } from "react"

export type CalloutVariant = "brand" | "ok" | "warn" | "err"

export function Callout({
  variant = "brand",
  title,
  children,
}: {
  variant?: CalloutVariant
  title?: string
  children: ReactNode
}) {
  return (
    <div className={`callout ${variant === "brand" ? "" : variant}`}>
      {title ? <h4>{title}</h4> : null}
      {children}
    </div>
  )
}
