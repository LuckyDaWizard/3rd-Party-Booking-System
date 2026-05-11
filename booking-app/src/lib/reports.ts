import fs from "node:fs/promises"
import path from "node:path"
import matter from "gray-matter"

// =============================================================================
// Reports — read MDX files from booking-app/content/reports/, parse the
// frontmatter, expose typed listings + source.
//
// Server-only. Do not import this from a client component; it touches the
// filesystem.
// =============================================================================

export interface ReportPill {
  label: string
  variant: "brand" | "ok" | "warn" | "err" | "mute"
}

export interface ReportSection {
  /** DOM id used as the anchor target. */
  id: string
  /** Label shown in the TOC. */
  label: string
}

export interface ReportFrontmatter {
  title: string
  /** Small uppercase eyebrow above the title (e.g. "CareFirst Health · 3rd Party Booking"). */
  super: string
  /** Sentence under the title, in the header lede. */
  subtitle?: string
  /** Audience for the report — shown on the index card. */
  audience?: string
  /** ISO date string — when the report was first published. */
  date?: string
  /** ISO date string — when the report was last meaningfully updated. */
  updated?: string
  /** Knowledge-base category (e.g. "Integration", "Operations", "Reference"). */
  category?: string
  /** Free-form tags for filtering / search. */
  tags?: string[]
  /** Tag pills shown in the header (and on the index card). */
  pills?: ReportPill[]
  /** TOC entries. Order matters. */
  sections: ReportSection[]
  /** Optional footer text override. */
  footer?: string
  /**
   * Hide this report from the index listing. The page is still reachable
   * at /reports/<slug> for direct links (internal ops, troubleshooting)
   * but doesn't clutter the externally-facing Integration Reference index.
   */
  internal?: boolean
  /**
   * Reading-order rank within the report's category. Lower = earlier.
   * Use multiples of 10 (10, 20, 30, ...) so future inserts don't force a
   * renumber. Reports without an `order` fall to the end of their group.
   */
  order?: number
}

export interface ReportListEntry {
  slug: string
  frontmatter: ReportFrontmatter
  /** Estimated reading time in minutes, computed from the MDX body. */
  readingTimeMin: number
}

export interface ReportSource {
  slug: string
  frontmatter: ReportFrontmatter
  /** Raw MDX body (after frontmatter strip). */
  content: string
}

const REPORTS_DIR = path.join(process.cwd(), "content", "reports")

function isMdx(filename: string): boolean {
  return filename.endsWith(".mdx") && !filename.startsWith("_")
}

/**
 * Gray-matter's YAML parser turns `date: 2026-05-11` into a JS Date object,
 * which React then refuses to render as a child. Coerce date-like fields to
 * ISO yyyy-mm-dd strings so the frontmatter shape is plain JSON.
 */
function normaliseFrontmatter(data: Record<string, unknown>): ReportFrontmatter {
  const out: Record<string, unknown> = { ...data }
  for (const key of ["date", "updated"]) {
    if (out[key] instanceof Date) {
      out[key] = (out[key] as Date).toISOString().slice(0, 10)
    }
  }
  // Cast via `unknown` — gray-matter returns Record<string, unknown> which
  // doesn't structurally overlap with ReportFrontmatter, but at runtime the
  // YAML frontmatter is exactly the shape we declare. Direct casts are
  // refused by strict tsc; the `unknown` step is the canonical escape hatch.
  return out as unknown as ReportFrontmatter
}

/**
 * Rough reading-time estimate. Strips JSX tags, code fences, and markdown
 * punctuation, then divides remaining words by 200 wpm. Good enough for a
 * card hint — not a billed metric.
 */
function estimateReadingTime(body: string): number {
  const cleaned = body
    .replace(/```[\s\S]*?```/g, " ")    // fenced code blocks
    .replace(/`[^`]*`/g, " ")           // inline code
    .replace(/<\/?[A-Za-z][^>]*>/g, " ") // JSX / HTML tags
    .replace(/[#>*_~|\-+]/g, " ")       // markdown punctuation
    .replace(/\s+/g, " ")
    .trim()
  const words = cleaned ? cleaned.split(" ").length : 0
  return Math.max(1, Math.ceil(words / 200))
}

/**
 * Lists reports for the public-facing index.
 *
 * By default reports flagged `internal: true` in their frontmatter are
 * filtered out — those are still reachable by direct URL at
 * `/reports/<slug>` for internal ops use, but they don't clutter the
 * Integration Reference index meant for CareFirst's dev team.
 *
 * Pass `{ includeInternal: true }` to get everything (useful for admin
 * tooling / debug pages).
 */
export async function listReports(
  options: { includeInternal?: boolean } = {}
): Promise<ReportListEntry[]> {
  let files: string[]
  try {
    files = await fs.readdir(REPORTS_DIR)
  } catch {
    return []
  }

  const entries: ReportListEntry[] = []
  for (const file of files.sort()) {
    if (!isMdx(file)) continue
    const slug = file.replace(/\.mdx$/, "")
    const raw = await fs.readFile(path.join(REPORTS_DIR, file), "utf-8")
    const { data, content } = matter(raw)
    const frontmatter = normaliseFrontmatter(data)
    if (frontmatter.internal && !options.includeInternal) continue
    entries.push({
      slug,
      frontmatter,
      readingTimeMin: estimateReadingTime(content),
    })
  }
  return entries
}

/** Loads a single report by slug. Returns null if not found. */
export async function getReport(slug: string): Promise<ReportSource | null> {
  // Slug-safety: reject anything that isn't a normal filename token.
  if (!/^[a-z0-9-]+$/i.test(slug)) return null
  const file = path.join(REPORTS_DIR, `${slug}.mdx`)
  let raw: string
  try {
    raw = await fs.readFile(file, "utf-8")
  } catch {
    return null
  }
  const { data, content } = matter(raw)
  return {
    slug,
    frontmatter: normaliseFrontmatter(data),
    content,
  }
}

/** Slugs for static generation at build time. */
export async function getReportSlugs(): Promise<string[]> {
  return (await listReports()).map((r) => r.slug)
}
