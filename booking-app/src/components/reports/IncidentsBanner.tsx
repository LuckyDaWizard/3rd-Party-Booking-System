"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

// =============================================================================
// IncidentsBanner — auto-detected incidents above the regular report listing.
//
// Fetches /api/admin/incidents (system_admin only). If the caller is not an
// admin the endpoint returns 403, we treat that as "no incidents to show" and
// render nothing — the existing ReportsAuthGuard already gates the page on
// sign-in, this is just an extra capability filter for the banner.
//
// Lists open incidents prominently, then a "Recent incidents (resolved)"
// section below if there are recently-closed ones. Each row links to
// /reports/incidents/[id] for the full detail.
// =============================================================================

interface IncidentRow {
  id: string
  signature: string
  source: string
  category: string
  title: string
  http_status: number | null
  error_msg: string
  status: "open" | "resolved"
  first_seen_at: string
  last_seen_at: string
  resolved_at: string | null
  failure_count: number
  affected_booking_ids: string[]
}

function formatRel(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.round(diffMs / 60000)
  if (min < 1) return "just now"
  if (min < 60) return `${min} min ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr} hr ago`
  const day = Math.round(hr / 24)
  return `${day} day${day === 1 ? "" : "s"} ago`
}

function formatAbsolute(iso: string): string {
  return new Date(iso).toLocaleString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function IncidentsBanner() {
  const [incidents, setIncidents] = useState<IncidentRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [authorised, setAuthorised] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch("/api/admin/incidents?limit=20")
        if (!cancelled) {
          if (res.status === 401 || res.status === 403) {
            setAuthorised(false)
            setLoaded(true)
            return
          }
          if (!res.ok) {
            setLoaded(true)
            return
          }
          const json = await res.json()
          setIncidents((json.data ?? []) as IncidentRow[])
          setLoaded(true)
        }
      } catch {
        if (!cancelled) setLoaded(true)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (!loaded || !authorised) return null

  const open = incidents.filter((i) => i.status === "open")
  const recentResolved = incidents
    .filter((i) => i.status === "resolved")
    .slice(0, 5)

  if (open.length === 0 && recentResolved.length === 0) return null

  return (
    <section className="incidents-section" aria-label="Detected incidents">
      <div className="incidents-header">
        <h2>
          {open.length > 0 ? (
            <>
              <span className="incidents-dot incidents-dot-open" aria-hidden />
              {open.length} open incident{open.length === 1 ? "" : "s"}
            </>
          ) : (
            <>
              <span className="incidents-dot incidents-dot-ok" aria-hidden />
              No open incidents
            </>
          )}
        </h2>
        <p className="incidents-sub">
          Automatically detected upstream failures across CareFirst and PayFast
          integrations. Auto-resolves after 30 min of quiet.
        </p>
      </div>

      {open.length > 0 && (
        <div className="incidents-list">
          {open.map((i) => (
            <Link
              key={i.id}
              href={`/reports/incidents/${i.id}`}
              className="incident-card incident-card-open"
            >
              <div className="incident-card-top">
                <span className="incident-status incident-status-open">Open</span>
                <span className="incident-source">{i.source}</span>
                {i.http_status ? (
                  <span className="incident-http">HTTP {i.http_status}</span>
                ) : null}
              </div>
              <h3 className="incident-title">{i.title}</h3>
              <p className="incident-error">{i.error_msg}</p>
              <div className="incident-meta">
                <span>
                  <b>{i.failure_count}</b> failure
                  {i.failure_count === 1 ? "" : "s"}
                </span>
                <span>·</span>
                <span>
                  <b>{i.affected_booking_ids.length}</b> booking
                  {i.affected_booking_ids.length === 1 ? "" : "s"} affected
                </span>
                <span>·</span>
                <span title={formatAbsolute(i.first_seen_at)}>
                  first seen {formatRel(i.first_seen_at)}
                </span>
                <span>·</span>
                <span title={formatAbsolute(i.last_seen_at)}>
                  last seen {formatRel(i.last_seen_at)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {recentResolved.length > 0 && (
        <details className="incidents-resolved">
          <summary>
            Recent resolved incidents ({recentResolved.length})
          </summary>
          <div className="incidents-list">
            {recentResolved.map((i) => (
              <Link
                key={i.id}
                href={`/reports/incidents/${i.id}`}
                className="incident-card incident-card-resolved"
              >
                <div className="incident-card-top">
                  <span className="incident-status incident-status-resolved">
                    Resolved
                  </span>
                  <span className="incident-source">{i.source}</span>
                  {i.http_status ? (
                    <span className="incident-http">HTTP {i.http_status}</span>
                  ) : null}
                </div>
                <h3 className="incident-title">{i.title}</h3>
                <div className="incident-meta">
                  <span>
                    <b>{i.failure_count}</b> failure
                    {i.failure_count === 1 ? "" : "s"}
                  </span>
                  <span>·</span>
                  <span>
                    <b>{i.affected_booking_ids.length}</b> booking
                    {i.affected_booking_ids.length === 1 ? "" : "s"}
                  </span>
                  <span>·</span>
                  <span title={i.resolved_at ? formatAbsolute(i.resolved_at) : ""}>
                    resolved {i.resolved_at ? formatRel(i.resolved_at) : ""}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </details>
      )}
    </section>
  )
}
