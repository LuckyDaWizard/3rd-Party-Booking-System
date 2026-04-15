import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireAdminOrManager, callerCanAccessUser } from "@/lib/api-auth"
import { writeAuditLog, getCallerIp } from "@/lib/audit-log"

// =============================================================================
// PATCH /api/admin/users/[id]   — update an existing user
// DELETE /api/admin/users/[id]  — delete an existing user (auth + public row)
//
// PATCH body: any subset of
//   {
//     firstNames, surname, email, contactNumber, role, clientId, status, unitIds
//   }
//
// PIN changes are NOT accepted here — use POST /api/admin/users/[id]/reset-pin
// which generates a secure PIN, updates auth.users, and emails the user.
//
// If `unitIds` is included, the user_units rows are replaced wholesale.
// =============================================================================

interface UpdateUserBody {
  firstNames?: string
  surname?: string
  email?: string
  contactNumber?: string
  role?: "system_admin" | "unit_manager" | "user"
  clientId?: string | null
  status?: "Active" | "Disabled"
  unitIds?: string[]
}

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function PATCH(request: Request, context: RouteContext) {
  const { caller, denied } = await requireAdminOrManager()
  if (denied) return denied

  const { id } = await context.params
  if (!id) {
    return NextResponse.json({ error: "Missing user id" }, { status: 400 })
  }

  let body: UpdateUserBody
  try {
    body = (await request.json()) as UpdateUserBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
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

  // Load current row so we can compare for audit logging.
  const { data: current, error: loadErr } = await admin
    .from("users")
    .select("id, first_names, surname, email, contact_number, role, status, client_id, auth_user_id")
    .eq("id", id)
    .single()

  if (loadErr || !current) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  // Unit-scoping: unit_managers can only edit users in their own units.
  const hasAccess = await callerCanAccessUser(caller, id, admin)
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden — user is not in your units" }, { status: 403 })
  }

  // unit_manager cannot change roles (only system_admin can promote/demote)
  if (caller.role === "unit_manager" && body.role !== undefined) {
    return NextResponse.json(
      { error: "Unit managers cannot change user roles" },
      { status: 403 }
    )
  }

  // Build the public.users update. (PIN is intentionally not supported here —
  // use /api/admin/users/[id]/reset-pin instead.)
  const dbUpdates: Record<string, unknown> = {}
  if (body.firstNames !== undefined) dbUpdates.first_names = body.firstNames
  if (body.surname !== undefined) dbUpdates.surname = body.surname
  if (body.email !== undefined) dbUpdates.email = body.email
  if (body.contactNumber !== undefined) dbUpdates.contact_number = body.contactNumber
  if (body.role !== undefined) dbUpdates.role = body.role
  if (body.clientId !== undefined) dbUpdates.client_id = body.clientId
  if (body.status !== undefined) dbUpdates.status = body.status

  if (Object.keys(dbUpdates).length > 0) {
    const { error: updErr } = await admin
      .from("users")
      .update(dbUpdates)
      .eq("id", id)

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 })
    }
  }

  // Replace unit assignments if requested.
  if (body.unitIds !== undefined) {
    const { error: delErr } = await admin
      .from("user_units")
      .delete()
      .eq("user_id", id)
    if (delErr) {
      return NextResponse.json(
        { error: `Failed to clear unit assignments: ${delErr.message}` },
        { status: 500 }
      )
    }

    if (body.unitIds.length > 0) {
      const rows = body.unitIds.map((unitId) => ({
        user_id: id,
        unit_id: unitId,
      }))
      const { error: insErr } = await admin.from("user_units").insert(rows)
      if (insErr) {
        return NextResponse.json(
          { error: `Failed to assign units: ${insErr.message}` },
          { status: 500 }
        )
      }
    }

    // Also keep legacy unit_id column in sync (matches existing user-store behavior).
    await admin
      .from("users")
      .update({ unit_id: body.unitIds[0] ?? null })
      .eq("id", id)
  }

  // Audit log — compute changes (exclude PIN from diff).
  const changes: Record<string, { old?: unknown; new?: unknown }> = {}
  if (body.firstNames !== undefined && body.firstNames !== current.first_names)
    changes["First Names"] = { old: current.first_names, new: body.firstNames }
  if (body.surname !== undefined && body.surname !== current.surname)
    changes["Surname"] = { old: current.surname, new: body.surname }
  if (body.email !== undefined && body.email !== current.email)
    changes["Email"] = { old: current.email, new: body.email }
  if (body.contactNumber !== undefined && body.contactNumber !== current.contact_number)
    changes["Contact Number"] = { old: current.contact_number, new: body.contactNumber }
  if (body.role !== undefined && body.role !== current.role)
    changes["Role"] = { old: current.role, new: body.role }
  if (body.status !== undefined && body.status !== current.status)
    changes["Status"] = { old: current.status, new: body.status }
  if (body.unitIds !== undefined) {
    // Resolve unit IDs to names for readability.
    let unitNames: string[] = []
    if (body.unitIds.length > 0) {
      const { data: unitRows } = await admin
        .from("units")
        .select("unit_name")
        .in("id", body.unitIds)
      unitNames = (unitRows ?? []).map((u: { unit_name: string }) => u.unit_name)
    }
    changes["Units"] = { new: unitNames.length > 0 ? unitNames : body.unitIds }
  }

  if (Object.keys(changes).length > 0) {
    const action = changes["Status"] && Object.keys(changes).length === 1 ? "toggle_status" as const : "update" as const
    writeAuditLog({
      actorId: caller.id,
      actorName: caller.name,
      actorRole: caller.role,
      action,
      entityType: "user",
      entityId: id,
      entityName: `${current.first_names} ${current.surname}`.trim(),
      changes,
      ipAddress: getCallerIp(request),
    })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request, context: RouteContext) {
  const { caller, denied } = await requireAdminOrManager()
  if (denied) return denied

  const { id } = await context.params
  if (!id) {
    return NextResponse.json({ error: "Missing user id" }, { status: 400 })
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

  // Unit-scoping: unit_managers can only delete users in their own units.
  const hasAccess = await callerCanAccessUser(caller, id, admin)
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden — user is not in your units" }, { status: 403 })
  }

  // Load user data before we delete the row.
  const { data: delTarget, error: loadErr } = await admin
    .from("users")
    .select("first_names, surname, auth_user_id")
    .eq("id", id)
    .single()

  if (loadErr || !delTarget) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  // Delete public.users row first. ON DELETE CASCADE should clean up
  // user_units; if not, we delete it explicitly.
  const { error: deluErr } = await admin
    .from("user_units")
    .delete()
    .eq("user_id", id)
  if (deluErr) {
    // Non-fatal — proceed to user delete which may cascade anyway.
    console.warn(`Failed to clear user_units for ${id}:`, deluErr.message)
  }

  const { error: delErr } = await admin.from("users").delete().eq("id", id)
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 })
  }

  // Then delete the auth user.
  if (delTarget.auth_user_id) {
    const { error: authDelErr } = await admin.auth.admin.deleteUser(
      delTarget.auth_user_id
    )
    if (authDelErr) {
      console.warn(
        `Deleted public.users ${id} but failed to delete auth user ${delTarget.auth_user_id}:`,
        authDelErr.message
      )
    }
  }

  // Audit log.
  writeAuditLog({
    actorId: caller.id,
    actorName: caller.name,
    actorRole: caller.role,
    action: "delete",
    entityType: "user",
    entityId: id,
    entityName: `${delTarget.first_names} ${delTarget.surname}`.trim(),
    ipAddress: getCallerIp(request),
  })

  return NextResponse.json({ ok: true })
}
