import { NextResponse } from "next/server"
import { getSupabaseAdmin, pinToEmail } from "@/lib/supabase-admin"
import { requireSystemAdmin } from "@/lib/api-auth"

// =============================================================================
// GET /api/admin/signin-history
//
// Returns a chronological log of SUCCESSFUL sign-ins, resolved from PIN to
// user info via the synthetic email scheme. Used by the "Sign-in History"
// tab on /security for compliance / incident-response visibility.
//
// Query params (all optional):
//   window — "24h" | "7d" | "30d" | "all" (default "7d")
//   search — text search on user name (case-insensitive, sanitised)
//   page, pageSize — pagination (default 25/page, max 200)
//
// Response:
//   {
//     data: Array<{
//       id: string
//       attemptedAt: string
//       userName: string | null
//       userEmail: string | null
//       userRole: string | null
//       ipAddress: string | null
//     }>
//     total: number
//     page: number
//     pageSize: number
//     summary: {
//       last24h: number
//       last7d: number
//       uniqueUsers24h: number
//     }
//   }
//
// Auth: system_admin only.
// =============================================================================

interface AttemptRow {
  id: string
  pin: string
  attempted_at: string
  succeeded: boolean
  ip_address: string | null
}

interface UserLookup {
  auth_user_id: string | null
  first_names: string
  surname: string
  email: string
  role: string
}

const WINDOWS = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  all: null,
} as const

type WindowKey = keyof typeof WINDOWS

function isWindowKey(v: string | null): v is WindowKey {
  return v === "24h" || v === "7d" || v === "30d" || v === "all"
}

export async function GET(request: Request) {
  const denied = await requireSystemAdmin()
  if (denied) return denied

  const url = new URL(request.url)
  const windowRaw = url.searchParams.get("window")
  const windowKey: WindowKey = isWindowKey(windowRaw) ? windowRaw : "7d"
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10))
  const pageSize = Math.min(
    200,
    Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "25", 10))
  )

  // Sanitise search input (same pattern as audit-log).
  const searchRaw = url.searchParams.get("search")
  let search: string | null = null
  if (searchRaw) {
    const cleaned = searchRaw
      .replace(/[,()%_*.]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60)
    if (cleaned.length > 0) search = cleaned.toLowerCase()
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

  // Build the base query: successful attempts only, newest first.
  let query = admin
    .from("auth_attempts")
    .select("id, pin, attempted_at, succeeded, ip_address")
    .eq("succeeded", true)
    .order("attempted_at", { ascending: false })

  const windowMs = WINDOWS[windowKey]
  if (windowMs !== null) {
    const since = new Date(Date.now() - windowMs).toISOString()
    query = query.gte("attempted_at", since)
  }

  // We can't filter by user name at the DB layer because PIN → user
  // resolution happens app-side. Fetch up to a reasonable cap and filter
  // in memory (search term length is capped, so this is bounded).
  const { data: attemptsData, error: attemptsErr } = await query.limit(2000)

  if (attemptsErr) {
    return NextResponse.json({ error: attemptsErr.message }, { status: 500 })
  }

  const attempts = (attemptsData ?? []) as AttemptRow[]

  // Resolve unique PINs → user info via synthetic email.
  const uniquePins = Array.from(new Set(attempts.map((a) => a.pin)))
  const userByPin = new Map<string, UserLookup>()

  if (uniquePins.length > 0) {
    const { data: authList } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    })
    const emailToAuthId = new Map<string, string>()
    for (const u of authList?.users ?? []) {
      if (u.email) emailToAuthId.set(u.email, u.id)
    }

    const pinToAuthId = new Map<string, string>()
    for (const pin of uniquePins) {
      const authId = emailToAuthId.get(pinToEmail(pin))
      if (authId) pinToAuthId.set(pin, authId)
    }

    const authIds = Array.from(pinToAuthId.values())
    if (authIds.length > 0) {
      const { data: userRows } = await admin
        .from("users")
        .select("auth_user_id, first_names, surname, email, role")
        .in("auth_user_id", authIds)

      const byAuthId = new Map<string, UserLookup>()
      for (const u of (userRows ?? []) as UserLookup[]) {
        if (u.auth_user_id) byAuthId.set(u.auth_user_id, u)
      }

      for (const [pin, authId] of pinToAuthId.entries()) {
        const user = byAuthId.get(authId)
        if (user) userByPin.set(pin, user)
      }
    }
  }

  // Transform + filter by search term.
  const allRows = attempts.map((a) => {
    const user = userByPin.get(a.pin)
    const userName = user ? `${user.first_names} ${user.surname}`.trim() : null
    return {
      id: a.id,
      attemptedAt: a.attempted_at,
      userName,
      userEmail: user?.email ?? null,
      userRole: user?.role ?? null,
      ipAddress: a.ip_address,
    }
  })

  const filtered = search
    ? allRows.filter(
        (r) =>
          (r.userName && r.userName.toLowerCase().includes(search)) ||
          (r.userEmail && r.userEmail.toLowerCase().includes(search))
      )
    : allRows

  // Paginate.
  const total = filtered.length
  const from = (page - 1) * pageSize
  const to = from + pageSize
  const pagedRows = filtered.slice(from, to)

  // Summary stats — computed from the FULL window, not the filtered slice.
  const now = Date.now()
  const last24hMs = 24 * 60 * 60 * 1000
  const last7dMs = 7 * 24 * 60 * 60 * 1000

  const last24hRows = allRows.filter(
    (r) => new Date(r.attemptedAt).getTime() >= now - last24hMs
  )
  const last7dCount = allRows.filter(
    (r) => new Date(r.attemptedAt).getTime() >= now - last7dMs
  ).length

  const uniqueUsers24h = new Set(
    last24hRows.map((r) => r.userName).filter(Boolean)
  ).size

  return NextResponse.json({
    data: pagedRows,
    total,
    page,
    pageSize,
    summary: {
      last24h: last24hRows.length,
      last7d: last7dCount,
      uniqueUsers24h,
    },
  })
}
