import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireAuthenticated } from "@/lib/api-auth"
import { writeAuditLog, getCallerIp } from "@/lib/audit-log"
import { apiError } from "@/lib/api-response"
import { validateImageMagicBytes } from "@/lib/image-magic-bytes"

// =============================================================================
// POST   /api/users/[id]/avatar — upload (or replace) a user's profile image
// DELETE /api/users/[id]/avatar — remove the user's profile image
//
// Permissions:
//   - The user themselves (caller.id === [id]) — manage your own avatar
//   - system_admin — manage anyone's avatar (support / onboarding override)
//   - All other roles get 403, even unit_manager managing their staff. The
//     intent is "self-service or admin-curated", not unit-manager-curated.
//
// Storage:
//   user-avatars/<userId>/avatar.<ext>
//   The folder layout means uploads always overwrite the previous file, so
//   we don't accumulate orphaned objects. Public-read so the URL works in
//   <img> tags directly.
//
// Audit: every change is logged with actor, target user, and IP. Self-uploads
// are still logged so we have a record if a user uploads inappropriate content.
// =============================================================================

interface RouteContext {
  params: Promise<{ id: string }>
}

const MAX_BYTES = 2 * 1024 * 1024
const ALLOWED_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
}

export async function POST(request: Request, context: RouteContext) {
  const { caller, denied } = await requireAuthenticated()
  if (denied) return denied

  const { id } = await context.params
  if (!id) {
    return apiError("Missing user id", 400)
  }

  // Permission check: self OR system_admin only.
  if (caller.id !== id && caller.role !== "system_admin") {
    return apiError("Forbidden", 403)
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
    return apiError(`Unsupported file type: ${file.type}. Allowed: PNG, JPEG, WEBP.`, 400)
  }

  let admin
  try {
    admin = getSupabaseAdmin()
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Server misconfigured", 500)
  }

  // Confirm the target exists. (Self-update will always pass; admin-update
  // should still 404 cleanly if id is bogus.)
  const { data: targetRow, error: loadErr } = await admin
    .from("users")
    .select("first_names, surname, avatar_url")
    .eq("id", id)
    .single()
  if (loadErr || !targetRow) {
    return apiError("User not found", 404)
  }

  const objectKey = `${id}/avatar.${ext}`
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
    .from("user-avatars")
    .upload(objectKey, buffer, {
      contentType: file.type,
      upsert: true,
      cacheControl: "60",
    })

  if (uploadErr) {
    return apiError(`Upload failed: ${uploadErr.message}`, 500)
  }

  const { data: publicUrlData } = admin.storage
    .from("user-avatars")
    .getPublicUrl(objectKey)
  // Cache-bust so a freshly uploaded image replaces the old one in <img>
  // tags immediately, even if a CDN holds the previous version.
  const publicUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`

  const { error: dbErr } = await admin
    .from("users")
    .update({ avatar_url: publicUrl })
    .eq("id", id)

  if (dbErr) {
    return apiError(`Failed to set avatar URL: ${dbErr.message}`, 500)
  }

  const targetName = `${targetRow.first_names} ${targetRow.surname}`.trim()
  writeAuditLog({
    actorId: caller.id,
    actorName: caller.name,
    actorRole: caller.role,
    action: "update",
    entityType: "user",
    entityId: id,
    entityName: targetName,
    changes: {
      Avatar: { old: targetRow.avatar_url ?? null, new: publicUrl },
    },
    ipAddress: getCallerIp(request),
  })

  return NextResponse.json({ ok: true, avatarUrl: publicUrl })
}

export async function DELETE(request: Request, context: RouteContext) {
  const { caller, denied } = await requireAuthenticated()
  if (denied) return denied

  const { id } = await context.params
  if (!id) {
    return apiError("Missing user id", 400)
  }

  if (caller.id !== id && caller.role !== "system_admin") {
    return apiError("Forbidden", 403)
  }

  let admin
  try {
    admin = getSupabaseAdmin()
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Server misconfigured", 500)
  }

  const { data: targetRow, error: loadErr } = await admin
    .from("users")
    .select("first_names, surname, avatar_url")
    .eq("id", id)
    .single()
  if (loadErr || !targetRow) {
    return apiError("User not found", 404)
  }

  // Best-effort: remove every allowed extension under this user's folder.
  await admin.storage
    .from("user-avatars")
    .remove(Object.values(ALLOWED_MIME).map((ext) => `${id}/avatar.${ext}`))

  const { error: dbErr } = await admin
    .from("users")
    .update({ avatar_url: null })
    .eq("id", id)

  if (dbErr) {
    return apiError(dbErr.message, 500)
  }

  const targetName = `${targetRow.first_names} ${targetRow.surname}`.trim()
  writeAuditLog({
    actorId: caller.id,
    actorName: caller.name,
    actorRole: caller.role,
    action: "update",
    entityType: "user",
    entityId: id,
    entityName: targetName,
    changes: {
      Avatar: { old: targetRow.avatar_url ?? null, new: null },
    },
    ipAddress: getCallerIp(request),
  })

  return NextResponse.json({ ok: true })
}
