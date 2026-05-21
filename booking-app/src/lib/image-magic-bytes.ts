// =============================================================================
// image-magic-bytes.ts
//
// Server-side magic-byte validation for uploaded images (audit #28). Before
// this, the upload endpoints (avatar, client logo, client favicon) trusted
// the `Content-Type` declared by the browser — trivially spoofable by anyone
// crafting a custom POST. An attacker could upload an HTML file labelled
// image/png and have it served back from /storage with a Content-Type that
// makes the browser execute it.
//
// This helper sniffs the first ~16 bytes of the buffer and confirms the
// declared MIME matches what's actually there. Hand-rolled to avoid pulling
// in the ~50 KB `file-type` library for the five formats we accept.
//
// Returns { ok: true } if the buffer's magic bytes match the claimed type,
// or { ok: false, detected } with a human-readable detection result.
// =============================================================================

export type ValidatedImageMime =
  | "image/png"
  | "image/jpeg"
  | "image/webp"
  | "image/svg+xml"
  | "image/x-icon"
  | "image/vnd.microsoft.icon"

interface ValidationOk {
  ok: true
}

interface ValidationFail {
  ok: false
  /** Best-guess label for what was actually found, for the error message. */
  detected: string
}

export type ValidationResult = ValidationOk | ValidationFail

// Each detector returns true if the buffer's prefix matches the format's
// signature. Kept side-by-side so the contract for each format is obvious.

function isPng(buf: Uint8Array): boolean {
  // 89 50 4E 47 0D 0A 1A 0A
  return (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  )
}

function isJpeg(buf: Uint8Array): boolean {
  // FF D8 FF — start-of-image marker. All real JPEGs begin with this.
  return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff
}

function isWebp(buf: Uint8Array): boolean {
  // "RIFF" .... "WEBP" (4-byte size in between)
  if (buf.length < 12) return false
  return (
    buf[0] === 0x52 && // R
    buf[1] === 0x49 && // I
    buf[2] === 0x46 && // F
    buf[3] === 0x46 && // F
    buf[8] === 0x57 && // W
    buf[9] === 0x45 && // E
    buf[10] === 0x42 && // B
    buf[11] === 0x50 //  P
  )
}

function isIco(buf: Uint8Array): boolean {
  // 00 00 01 00 — ICO header. Cursor files (00 00 02 00) deliberately rejected.
  return (
    buf.length >= 4 &&
    buf[0] === 0x00 &&
    buf[1] === 0x00 &&
    buf[2] === 0x01 &&
    buf[3] === 0x00
  )
}

function isSvg(buf: Uint8Array): boolean {
  // SVG is text — sniff for either an XML declaration or the `<svg` tag.
  // Strip optional UTF-8 BOM (EF BB BF) before decoding.
  let start = 0
  if (
    buf.length >= 3 &&
    buf[0] === 0xef &&
    buf[1] === 0xbb &&
    buf[2] === 0xbf
  ) {
    start = 3
  }
  // Decode just the first 256 bytes — enough for any reasonable header
  // including comments / DOCTYPE / xmlns declarations.
  const head = new TextDecoder("utf-8", { fatal: false })
    .decode(buf.subarray(start, Math.min(buf.length, start + 256)))
    .trimStart()
    .toLowerCase()
  // Either `<?xml` ... `<svg` OR `<svg` directly. We don't try to be
  // exhaustive — Supabase Storage serves SVGs as Content-Type the upload
  // declared, so the worst case for a near-miss is a 415 here.
  return head.startsWith("<?xml") || head.startsWith("<svg")
}

/** Friendly label for whatever the buffer actually contains. */
function detectFormatLabel(buf: Uint8Array): string {
  if (isPng(buf)) return "PNG"
  if (isJpeg(buf)) return "JPEG"
  if (isWebp(buf)) return "WebP"
  if (isIco(buf)) return "ICO"
  if (isSvg(buf)) return "SVG"
  // Common non-image signatures we want to spot for the error message.
  if (
    buf.length >= 4 &&
    buf[0] === 0x47 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x38
  ) {
    return "GIF (not allowed)"
  }
  if (buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) {
    return "PDF (not allowed)"
  }
  if (buf.length >= 2 && buf[0] === 0x4d && buf[1] === 0x5a) {
    return "Windows executable (not allowed)"
  }
  return "unrecognised binary"
}

/**
 * Confirm the buffer's magic bytes are consistent with the declared MIME.
 * Throws nothing — returns a discriminated result for the caller to map
 * to a 400 / 415 response.
 */
export function validateImageMagicBytes(
  buffer: Uint8Array,
  claimedMime: string
): ValidationResult {
  let matches = false
  switch (claimedMime) {
    case "image/png":
      matches = isPng(buffer)
      break
    case "image/jpeg":
      matches = isJpeg(buffer)
      break
    case "image/webp":
      matches = isWebp(buffer)
      break
    case "image/svg+xml":
      matches = isSvg(buffer)
      break
    case "image/x-icon":
    case "image/vnd.microsoft.icon":
      matches = isIco(buffer)
      break
    default:
      // Unknown MIME — caller should have rejected by allowlist already, but
      // fail closed if it slipped through.
      return { ok: false, detected: detectFormatLabel(buffer) }
  }

  if (matches) return { ok: true }
  return { ok: false, detected: detectFormatLabel(buffer) }
}
