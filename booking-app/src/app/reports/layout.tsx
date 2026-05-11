import type { ReactNode } from "react"
import { ReportsAuthGuard } from "@/components/reports/ReportsAuthGuard"
import { ScrollToTop } from "@/components/reports/ScrollToTop"
import "./reports.css"

// =============================================================================
// Auth-gated layout for /reports/*.
//
// All report URLs require sign-in. Anonymous visitors are bounced to
// /sign-in. We keep the layout intentionally minimal — no sidebar, no
// dashboard chrome — because reports are designed to look like standalone
// documents you can share, even though they're internal.
//
// The layout itself is a server component so the server-rendered tree always
// includes the children HTML (no SSR / hydration mismatch). A thin client
// component (ReportsAuthGuard) overlays a loading / redirect state on top
// when the user isn't signed in.
// =============================================================================

export default function ReportsLayout({ children }: { children: ReactNode }) {
  return (
    <ReportsAuthGuard>
      {children}
      <ScrollToTop />
    </ReportsAuthGuard>
  )
}
