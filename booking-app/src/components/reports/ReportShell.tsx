import Image from "next/image"
import Link from "next/link"
import type { ReactNode } from "react"
import type { ReportFrontmatter } from "@/lib/reports"
import { TocActiveHighlighter } from "./TocActiveHighlighter"

/**
 * Shell wrapping a single report — gradient header with logo lockup, sticky
 * TOC down the left, content column on the right. Matches the layout of the
 * standalone walkthrough HTML docs.
 *
 * Server component; the only client piece is TocActiveHighlighter, which
 * tracks which section is currently in view and highlights the TOC link.
 */
export function ReportShell({
  frontmatter,
  children,
}: {
  frontmatter: ReportFrontmatter
  children: ReactNode
}) {
  return (
    <div className="reports-root">
      <header className="page-header">
        <div className="page-header-breadcrumb">
          <Link href="/reports" className="back-link">
            <span aria-hidden="true">←</span> All reports
          </Link>
        </div>
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
            <div className="super">{frontmatter.super}</div>
            <h1>{frontmatter.title}</h1>
          </div>
          {frontmatter.pills && frontmatter.pills.length > 0 ? (
            <div className="pills">
              {frontmatter.pills.map((p, i) => (
                <span key={i} className={`pill ${p.variant}`}>
                  {p.label}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        {frontmatter.subtitle ? (
          <p className="lede">{frontmatter.subtitle}</p>
        ) : null}
      </header>

      <div className="layout">
        <aside className="toc" aria-label="Table of contents">
          <Link href="/reports" className="toc-back-link">
            <span aria-hidden="true">←</span> All reports
          </Link>
          <div className="toc-title">On this page</div>
          <ol>
            {frontmatter.sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`}>{s.label}</a>
              </li>
            ))}
          </ol>
        </aside>

        <main>{children}</main>
      </div>

      <footer className="page-footer">
        <p>
          <span className="pill brand">CareFirst</span>
          &nbsp;
          {frontmatter.footer ??
            "First Care Solutions · 3rd Party Booking System"}
        </p>
      </footer>

      <TocActiveHighlighter />
    </div>
  )
}
