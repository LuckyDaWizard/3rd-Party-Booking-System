import type { ComponentProps, ReactElement, ReactNode } from "react"
import { Mermaid } from "./Mermaid"

// =============================================================================
// MDX overrides for fenced code blocks.
//
// Authors write Mermaid diagrams as a fenced code block tagged `mermaid`:
//
//   ```mermaid
//   flowchart LR
//     A --> B
//   ```
//
// MDX + remark-gfm compiles those to <pre><code className="language-mermaid">
// blocks. MdxPre below intercepts that pattern and renders our <Mermaid />
// client component instead. Any other code block falls through to a plain
// <pre> for normal rendering.
// =============================================================================

function extractRawText(node: ReactNode): string {
  if (node == null || node === false) return ""
  if (typeof node === "string") return node
  if (typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(extractRawText).join("")
  if (typeof node === "object" && "props" in node) {
    const el = node as { props?: { children?: ReactNode } }
    return extractRawText(el.props?.children)
  }
  return ""
}

export function MdxPre(props: ComponentProps<"pre">) {
  const { children, ...rest } = props
  const child = children as
    | ReactElement<{ className?: string; children?: ReactNode }>
    | undefined

  // remark/MDX wraps fenced code in <pre><code class="language-xyz">…</code></pre>
  if (
    child &&
    typeof child === "object" &&
    "props" in child &&
    typeof child.props?.className === "string" &&
    child.props.className.startsWith("language-")
  ) {
    const language = child.props.className.replace(/^language-/, "")
    const source = extractRawText(child.props.children)

    if (language === "mermaid") {
      return <Mermaid chart={source} />
    }
    // Dark-themed "payload" block — JSON / curl / endpoint examples. Same
    // styling as the old <Payload> component, just driven by a fenced
    // code block so the source survives MDX compilation cleanly.
    if (language === "payload") {
      return <pre className="payload">{source}</pre>
    }
  }

  return <pre {...rest}>{children}</pre>
}
