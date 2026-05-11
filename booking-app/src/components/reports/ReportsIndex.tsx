"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import type { ReportListEntry } from "@/lib/reports"

// =============================================================================
// Knowledge-base style index — search + grouping by category.
//
// All filtering happens client-side. We expect the report library to stay
// under ~50 entries; if it grows past that we can switch to a server-side
// search index (Pagefind / Algolia).
// =============================================================================

const UNCATEGORISED = "Other"

function matches(report: ReportListEntry, q: string): boolean {
  if (!q) return true
  const haystack = [
    report.frontmatter.title,
    report.frontmatter.subtitle,
    report.frontmatter.audience,
    report.frontmatter.category,
    ...(report.frontmatter.tags ?? []),
    ...(report.frontmatter.pills ?? []).map((p) => p.label),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((tok) => haystack.includes(tok))
}

function dateLabel(report: ReportListEntry): string | null {
  const updated = report.frontmatter.updated
  const date = report.frontmatter.date
  if (updated && updated !== date) return `Updated ${updated}`
  if (updated) return updated
  if (date) return date
  return null
}

export function ReportsIndex({ reports }: { reports: ReportListEntry[] }) {
  const [query, setQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  // Build a stable list of all categories (in first-seen order) so the index
  // remains predictable as filters change.
  const allCategories = useMemo(() => {
    const seen = new Set<string>()
    const ordered: string[] = []
    for (const r of reports) {
      const cat = r.frontmatter.category || UNCATEGORISED
      if (!seen.has(cat)) {
        seen.add(cat)
        ordered.push(cat)
      }
    }
    return ordered
  }, [reports])

  // Total report count per category — shown on each filter chip so the user
  // can see at a glance how many docs live behind each one.
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of reports) {
      const cat = r.frontmatter.category || UNCATEGORISED
      counts.set(cat, (counts.get(cat) ?? 0) + 1)
    }
    return counts
  }, [reports])

  // Stable index of each category in the order they first appear in the
  // file list — drives the cross-category ordering of the grid.
  const categoryIndex = useMemo(() => {
    const map = new Map<string, number>()
    for (const cat of allCategories) {
      if (!map.has(cat)) map.set(cat, map.size)
    }
    return map
  }, [allCategories])

  const filtered = useMemo(() => {
    const list = reports.filter((r) => {
      if (!matches(r, query)) return false
      if (selectedCategory) {
        const cat = r.frontmatter.category || UNCATEGORISED
        if (cat !== selectedCategory) return false
      }
      return true
    })
    // Reading-order sort: (category index, frontmatter.order, title).
    // - Reports without an `order` fall to the end of their category.
    // - Title is the final tiebreaker so order is stable across reloads.
    return list.sort((a, b) => {
      const catA = categoryIndex.get(a.frontmatter.category || UNCATEGORISED) ?? Infinity
      const catB = categoryIndex.get(b.frontmatter.category || UNCATEGORISED) ?? Infinity
      if (catA !== catB) return catA - catB
      const orderA = a.frontmatter.order ?? Number.MAX_SAFE_INTEGER
      const orderB = b.frontmatter.order ?? Number.MAX_SAFE_INTEGER
      if (orderA !== orderB) return orderA - orderB
      return a.frontmatter.title.localeCompare(b.frontmatter.title)
    })
  }, [reports, query, selectedCategory, categoryIndex])

  const matchCount = filtered.length
  const totalCount = reports.length
  const hasFilter = query.length > 0 || selectedCategory !== null

  return (
    <div className="reports-index">
      <div className="kb-toolbar">
        <div className="kb-categories" role="group" aria-label="Filter by category">
          <button
            type="button"
            className={`kb-chip ${selectedCategory === null ? "active" : ""}`}
            onClick={() => setSelectedCategory(null)}
          >
            All
            <span className="kb-chip-count">{totalCount}</span>
          </button>
          {allCategories.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`kb-chip ${selectedCategory === cat ? "active" : ""}`}
              onClick={() =>
                setSelectedCategory((prev) => (prev === cat ? null : cat))
              }
            >
              {cat}
              <span className="kb-chip-count">{categoryCounts.get(cat) ?? 0}</span>
            </button>
          ))}
        </div>

        <input
          type="search"
          className="kb-search"
          placeholder="Search reports — title, audience, tags…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <div className="kb-count">
          {hasFilter ? (
            <>
              <b>{matchCount}</b> of {totalCount} match
            </>
          ) : (
            <>
              <b>{totalCount}</b> report{totalCount === 1 ? "" : "s"}
            </>
          )}
        </div>
      </div>

      {matchCount === 0 ? (
        <div className="card" style={{ marginTop: 24 }}>
          <p>
            No reports match <b>&ldquo;{query}&rdquo;</b>. Try a different
            keyword, clear the search, or pick a different category.
          </p>
        </div>
      ) : (
        <div className="kb-grid">
          {filtered.map((r) => {
            const category = r.frontmatter.category || UNCATEGORISED
            return (
              <Link
                key={r.slug}
                href={`/reports/${r.slug}`}
                className="report-card"
              >
                <div className="report-card-category">{category}</div>
                <h3 className="title">{r.frontmatter.title}</h3>
                {r.frontmatter.subtitle ? (
                  <p className="subtitle">{r.frontmatter.subtitle}</p>
                ) : null}

                <div className="meta">
                  {dateLabel(r) ? <span>{dateLabel(r)}</span> : null}
                  <span>·</span>
                  <span>{r.readingTimeMin} min read</span>
                </div>

                {r.frontmatter.audience ? (
                  <div className="report-card-audience">
                    <span className="report-card-audience-label">Audience</span>
                    <span>{r.frontmatter.audience}</span>
                  </div>
                ) : null}

                {(r.frontmatter.tags?.length ||
                  r.frontmatter.pills?.length) ? (
                  <div className="report-card-tags">
                    {r.frontmatter.pills?.map((p, i) => (
                      <span key={`p-${i}`} className={`pill ${p.variant}`}>
                        {p.label}
                      </span>
                    ))}
                    {r.frontmatter.tags?.slice(0, 3).map((t) => (
                      <span key={t} className="kb-tag">
                        #{t}
                      </span>
                    ))}
                  </div>
                ) : null}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
