import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireSystemAdminWithCaller } from "@/lib/api-auth"
import { writeAuditLog, getCallerIp } from "@/lib/audit-log"
import { apiError } from "@/lib/api-response"
import { validateImageMagicBytes } from "@/lib/image-magic-bytes"

// =============================================================================
// POST   /api/admin/clients/[id]/favicon — upload (or replace) the favicon
// DELETE /api/admin/clients/[id]/favicon — remove the favicon
//
// Mirrors the logo route — same bucket, just stored under
//   client-logos/<clientId>/favicon.<ext>
//
// Auth: system_admin only.
// =============================================================================

interface RouteContext {
  params: Promise<{ id: string }>
}

const MAX_BYTES = 2 * 1024 * 1024
const ALLOWED_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
}

export async function POST(request: Request, context: RouteContext) {
  const { caller, denied } = await requireSystemAdminWithCaller()
  if (denied) return denied

  const { id } = await context.params
  if (!id) {
    return apiError("Missing client id", 400)
  }

  const form = await request.formData().catch(() => null)
  const file = form?.get("file")
  if (!(file instanceof File)) {
    return apiError("Missing 'file' field", 400)
  }

  if (file.size > MAX_BYTES) {
    return apiError(`File too large (${file.size} bytes). Max is ${MAX_BYTES}.`, 413)
  }

  const ext = ALLOWED_MIME[file.type]
  if (!ext) {
    return apiError(`Unsupported file type: ${file.type}. Allowed: PNG, JPEG, WEBP, SVG, ICO.`, 400)
  }

  let admin
  try {
    admin = getSupabaseAdmin()
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Server misconfigured", 500)
  }

  const { data: clientRow, error: loadErr } = await admin
    .from("clients")
    .select("client_name, favicon_url")
    .eq("id", id)
    .single()
  if (loadErr || !clientRow) {
    return apiError("Client not found", 404)
  }

  const objectKey = `${id}/favicon.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  // Magic-byte verification (audit #28).
  const magic = validateImageMagicBytes(buffer, file.type)
  if (!magic.ok) {
    return apiError(
      `File contents don't match declared type "${file.type}" — detected ${magic.detected}.`,
      400
    )
  }

  const { error: uploadErr } = await admin.storage
    .from("client-logos")
    .upload(objectKey, buffer, {
      contentType: file.type,
      upsert: true,
      cacheControl: "60",
    })

  if (uploadErr) {
    return apiError(`Upload failed: ${uploadErr.message}`, 500)
  }

  const { data: publicUrlData } = admin.storage
    .from("client-logos")
    .getPublicUrl(objectKey)
  const publicUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`

  const { error: dbErr } = await admin
    .from("clients")
    .update({ favicon_url: publicUrl })
    .eq("id", id)

  if (dbErr) {
    return apiError(`Failed to set favicon URL: ${dbErr.message}`, 500)
  }

  writeAuditLog({
    actorId: caller.id,
    actorName: caller.name,
    actorRole: caller.role,
    action: "update",
    entityType: "client",
    entityId: id,
    entityName: clientRow.client_name,
    changes: {
      Favicon: { old: clientRow.favicon_url ?? null, new: publicUrl },
    },
    ipAddress: getCallerIp(request),
  })

  return NextResponse.json({ ok: true, faviconUrl: publicUrl })
}

export async function DELETE(request: Request, context: RouteContext) {
  const { caller, denied } = await requireSystemAdminWithCaller()
  if (denied) return denied

  const { id } = await context.params
  if (!id) {
    return apiError("Missing client id", 400)
  }

  let admin
  try {
    admin = getSupabaseAdmin()
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Server misconfigured", 500)
  }

  const { data: clientRow, error: loadErr } = await admin
    .from("clients")
    .select("client_name, favicon_url")
    .eq("id", id)
    .single()
  if (loadErr || !clientRow) {
    return apiError("Client not found", 404)
  }

  await admin.storage
    .from("client-logos")
    .remove(Object.values(ALLOWED_MIME).map((ext) => `${id}/favicon.${ext}`))

  const { error: dbErr } = await admin
    .from("clients")
    .update({ favicon_url: null })
    .eq("id", id)

  if (dbErr) {
    return apiError(dbErr.message, 500)
  }

  writeAuditLog({
    actorId: caller.id,
    actorName: caller.name,
    actorRole: caller.role,
    action: "update",
    entityType: "client",
    entityId: id,
    entityName: clientRow.client_name,
    changes: {
      Favicon: { old: clientRow.favicon_url ?? null, new: null },
    },
    ipAddress: getCallerIp(request),
  })

  return NextResponse.json({ ok: true })
}
