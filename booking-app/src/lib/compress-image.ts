// =============================================================================
// compress-image.ts
//
// Client-side image downscale + re-encode, run BEFORE an upload leaves the
// browser. We can't optimise server-side — the Alpine runner image has no
// sharp/libvips and `images.unoptimized` is on — so a raw 3 MB phone photo
// would otherwise be stored as-is and served at full size on every page load.
// Shrinking it here cuts the upload, the stored object, and the bytes every
// future visitor downloads.
//
// Browser-only: uses createImageBitmap + <canvas>. Call from client
// components only.
//
// EXIF orientation: createImageBitmap(file, { imageOrientation: "from-image" })
// bakes the EXIF rotation into the pixels, so portrait phone photos don't come
// out sideways once drawn to the canvas. If a browser doesn't support that
// option we retry without it (compression still happens; only the rotation
// fix is lost), and if decoding fails entirely we upload the original.
// =============================================================================

export interface CompressOptions {
  /** Longest edge, in px. The image is scaled down to fit; never scaled up. */
  maxDimension?: number
  /** Lossy quality 0..1 for JPEG/WebP output. Ignored for PNG (lossless). */
  quality?: number
}

const RE_ENCODABLE = new Set(["image/jpeg", "image/png", "image/webp"])

export async function compressImage(
  file: File,
  opts: CompressOptions = {}
): Promise<File> {
  const maxDimension = opts.maxDimension ?? 1024
  const quality = opts.quality ?? 0.82

  // Only touch raster types we can faithfully re-encode. Anything else
  // (SVG, GIF, etc.) passes through untouched — a vector has no pixels to
  // resample and animation would be flattened.
  if (!RE_ENCODABLE.has(file.type)) return file
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") {
    return file
  }

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })
  } catch {
    try {
      bitmap = await createImageBitmap(file)
    } catch {
      return file // decode failed — let the server deal with the original
    }
  }

  const { width, height } = bitmap
  const scale = Math.min(1, maxDimension / Math.max(width, height))
  const needsResize = scale < 1
  const targetW = Math.max(1, Math.round(width * scale))
  const targetH = Math.max(1, Math.round(height * scale))

  const canvas = document.createElement("canvas")
  canvas.width = targetW
  canvas.height = targetH
  const ctx = canvas.getContext("2d")
  if (!ctx) {
    bitmap.close?.()
    return file
  }
  ctx.drawImage(bitmap, 0, 0, targetW, targetH)
  bitmap.close?.()

  // Keep PNG as PNG so transparency (logos / favicons) survives; everything
  // else re-encodes to its own lossy type at `quality`.
  const isPng = file.type === "image/png"
  const outType = file.type

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, outType, isPng ? undefined : quality)
  )
  if (!blob) return file

  // If we didn't need to resize and the re-encode came out no smaller, the
  // original was already well-optimised — keep it rather than bloat it.
  if (!needsResize && blob.size >= file.size) return file

  const ext = isPng ? "png" : file.type === "image/webp" ? "webp" : "jpg"
  const baseName = file.name.replace(/\.[^.]+$/, "") || "image"
  return new File([blob], `${baseName}.${ext}`, {
    type: outType,
    lastModified: Date.now(),
  })
}
