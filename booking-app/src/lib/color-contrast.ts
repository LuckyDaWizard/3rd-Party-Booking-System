// =============================================================================
// color-contrast.ts
//
// WCAG 2.1 contrast-ratio helpers. Tiny, dependency-free.
//
// Used by the client accent-colour picker to warn admins when their chosen
// brand colour has low contrast against white text — most accent surfaces
// in the dashboard are solid pills / buttons that paint white text on the
// accent, so contrast against #fff is the dominant concern.
//
// Reference: https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
// =============================================================================

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

/** Parse a 3- or 6-digit hex into [r, g, b] (0–255). Returns null on garbage. */
export function hexToRgb(hex: string): [number, number, number] | null {
  if (!HEX_RE.test(hex)) return null
  let h = hex.slice(1)
  if (h.length === 3) h = h.split("").map((c) => c + c).join("")
  const num = parseInt(h, 16)
  return [(num >> 16) & 0xff, (num >> 8) & 0xff, num & 0xff]
}

/** WCAG relative luminance of an sRGB triple. Returns 0–1. */
export function relativeLuminance([r, g, b]: [number, number, number]): number {
  const [R, G, B] = [r, g, b].map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * R + 0.7152 * G + 0.0722 * B
}

/** WCAG contrast ratio between two hex colours. Returns ≥ 1 (1 = same colour). */
export function contrastRatio(hexA: string, hexB: string): number | null {
  const a = hexToRgb(hexA)
  const b = hexToRgb(hexB)
  if (!a || !b) return null
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [light, dark] = la > lb ? [la, lb] : [lb, la]
  return (light + 0.05) / (dark + 0.05)
}

/**
 * Verdict label + tone for a contrast ratio against a fixed white text
 * background — the dominant case for our accent surfaces.
 *
 * Thresholds (WCAG 2.1):
 *   ≥ 4.5  → AA  (normal body text)
 *   ≥ 3.0  → AA Large (large text / UI components like buttons)
 *   < 3.0  → Fail
 */
export type ContrastVerdict = "aa-normal" | "aa-large" | "fail"

export interface ContrastCheck {
  ratio: number
  verdict: ContrastVerdict
}

export function checkAccentAgainstWhite(hex: string): ContrastCheck | null {
  const ratio = contrastRatio(hex, "#ffffff")
  if (ratio === null) return null
  let verdict: ContrastVerdict
  if (ratio >= 4.5) verdict = "aa-normal"
  else if (ratio >= 3) verdict = "aa-large"
  else verdict = "fail"
  return { ratio, verdict }
}
