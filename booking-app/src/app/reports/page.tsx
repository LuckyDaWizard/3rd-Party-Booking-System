import Image from "next/image"
import { listReports } from "@/lib/reports"
import { ReportsIndex } from "@/components/reports/ReportsIndex"
import { IncidentsBanner } from "@/components/reports/IncidentsBanner"

export const dynamic = "force-dynamic"

export default async function ReportsIndexPage() {
  const reports = await listReports()

  return (
    <div className="reports-root">
      <header className="page-header">
        <div className="page-header-inner">
          <Image
            src="/carefirst-logo.png"
            alt="CareFirst"
            width={200}
            height={64}
            priority
          />
          <div className="divider" />
          <div className="titles">
            <div className="super">3rd Party Booking System · Reference</div>
            <h1>Integration Reference</h1>
          </div>
        </div>
        <p className="lede">
          Technical reference for the CareFirst Patient development team — how
          the 3rd Party Booking System captures patients, takes payment, and
          hands them off via SSO. Every API touchpoint, payload contract, and
          open integration question documented in one place.
        </p>
      </header>

      <IncidentsBanner />

      <ReportsIndex reports={reports} />
    </div>
  )
}
