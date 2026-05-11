"use client"

import { useEffect, useId, useRef, useState, type ReactNode } from "react"

// =============================================================================
// Mermaid — client component that renders a diagram from its template-literal
// children. Mermaid is lazy-imported so it doesn't bloat the report payload
// for diagram-free pages.
//
// Theme variables mirror the CareFirst brand palette. NOTE: all values must
// be real colours (never 'transparent') — Mermaid feeds them into colour
// math (lighten/darken/mix) and throws "Syntax error in text" otherwise.
// =============================================================================

let initialised = false

async function ensureInitialised() {
  if (initialised) return
  const mermaid = (await import("mermaid")).default
  mermaid.initialize({
    startOnLoad: false,
    theme: "base",
    themeVariables: {
      background:          "#ffffff",
      primaryColor:        "#e0f0fa",
      primaryTextColor:    "#0f172a",
      primaryBorderColor:  "#1f6f9d",
      lineColor:           "#64748b",
      secondaryColor:      "#f0f9ff",
      tertiaryColor:       "#f8fafc",
      mainBkg:             "#e0f0fa",
      nodeBorder:          "#1f6f9d",
      clusterBkg:          "#f8fafc",
      clusterBorder:       "#cbd5e1",
      fontFamily:          "Roboto, system-ui, sans-serif",
      fontSize:            "18px",
    },
    flowchart: {
      curve: "basis",
      useMaxWidth: true,
      // htmlLabels embeds <foreignObject><div class="nodeLabel">. Under our
      // scoped CSS the label CSS doesn't cascade into the foreignObject and
      // the text disappears. Plain SVG <text> labels render reliably.
      htmlLabels: false,
      nodeSpacing: 50,
      rankSpacing: 60,
      padding: 16,
    },
  })
  initialised = true
}

function extractText(node: ReactNode): string {
  if (node == null || node === false) return ""
  if (typeof node === "string") return node
  if (typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(extractText).join("")
  // React element with children — recurse.
  if (typeof node === "object" && node !== null && "props" in node) {
    const el = node as { props?: { children?: ReactNode } }
    return extractText(el.props?.children)
  }
  return ""
}

export function Mermaid({
  chart,
  children,
}: {
  /**
   * Preferred — pass the diagram source as a string prop. The children
   * fallback exists for migrations; new content should use `chart`.
   */
  chart?: string
  children?: ReactNode
}) {
  const reactId = useId().replace(/:/g, "")
  const ref = useRef<HTMLDivElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const source = (chart ?? extractText(children)).trim()

  useEffect(() => {
    let cancelled = false
    const renderId = `m${reactId}`

    async function render() {
      if (!ref.current) return
      try {
        await ensureInitialised()
        const mermaid = (await import("mermaid")).default
        const { svg } = await mermaid.render(renderId, source)
        if (!cancelled && ref.current) {
          ref.current.innerHTML = svg
          setError(null)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e))
        }
      } finally {
        // Mermaid v10 sometimes leaves a temporary <div id="d<renderId>"> or
        // <svg id="<renderId>"> appended to document.body when render fails
        // mid-way. Sweep them so client-side navigation doesn't leak orphan
        // DOM into the next page.
        const orphans = [
          document.getElementById(renderId),
          document.getElementById(`d${renderId}`),
        ]
        for (const el of orphans) {
          if (el && el.parentElement === document.body) {
            el.remove()
          }
        }
      }
    }

    render()
    return () => {
      cancelled = true
    }
  }, [source, reactId])

  return (
    <div className="mermaid-wrap">
      {error ? (
        <pre style={{ color: "var(--r-err)", fontSize: 12 }}>
          Mermaid render error: {error}
        </pre>
      ) : (
        <div className="mermaid" ref={ref} />
      )}
    </div>
  )
}
