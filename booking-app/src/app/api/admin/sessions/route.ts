import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireSystemAdmin } from "@/lib/api-auth"

// =============================================================================
// GET /api/admin/sessions
//
// List all active sessions for the security dashboard. Joins the
// public.active_sessions view (migration 012) with public.users so the
// frontend can show who the session belongs to.
//
// Response:
//   {
//     data: Array<{
//       id: string
//       userId: string | null
//       userName: string | null
//       userEmail: string | null
//       userRole: string | null
//       createdAt: string
//       updatedAt: string
//       userAgent: string | null
//       ipAddress: string | null
//     }>
//     summary: { totalSessions: number, uniqueUsers: number }
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
}

interface UserLookup {
  auth_user_id: string | null
  first_names: string
  surname: string
  email: string
  role: string
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

  // Pull active sessions.
  const { data: sessionsData, error: sessionsErr } = await admin
    .from("active_sessions")
    .select("id, user_id, created_at, updated_at, user_agent, ip")
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
    }
  })

  const uniqueUsers = new Set(sessions.map((s) => s.user_id).filter(Boolean)).size

  return NextResponse.json({
    data: entries,
    summary: {
      totalSessions: entries.length,
      uniqueUsers,
    },
  })
}
