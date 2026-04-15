import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireSystemAdminWithCaller } from "@/lib/api-auth"
import { writeAuditLog, getCallerIp } from "@/lib/audit-log"

// =============================================================================
// POST /api/admin/sessions/revoke
//
// Force-revoke a single Supabase Auth session. Deletes the row from
// auth.sessions via the public.revoke_session() RPC (migration 012).
//
// Body: { sessionId: string }
//
// Behaviour:
//   - Target user's refresh token is invalidated immediately.
//   - Their currently-issued access token remains valid until it expires
//     (~60 min default — configurable in Supabase Auth settings).
//   - On their next API call after the access token expires (or their next
//     page reload / refresh), they're signed out.
//
// Audit: every revocation is logged with actor, target user, and IP.
//
// Auth: system_admin only.
// =============================================================================

interface Body {
  sessionId?: string
}

export async function POST(request: Request) {
  const { caller, denied } = await requireSystemAdminWithCaller()
  if (denied) return denied

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const sessionId = body.sessionId?.trim()
  if (!sessionId || !/^[0-9a-f-]{36}$/i.test(sessionId)) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 })
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

  // Look up the session + user for the audit log BEFORE deleting.
  const { data: session } = await admin
    .from("active_sessions")
    .select("id, user_id, user_agent, ip")
    .eq("id", sessionId)
    .single()

  let targetUser: {
    id: string
    first_names: string
    surname: string
    email: string
  } | null = null

  if (session?.user_id) {
    const { data: userRow } = await admin
      .from("users")
      .select("id, first_names, surname, email")
      .eq("auth_user_id", session.user_id)
      .single()
    targetUser = userRow
  }

  // Call the revoke_session RPC which deletes the row from auth.sessions.
  const { data: revoked, error: rpcErr } = await admin.rpc("revoke_session", {
    session_id: sessionId,
  })

  if (rpcErr) {
    return NextResponse.json(
      { error: `Failed to revoke session: ${rpcErr.message}` },
      { status: 500 }
    )
  }

  if (!revoked) {
    return NextResponse.json(
      { error: "Session not found or already revoked" },
      { status: 404 }
    )
  }

  // Audit log.
  const targetName = targetUser
    ? `${targetUser.first_names} ${targetUser.surname}`.trim()
    : "Unknown user"

  writeAuditLog({
    actorId: caller.id,
    actorName: caller.name,
    actorRole: caller.role,
    action: "update",
    entityType: "user",
    entityId: targetUser?.id ?? sessionId,
    entityName: `Session revoked for ${targetName}`,
    changes: {
      "Session": { old: "Active", new: "Revoked" },
      "IP": { old: session?.ip ?? "unknown", new: null },
    },
    ipAddress: getCallerIp(request),
  })

  return NextResponse.json({ ok: true })
}
