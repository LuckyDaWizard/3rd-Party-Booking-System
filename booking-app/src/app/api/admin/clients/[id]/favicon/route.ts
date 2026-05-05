import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireSystemAdminWithCaller } from "@/lib/api-auth"
import { writeAuditLog, getCallerIp } from "@/lib/audit-log"

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
    return NextResponse.json({ error: "Missing client id" }, { status: 400 })
  }

  const form = await request.formData().catch(() => null)
  const file = form?.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing 'file' field" }, { status: 400 })
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large (${file.size} bytes). Max is ${MAX_BYTES}.` },
      { status: 413 }
    )
  }

  const ext = ALLOWED_MIME[file.type]
  if (!ext) {
    return NextResponse.json(
      { error: `Unsupported file type: ${file.type}. Allowed: PNG, JPEG, WEBP, SVG, ICO.` },
      { status: 400 }
    )
  }

  let admin
  try {
    admin = getSupabaseAdmin()
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server misconfigured" },
      { status: 500 }
    )
  }

  const { data: clientRow, error: loadErr } = await admin
    .from("clients")
    .select("client_name, favicon_url")
    .eq("id", id)
    .single()
  if (loadErr || !clientRow) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 })
  }

  const objectKey = `${id}/favicon.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadErr } = await admin.storage
    .from("client-logos")
    .upload(objectKey, buffer, {
      contentType: file.type,
      upsert: true,
      cacheControl: "60",
    })

  if (uploadErr) {
    return NextResponse.json(
      { error: `Upload failed: ${uploadErr.message}` },
      { status: 500 }
    )
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
    return NextResponse.json(
      { error: `Failed to set favicon URL: ${dbErr.message}` },
      { status: 500 }
    )
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
    return NextResponse.json({ error: "Missing client id" }, { status: 400 })
  }

  let admin
  try {
    admin = getSupabaseAdmin()
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server misconfigured" },
      { status: 500 }
    )
  }

  const { data: clientRow, error: loadErr } = await admin
    .from("clients")
    .select("client_name, favicon_url")
    .eq("id", id)
    .single()
  if (loadErr || !clientRow) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 })
  }

  await admin.storage
    .from("client-logos")
    .remove(Object.values(ALLOWED_MIME).map((ext) => `${id}/favicon.${ext}`))

  const { error: dbErr } = await admin
    .from("clients")
    .update({ favicon_url: null })
    .eq("id", id)

  if (dbErr) {
    return NextResponse.json({ error: dbErr.message }, { status: 500 })
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
