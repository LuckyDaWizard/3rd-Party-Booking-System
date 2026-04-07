import { NextResponse } from "next/server"
import { getSupabaseAdmin, pinToEmail } from "@/lib/supabase-admin"

// =============================================================================
// PATCH /api/admin/users/[id]   — update an existing user
// DELETE /api/admin/users/[id]  — delete an existing user (auth + public row)
//
// PATCH body: any subset of
//   {
//     firstNames, surname, email, contactNumber, pin, role, clientId, status, unitIds
//   }
//
// If `pin` is included, the route also updates the linked auth.users
// (email + password) so the two stay in sync.
//
// If `unitIds` is included, the user_units rows are replaced wholesale.
//
// Auth: NONE for now. Locked down in Phase 4.
// =============================================================================

interface UpdateUserBody {
  firstNames?: string
  surname?: string
  email?: string
  contactNumber?: string
  pin?: string
  role?: "system_admin" | "unit_manager" | "user"
  clientId?: string | null
  status?: "Active" | "Disabled"
  unitIds?: string[]
}

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function PATCH(request: Request, context: RouteContext) {
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

  if (body.pin !== undefined && !/^\d{6}$/.test(body.pin)) {
    return NextResponse.json(
      { error: "pin must be exactly 6 digits" },
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

  // Load current row so we can compare and roll back if needed.
  const { data: current, error: loadErr } = await admin
    .from("users")
    .select("id, pin, auth_user_id")
    .eq("id", id)
    .single()

  if (loadErr || !current) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  // If PIN is changing, sync auth.users first.
  let pinRollback: { oldPin: string; oldEmail: string } | null = null
  if (body.pin !== undefined && body.pin !== current.pin) {
    if (!current.auth_user_id) {
      return NextResponse.json(
        { error: "User has no auth_user_id; cannot update PIN. Run backfill first." },
        { status: 500 }
      )
    }

    // Reject collisions.
    const { data: clash } = await admin
      .from("users")
      .select("id")
      .eq("pin", body.pin)
      .neq("id", id)
      .limit(1)
    if (clash && clash.length > 0) {
      return NextResponse.json(
        { error: `PIN ${body.pin} is already in use` },
        { status: 409 }
      )
    }

    const oldPin = current.pin
    const oldEmail = pinToEmail(oldPin)
    const newEmail = pinToEmail(body.pin)

    const { error: authErr } = await admin.auth.admin.updateUserById(
      current.auth_user_id,
      {
        email: newEmail,
        password: body.pin,
        email_confirm: true,
      }
    )
    if (authErr) {
      return NextResponse.json(
        { error: `Failed to update auth user: ${authErr.message}` },
        { status: 500 }
      )
    }
    pinRollback = { oldPin, oldEmail }
  }

  // Build the public.users update.
  const dbUpdates: Record<string, unknown> = {}
  if (body.firstNames !== undefined) dbUpdates.first_names = body.firstNames
  if (body.surname !== undefined) dbUpdates.surname = body.surname
  if (body.email !== undefined) dbUpdates.email = body.email
  if (body.contactNumber !== undefined) dbUpdates.contact_number = body.contactNumber
  if (body.pin !== undefined) dbUpdates.pin = body.pin
  if (body.role !== undefined) dbUpdates.role = body.role
  if (body.clientId !== undefined) dbUpdates.client_id = body.clientId
  if (body.status !== undefined) dbUpdates.status = body.status

  if (Object.keys(dbUpdates).length > 0) {
    const { error: updErr } = await admin
      .from("users")
      .update(dbUpdates)
      .eq("id", id)

    if (updErr) {
      // Roll back the auth change so the two stay in sync.
      if (pinRollback && current.auth_user_id) {
        await admin.auth.admin.updateUserById(current.auth_user_id, {
          email: pinRollback.oldEmail,
          password: pinRollback.oldPin,
          email_confirm: true,
        })
      }
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

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request, context: RouteContext) {
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

  // Load auth_user_id before we delete the row.
  const { data: current, error: loadErr } = await admin
    .from("users")
    .select("auth_user_id")
    .eq("id", id)
    .single()

  if (loadErr || !current) {
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
  if (current.auth_user_id) {
    const { error: authDelErr } = await admin.auth.admin.deleteUser(
      current.auth_user_id
    )
    if (authDelErr) {
      // The public row is already gone — log but don't fail. The orphan auth
      // user can be cleaned up manually from the dashboard if needed.
      console.warn(
        `Deleted public.users ${id} but failed to delete auth user ${current.auth_user_id}:`,
        authDelErr.message
      )
    }
  }

  return NextResponse.json({ ok: true })
}
