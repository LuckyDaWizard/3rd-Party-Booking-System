import type { ReactNode } from "react"

/**
 * Horizontal row of step boxes connected by arrows. Used heavily in the
 * booking-flow walkthrough for "1 → 2 → 3"-style summaries.
 */
export function StepRow({ children }: { children: ReactNode }) {
  return <div className="step-row">{children}</div>
}

export function Step({
  num,
  title,
  muted,
  children,
}: {
  num?: string | number
  title: string
  muted?: boolean
  children?: ReactNode
}) {
  return (
    <div className={`step-box ${muted ? "muted" : ""}`}>
      {num != null ? <span className="num">{num}</span> : null}
      <b>{title}</b>
      {children ? <small>{children}</small> : null}
    </div>
  )
}

export function Arrow() {
  return <div className="arrow">→</div>
}
