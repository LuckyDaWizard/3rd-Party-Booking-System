import type { ReactNode } from "react"

/**
 * Dark "payload" code block — used for JSON / curl / endpoint examples in
 * reports. Mirrors the .payload class in src/app/reports/reports.css.
 *
 * Authors use it in MDX like:
 *
 *   <Payload>{`{
 *     "key": "value"
 *   }`}</Payload>
 *
 * The template-literal preserves whitespace.
 */
export function Payload({ children }: { children: ReactNode }) {
  return <pre className="payload">{children}</pre>
}
