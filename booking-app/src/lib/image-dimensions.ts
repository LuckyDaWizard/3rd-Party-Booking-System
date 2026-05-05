// =============================================================================
// image-dimensions.ts
//
// Tiny client-side helper for reading the pixel dimensions of an image File
// before upload, so the UI can reject obviously-too-small uploads (a 16x16
// "logo" would scale up disgustingly in the sidebar).
//
// Uses the browser's built-in Image decoder via an object URL — no
// dependencies, no server round-trip. SVGs report `naturalWidth = 0` /
// `naturalHeight = 0` because they're vector — we treat that as "unknown,
// allow" since SVGs scale infinitely and never look pixelated.
//
// On any decode failure we resolve to null instead of throwing so callers
// can decide whether to reject the upload or let the server's MIME check
// handle it. The browser would have already validated the MIME via the
// <input accept=...> filter, so a decode failure here is rare.
// =============================================================================

export interface ImageDimensions {
  width: number
  height: number
}

/** Read pixel dimensions of an image File, or null if it can't be decoded. */
export async function readImageDimensions(file: File): Promise<ImageDimensions | null> {
  // SVG: vector — no pixel dimensions to enforce.
  if (file.type === "image/svg+xml") return null
  // ICO: browsers often can't decode via <img>; skip pixel check.
  if (file.type === "image/x-icon" || file.type === "image/vnd.microsoft.icon") return null

  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new window.Image()
    img.onload = () => {
      const w = img.naturalWidth || 0
      const h = img.naturalHeight || 0
      URL.revokeObjectURL(url)
      if (w === 0 || h === 0) {
        resolve(null)
      } else {
        resolve({ width: w, height: h })
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    img.src = url
  })
}

/**
 * Validates that an image meets minimum-dimension requirements. Returns an
 * error message to show the user, or null if the image is acceptable.
 *
 * Vector formats (SVG) and formats we can't decode in-browser (ICO) are
 * always allowed — caller can rely on the server's MIME + size check for
 * those.
 */
export async function validateImageMinDimensions(
  file: File,
  minWidth: number,
  minHeight: number
): Promise<string | null> {
  const dims = await readImageDimensions(file)
  if (!dims) return null // SVG / ICO / undecodable — allow
  if (dims.width < minWidth || dims.height < minHeight) {
    return `Image is ${dims.width}×${dims.height} px. Minimum is ${minWidth}×${minHeight} px.`
  }
  return null
}
