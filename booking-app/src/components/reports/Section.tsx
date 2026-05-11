import type { ReactNode } from "react"

/**
 * One section card on a report page. Wraps content in the same `<section
 * class="doc-section">` shell used by the standalone walkthrough docs.
 *
 * - `id` matches the frontmatter section id (anchor target).
 * - `num` is the small uppercase eyebrow ("01 — Context").
 * - `title` is the section heading.
 */
export function Section({
  id,
  num,
  title,
  children,
}: {
  id: string
  num: string
  title: string
  children: ReactNode
}) {
  return (
    <section className="doc-section" id={id}>
      <div className="section-header">
        <div className="num">{num}</div>
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  )
}
