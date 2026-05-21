"use client"

import dynamic from "next/dynamic"

// =============================================================================
// Mermaid — public wrapper. `next/dynamic` with `ssr: false` ensures the
// MermaidClient bundle (and, via its own internal `await import("mermaid")`,
// the ~80 KB mermaid npm package) only downloads on report pages that
// actually contain a diagram. Diagram-free reports never pay the cost.
//
// Callers continue to write `<Mermaid chart="..." />` exactly as before —
// the wrapper is transparent.
// =============================================================================

export const Mermaid = dynamic(
  () => import("./MermaidClient").then((m) => m.Mermaid),
  {
    ssr: false,
    loading: () => (
      <div className="mermaid-wrap">
        <div className="mermaid" />
      </div>
    ),
  }
)
