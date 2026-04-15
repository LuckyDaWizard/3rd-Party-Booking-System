import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireSystemAdmin } from "@/lib/api-auth"

// =============================================================================
// GET /api/admin/sessions
//
// Lists all tracked sessions with a classified status: active / idle / ended.
// Reads from public.active_sessions view (migration 014) which now includes
// not_after (refresh token expiry).
//
// Status classification:
//   - active:  updated_at within last 30 minutes
//   - idle:    updated_at 30 min to 24 hours ago AND not_after still in future
//   - ended:   updated_at > 24 hours ago OR not_after is in the past
//
// Response:
//   {
//     data: Array<{
//       id, userId, userName, userEmail, userRole, createdAt, updatedAt,
//       userAgent, ipAddress, notAfter, status: "active" | "idle" | "ended"
//     }>
//     summary: { active, idle, ended, uniqueUsers }
//   }
//
// Auth: system_admin only.
// =============================================================================

interface SessionRow {
  id: string
  user_id: string | null
  created_at: string
  updated_at: string
  user_agent: string | null
  ip: string | null
  not_after: string | null
}

interface UserLookup {
  auth_user_id: string | null
  first_names: string
  surname: string
  email: string
  role: string
}

type SessionStatus = "active" | "idle" | "ended"

const ACTIVE_WINDOW_MS = 30 * 60 * 1000         // 30 minutes
const IDLE_WINDOW_MS = 24 * 60 * 60 * 1000      // 24 hours

function classifySession(updatedAt: string, notAfter: string | null): SessionStatus {
  const now = Date.now()
  const updated = new Date(updatedAt).getTime()

  // Refresh token expired — definitively ended.
  if (notAfter && new Date(notAfter).getTime() < now) {
    return "ended"
  }

  const idleMs = now - updated
  if (idleMs < ACTIVE_WINDOW_MS) return "active"
  if (idleMs < IDLE_WINDOW_MS) return "idle"
  return "ended"
}

export async function GET() {
  const denied = await requireSystemAdmin()
  if (denied) return denied

  let admin
  try {
    admin = getSupabaseAdmin()
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server misconfigured" },
      { status: 500 }
    )
  }

  const { data: sessionsData, error: sessionsErr } = await admin
    .from("active_sessions")
    .select("id, user_id, created_at, updated_at, user_agent, ip, not_after")
    .order("updated_at", { ascending: false })
    .limit(500)

  if (sessionsErr) {
    return NextResponse.json({ error: sessionsErr.message }, { status: 500 })
  }

  const sessions = (sessionsData ?? []) as SessionRow[]

  // Join with public.users for display info.
  const authUserIds = Array.from(
    new Set(sessions.map((s) => s.user_id).filter((x): x is string => !!x))
  )

  const userByAuthId = new Map<string, UserLookup>()
  if (authUserIds.length > 0) {
    const { data: userRows } = await admin
      .from("users")
      .select("auth_user_id, first_names, surname, email, role")
      .in("auth_user_id", authUserIds)

    for (const u of (userRows ?? []) as UserLookup[]) {
      if (u.auth_user_id) userByAuthId.set(u.auth_user_id, u)
    }
  }

  const entries = sessions.map((s) => {
    const user = s.user_id ? userByAuthId.get(s.user_id) : undefined
    const status = classifySession(s.updated_at, s.not_after)
    return {
      id: s.id,
      userId: s.user_id,
      userName: user ? `${user.first_names} ${user.surname}`.trim() : null,
      userEmail: user?.email ?? null,
      userRole: user?.role ?? null,
      createdAt: s.created_at,
      updatedAt: s.updated_at,
      userAgent: s.user_agent,
      ipAddress: s.ip,
      notAfter: s.not_after,
      status,
    }
  })

  // Count by status for summary cards.
  let active = 0
  let idle = 0
  let ended = 0
  const activeUsers = new Set<string>()

  for (const e of entries) {
    if (e.status === "active") {
      active += 1
      if (e.userId) activeUsers.add(e.userId)
    } else if (e.status === "idle") {
      idle += 1
    } else {
      ended += 1
    }
  }

  return NextResponse.json({
    data: entries,
    summary: {
      active,
      idle,
      ended,
      uniqueActiveUsers: activeUsers.size,
    },
  })
}
