import { notFound } from "next/navigation"
import { MDXRemote } from "next-mdx-remote/rsc"
import remarkGfm from "remark-gfm"

import { getReport, getReportSlugs } from "@/lib/reports"
import { ReportShell } from "@/components/reports/ReportShell"
import { Section } from "@/components/reports/Section"
import { Pill } from "@/components/reports/Pill"
import { Callout } from "@/components/reports/Callout"
import { Card } from "@/components/reports/Card"
import { Grid2, Grid3, Grid4 } from "@/components/reports/Grid"
import { Payload } from "@/components/reports/Payload"
import { Mermaid } from "@/components/reports/Mermaid"
import { StepRow, Step, Arrow } from "@/components/reports/Steps"
import { MdxPre } from "@/components/reports/MdxCodeBlocks"

// =============================================================================
// Single report page — /reports/[slug]
//
// Reads the MDX file from content/reports/<slug>.mdx, parses frontmatter,
// renders the body inside the branded ReportShell. MDX has access to the
// component primitives below (Section, Pill, Callout, Card, Grid2/3/4,
// Payload, Mermaid).
// =============================================================================

const mdxComponents = {
  Section,
  Pill,
  Callout,
  Card,
  Grid2,
  Grid3,
  Grid4,
  Payload,
  Mermaid,
  StepRow,
  Step,
  Arrow,
  pre: MdxPre,
}

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  return (await getReportSlugs()).map((slug) => ({ slug }))
}

export default async function ReportPage({ params }: PageProps) {
  const { slug } = await params
  const report = await getReport(slug)
  if (!report) notFound()

  return (
    <ReportShell frontmatter={report.frontmatter}>
      <MDXRemote
        source={report.content}
        components={mdxComponents}
        options={{
          mdxOptions: {
            remarkPlugins: [remarkGfm],
          },
        }}
      />
    </ReportShell>
  )
}
