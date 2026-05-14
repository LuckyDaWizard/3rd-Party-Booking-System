import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { getSupabaseServer } from "@/lib/supabase-server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { ReportShell } from "@/components/reports/ReportShell"
import type { ReportFrontmatter } from "@/lib/reports"
import { Section } from "@/components/reports/Section"
import { Card } from "@/components/reports/Card"
import { Grid2 } from "@/components/reports/Grid"

// =============================================================================
// Auto-generated incident report — /reports/incidents/[id]
//
// Reads the row from the `incidents` table and renders it inside the same
// ReportShell used by the curated MDX reports. system_admin only — others get
// redirected to /reports. Anonymous visitors go to /sign-in (the layout's
// existing ReportsAuthGuard catches that on the client; we double-check on
// the server here so we never leak data into the SSR'd HTML).
// =============================================================================

export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ id: string }>
}

interface IncidentRow {
  id: string
  signature: string
  source: string
  category: string
  title: string
  http_status: number | null
  error_msg: string
  raw_sample: string | null
  status: "open" | "resolved"
  first_seen_at: string
  last_seen_at: string
  resolved_at: string | null
  failure_count: number
  affected_booking_ids: string[]
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-ZA", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function durationLabel(fromIso: string, toIso: string): string {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime()
  const min = Math.round(ms / 60000)
  if (min < 1) return "under a minute"
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"}`
  const hr = Math.floor(min / 60)
  const rem = min % 60
  if (hr < 24) {
    return rem === 0
      ? `${hr} hour${hr === 1 ? "" : "s"}`
      : `${hr}h ${rem}m`
  }
  const day = Math.floor(hr / 24)
  return `${day} day${day === 1 ? "" : "s"}`
}

export default async function IncidentPage({ params }: PageProps) {
  const { id } = await params

  // Server-side admin gate. ReportsAuthGuard handles sign-in on the client,
  // but we don't want a non-admin to ever receive this SSR'd content.
  const sb = await getSupabaseServer()
  const {
    data: { user: authUser },
  } = await sb.auth.getUser()

  if (!authUser) redirect(`/sign-in?next=/reports/incidents/${id}`)

  const { data: userRow } = await sb
    .from("users")
    .select("role, status")
    .eq("auth_user_id", authUser.id)
    .single()

  if (!userRow || userRow.status !== "Active" || userRow.role !== "system_admin") {
    redirect("/reports")
  }

  let admin
  try {
    admin = getSupabaseAdmin()
  } catch {
    notFound()
  }

  const { data: incident, error } = await admin
    .from("incidents")
    .select("*")
    .eq("id", id)
    .single<IncidentRow>()

  if (error || !incident) notFound()

  const bookingIds = (incident.affected_booking_ids ?? []).slice(0, 20)
  const { data: bookingRows } = bookingIds.length
    ? await admin
        .from("bookings")
        .select("id, first_names, surname, status")
        .in("id", bookingIds)
    : { data: [] }

  const bookings = (bookingRows ?? []).map((b) => {
    const name =
      [b.first_names, b.surname].filter(Boolean).join(" ") || "Unknown patient"
    return {
      id: b.id as string,
      ref: (b.id as string).slice(0, 8).toUpperCase(),
      patientName: name,
      status: (b.status as string) ?? "Unknown",
    }
  })

  const frontmatter: ReportFrontmatter = {
    title: incident.title,
    super: "3rd Party Booking System · Auto-detected Incident",
    subtitle: `Auto-generated from upstream failures captured by the system. Failures recorded against signature "${incident.signature}".`,
    date: incident.first_seen_at.slice(0, 10),
    updated: incident.last_seen_at.slice(0, 10),
    pills: [
      incident.status === "open"
        ? { label: "Open", variant: "err" as const }
        : { label: "Resolved", variant: "ok" as const },
      {
        label: incident.source.toUpperCase(),
        variant: "brand" as const,
      },
      ...(incident.http_status
        ? [
            {
              label: `HTTP ${incident.http_status}`,
              variant: "warn" as const,
            },
          ]
        : []),
    ],
    sections: [
      { id: "summary", label: "Summary" },
      { id: "timeline", label: "Timeline" },
      { id: "error", label: "Last error captured" },
      { id: "affected", label: "Affected bookings" },
      ...(incident.raw_sample
        ? [{ id: "raw", label: "Raw upstream response" }]
        : []),
      { id: "ops", label: "What ops should do" },
    ],
  }

  return (
    <ReportShell frontmatter={frontmatter}>
      <Section id="summary" num="01 — Summary" title="Summary">
        <Grid2>
          <Card
            variant={incident.status === "open" ? "warn" : "ok"}
            title={incident.status === "open" ? "Status: OPEN" : "Status: RESOLVED"}
          >
            {incident.status === "open" ? (
              <>
                Failures are still landing for this signature. Auto-resolves
                after 30 min of no new failures.
              </>
            ) : (
              <>
                Last failure was {durationLabel(incident.last_seen_at, incident.resolved_at ?? new Date().toISOString())} before the system auto-resolved this incident.
              </>
            )}
          </Card>
          <Card variant="brand" title="Failure signature">
            <code>{incident.signature}</code>
            <br />
            <small>
              {incident.failure_count} failure
              {incident.failure_count === 1 ? "" : "s"} recorded
            </small>
          </Card>
        </Grid2>
      </Section>

      <Section id="timeline" num="02 — Timeline" title="When this happened">
        <table>
          <tbody>
            <tr>
              <td>
                <b>First seen</b>
              </td>
              <td>{formatDateTime(incident.first_seen_at)}</td>
            </tr>
            <tr>
              <td>
                <b>Last seen</b>
              </td>
              <td>
                {formatDateTime(incident.last_seen_at)}
                <span className="muted">
                  {" "}
                  ({durationLabel(incident.first_seen_at, incident.last_seen_at)} after first)
                </span>
              </td>
            </tr>
            {incident.resolved_at ? (
              <tr>
                <td>
                  <b>Auto-resolved</b>
                </td>
                <td>{formatDateTime(incident.resolved_at)}</td>
              </tr>
            ) : null}
            <tr>
              <td>
                <b>Failure count</b>
              </td>
              <td>{incident.failure_count}</td>
            </tr>
          </tbody>
        </table>
      </Section>

      <Section id="error" num="03 — Error" title="Last error captured">
        <p>The most recent error message the system received from the upstream:</p>
        <pre>{incident.error_msg}</pre>
      </Section>

      <Section
        id="affected"
        num="04 — Affected"
        title={`Affected bookings (${incident.affected_booking_ids.length})`}
      >
        {bookings.length === 0 ? (
          <p>
            No specific bookings were tagged on this incident — it was raised
            from a non-booking-bound failure path (e.g. PayFast ITN webhook).
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Ref</th>
                <th>Patient</th>
                <th>Current status</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id}>
                  <td>
                    <code>{b.ref}</code>
                  </td>
                  <td>{b.patientName}</td>
                  <td>{b.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {incident.affected_booking_ids.length > bookings.length ? (
          <p>
            <small>
              Showing the first {bookings.length} of{" "}
              {incident.affected_booking_ids.length} affected bookings.
            </small>
          </p>
        ) : null}
        <p>
          <Link href="/audit-log">
            Open the Audit Log → Bookings tab for full per-booking timelines →
          </Link>
        </p>
      </Section>

      {incident.raw_sample ? (
        <Section
          id="raw"
          num="05 — Raw"
          title="Raw upstream response (truncated)"
        >
          <p>
            What the upstream service literally returned. Useful when the error
            message is generic but the body has more clues.
          </p>
          <pre>{incident.raw_sample}</pre>
        </Section>
      ) : null}

      <Section
        id="ops"
        num={incident.raw_sample ? "06 — Ops" : "05 — Ops"}
        title="What ops should do"
      >
        {incident.source === "carefirst" ? (
          <ul>
            <li>
              Contact CareFirst support — share the failure signature{" "}
              <code>{incident.signature}</code> and the timestamps above.
            </li>
            <li>
              Once they confirm recovery, hit <b>Start Consult</b> again on any
              affected booking. The system retries cleanly.
            </li>
            <li>
              No manual DB intervention needed. Affected bookings stay at{" "}
              <b>Payment Complete</b> and will succeed the moment upstream
              recovers.
            </li>
          </ul>
        ) : incident.source === "payfast" ? (
          <ul>
            <li>
              Check the PayFast status page / contact PayFast support. Share
              the failure signature <code>{incident.signature}</code>.
            </li>
            <li>
              ITN-side failures don&apos;t need manual intervention — PayFast
              retries with exponential backoff and reconcile will pick up
              anything that fell through.
            </li>
            <li>
              If reconcile keeps failing, the Transaction History API may need
              re-credentialing (check <code>PAYFAST_*</code> env vars).
            </li>
          </ul>
        ) : (
          <ul>
            <li>
              Internal failure — check application and database logs for the
              full stack trace. Failure signature: <code>{incident.signature}</code>.
            </li>
          </ul>
        )}
      </Section>
    </ReportShell>
  )
}
