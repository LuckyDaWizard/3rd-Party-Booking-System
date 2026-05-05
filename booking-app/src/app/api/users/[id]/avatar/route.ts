import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireAuthenticated } from "@/lib/api-auth"
import { writeAuditLog, getCallerIp } from "@/lib/audit-log"

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
    return NextResponse.json({ error: "Missing user id" }, { status: 400 })
  }

  // Permission check: self OR system_admin only.
  if (caller.id !== id && caller.role !== "system_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
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
      { error: `Unsupported file type: ${file.type}. Allowed: PNG, JPEG, WEBP.` },
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

  // Confirm the target exists. (Self-update will always pass; admin-update
  // should still 404 cleanly if id is bogus.)
  const { data: targetRow, error: loadErr } = await admin
    .from("users")
    .select("first_names, surname, avatar_url")
    .eq("id", id)
    .single()
  if (loadErr || !targetRow) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  const objectKey = `${id}/avatar.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadErr } = await admin.storage
    .from("user-avatars")
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
    return NextResponse.json(
      { error: `Failed to set avatar URL: ${dbErr.message}` },
      { status: 500 }
    )
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
    return NextResponse.json({ error: "Missing user id" }, { status: 400 })
  }

  if (caller.id !== id && caller.role !== "system_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
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

  const { data: targetRow, error: loadErr } = await admin
    .from("users")
    .select("first_names, surname, avatar_url")
    .eq("id", id)
    .single()
  if (loadErr || !targetRow) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
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
    return NextResponse.json({ error: dbErr.message }, { status: 500 })
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
