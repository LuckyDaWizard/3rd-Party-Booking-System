import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireSystemAdminWithCaller } from "@/lib/api-auth"
import { writeAuditLog, getCallerIp } from "@/lib/audit-log"

// =============================================================================
// GET /api/admin/trusted-ips — list all trusted IPs
// POST /api/admin/trusted-ips — add a new trusted IP
// DELETE /api/admin/trusted-ips?id=... — remove a trusted IP
//
// Trusted IPs are exempt from rapid-probing and password-spraying flags on
// the Suspicious Activity tab. Used for dev machines, office networks, etc.
//
// All actions are audit-logged.
//
// Auth: system_admin only.
// =============================================================================

interface CreateBody {
  ipAddress?: string
  label?: string
}

// Basic IPv4/IPv6 validation. We're permissive (any non-empty reasonable
// string passes) since this list is managed by a small number of admins.
function isValidIp(ip: string): boolean {
  if (!ip || ip.length < 3 || ip.length > 45) return false
  // Roughly validate IPv4 "a.b.c.d" OR any string containing a colon (IPv6)
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/
  if (ipv4.test(ip)) {
    return ip.split(".").every((o) => parseInt(o, 10) <= 255)
  }
  return /:/.test(ip) // crude IPv6 check — good enough
}

export async function GET() {
  const { caller, denied } = await requireSystemAdminWithCaller()
  if (denied) return denied
  void caller

  let admin
  try {
    admin = getSupabaseAdmin()
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server misconfigured" },
      { status: 500 }
    )
  }

  const { data, error } = await admin
    .from("trusted_ips")
    .select("id, ip_address, label, created_at, created_by")
    .order("created_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Look up creator names.
  const creatorIds = Array.from(
    new Set((data ?? []).map((r: { created_by: string }) => r.created_by))
  )
  const creators = new Map<string, string>()
  if (creatorIds.length > 0) {
    const { data: userRows } = await admin
      .from("users")
      .select("id, first_names, surname")
      .in("id", creatorIds)
    for (const u of (userRows ?? []) as {
      id: string
      first_names: string
      surname: string
    }[]) {
      creators.set(u.id, `${u.first_names} ${u.surname}`.trim())
    }
  }

  return NextResponse.json({
    data: (data ?? []).map((row) => ({
      id: row.id,
      ipAddress: row.ip_address,
      label: row.label,
      createdAt: row.created_at,
      createdByName: creators.get(row.created_by) ?? null,
    })),
  })
}

export async function POST(request: Request) {
  const { caller, denied } = await requireSystemAdminWithCaller()
  if (denied) return denied

  let body: CreateBody
  try {
    body = (await request.json()) as CreateBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const ip = body.ipAddress?.trim() ?? ""
  if (!isValidIp(ip)) {
    return NextResponse.json(
      { error: "Invalid IP address format" },
      { status: 400 }
    )
  }

  const label = body.label?.trim().slice(0, 60) || null

  let admin
  try {
    admin = getSupabaseAdmin()
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server misconfigured" },
      { status: 500 }
    )
  }

  const { data, error } = await admin
    .from("trusted_ips")
    .insert({ ip_address: ip, label, created_by: caller.id })
    .select("id")
    .single()

  if (error) {
    // Unique violation = IP already trusted.
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "This IP is already trusted" },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  writeAuditLog({
    actorId: caller.id,
    actorName: caller.name,
    actorRole: caller.role,
    action: "create",
    entityType: "user",
    entityId: data.id,
    entityName: `Trusted IP ${ip}${label ? ` (${label})` : ""}`,
    changes: { "IP": { new: ip }, "Label": { new: label ?? "" } },
    ipAddress: getCallerIp(request),
  })

  return NextResponse.json({ ok: true, id: data.id }, { status: 201 })
}

export async function DELETE(request: Request) {
  const { caller, denied } = await requireSystemAdminWithCaller()
  if (denied) return denied

  const url = new URL(request.url)
  const id = url.searchParams.get("id")
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 })
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

  // Load for audit before delete.
  const { data: existing } = await admin
    .from("trusted_ips")
    .select("ip_address, label")
    .eq("id", id)
    .single()

  const { error } = await admin.from("trusted_ips").delete().eq("id", id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  writeAuditLog({
    actorId: caller.id,
    actorName: caller.name,
    actorRole: caller.role,
    action: "delete",
    entityType: "user",
    entityId: id,
    entityName: `Trusted IP ${existing?.ip_address ?? "unknown"}`,
    ipAddress: getCallerIp(request),
  })

  return NextResponse.json({ ok: true })
}
