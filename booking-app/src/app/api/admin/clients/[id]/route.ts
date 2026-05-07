import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireSystemAdminWithCaller } from "@/lib/api-auth"
import { writeAuditLog, getCallerIp } from "@/lib/audit-log"

// =============================================================================
// PATCH /api/admin/clients/[id]  — update a client
// DELETE /api/admin/clients/[id] — delete a client
//
// PATCH body: any subset of
//   {
//     clientName, contactPersonName, contactPersonSurname,
//     email, contactNumber, status
//   }
//
// Auth: system_admin only.
// =============================================================================

interface UpdateClientBody {
  clientName?: string
  contactPersonName?: string
  contactPersonSurname?: string
  email?: string
  contactNumber?: string
  status?: "Active" | "Disabled"
  /** Hex like '#3ea3db', or null to clear. Validated server-side. */
  accentColor?: string | null
  /**
   * When TRUE, every unit under this client skips the payment gateway —
   * bookings get marked as `payment_type = 'self_collect'` and the unit
   * collects the consultation fee directly. Only system_admin can flip
   * this; the route as a whole is system_admin-gated by
   * requireSystemAdminWithCaller so this is structurally enforced.
   */
  collectPaymentAtUnit?: boolean
  /**
   * When TRUE, every booking under this client skips the payment step
   * entirely — auto-marked Payment Complete with payment_type =
   * 'monthly_invoice'. Mutually exclusive with collectPaymentAtUnit
   * at the UI; if both arrive TRUE on the same PATCH (shouldn't be
   * possible via the UI), monthly_invoice wins downstream.
   */
  billMonthly?: boolean
  /**
   * Sub-option of billMonthly. When TRUE, bookings also skip the
   * patient-metrics step. Server clamps to FALSE if billMonthly ends
   * up FALSE on this PATCH (or already is FALSE in the DB).
   */
  skipPatientMetrics?: boolean
}

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

/**
 * Normalises an incoming accent value:
 *   - undefined → leave unchanged
 *   - null / "" → store NULL (clear)
 *   - valid hex → store lowercased
 *   - anything else → throw, so caller can return 400
 */
function normaliseAccent(raw: string | null | undefined): string | null | undefined {
  if (raw === undefined) return undefined
  if (raw === null || raw === "") return null
  if (!HEX_RE.test(raw)) {
    throw new Error(`Invalid accent colour: ${raw}`)
  }
  return raw.toLowerCase()
}

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function PATCH(request: Request, context: RouteContext) {
  const { caller, denied } = await requireSystemAdminWithCaller()
  if (denied) return denied

  const { id } = await context.params
  if (!id) {
    return NextResponse.json({ error: "Missing client id" }, { status: 400 })
  }

  let body: UpdateClientBody
  try {
    body = (await request.json()) as UpdateClientBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  let normalisedAccent: string | null | undefined
  try {
    normalisedAccent = normaliseAccent(body.accentColor)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid accent colour" },
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

  // Load current row for audit diff.
  const { data: current } = await admin
    .from("clients")
    .select("client_name, contact_person_name, contact_person_surname, email, contact_number, status, accent_color, collect_payment_at_unit, bill_monthly, skip_patient_metrics")
    .eq("id", id)
    .single()

  const dbUpdates: Record<string, unknown> = {}
  if (body.clientName !== undefined) dbUpdates.client_name = body.clientName
  if (body.contactPersonName !== undefined) dbUpdates.contact_person_name = body.contactPersonName
  if (body.contactPersonSurname !== undefined) dbUpdates.contact_person_surname = body.contactPersonSurname
  if (body.email !== undefined) dbUpdates.email = body.email
  if (body.contactNumber !== undefined) dbUpdates.contact_number = body.contactNumber
  if (body.status !== undefined) dbUpdates.status = body.status
  if (normalisedAccent !== undefined) dbUpdates.accent_color = normalisedAccent
  if (body.collectPaymentAtUnit !== undefined) dbUpdates.collect_payment_at_unit = body.collectPaymentAtUnit
  if (body.billMonthly !== undefined) dbUpdates.bill_monthly = body.billMonthly
  if (body.skipPatientMetrics !== undefined) dbUpdates.skip_patient_metrics = body.skipPatientMetrics

  // Mutual exclusion: turning one billing-mode flag ON forces the other
  // OFF. The UI already enforces this, but a malformed request that
  // ships both TRUE would produce inconsistent server state — defend
  // against it here. Order of precedence: monthly_invoice wins.
  if (body.billMonthly === true) {
    dbUpdates.collect_payment_at_unit = false
  } else if (body.collectPaymentAtUnit === true) {
    dbUpdates.bill_monthly = false
    // Cascade: skip_patient_metrics is sub to bill_monthly. If the
    // operator turns OFF monthly billing (by turning ON self-collect),
    // any pre-existing skip-metrics flag has to come off too — it's
    // meaningless without monthly_invoice in the booking flow.
    dbUpdates.skip_patient_metrics = false
  }
  // Defensive: if bill_monthly is being set to FALSE explicitly, clear
  // skip_patient_metrics in the same write so we don't end up with the
  // sub-flag dangling on a non-monthly client.
  const effectiveBillMonthly =
    body.billMonthly !== undefined
      ? body.billMonthly
      : (current?.bill_monthly ?? false)
  if (effectiveBillMonthly === false) {
    dbUpdates.skip_patient_metrics = false
  }

  if (Object.keys(dbUpdates).length === 0) {
    return NextResponse.json({ ok: true })
  }

  const { error: updErr } = await admin
    .from("clients")
    .update(dbUpdates)
    .eq("id", id)

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  // Audit log.
  const changes: Record<string, { old?: unknown; new?: unknown }> = {}
  if (body.clientName !== undefined && body.clientName !== current?.client_name)
    changes["Client Name"] = { old: current?.client_name, new: body.clientName }
  if (body.contactPersonName !== undefined && body.contactPersonName !== current?.contact_person_name)
    changes["Contact Person Name"] = { old: current?.contact_person_name, new: body.contactPersonName }
  if (body.contactPersonSurname !== undefined && body.contactPersonSurname !== current?.contact_person_surname)
    changes["Contact Person Surname"] = { old: current?.contact_person_surname, new: body.contactPersonSurname }
  if (body.email !== undefined && body.email !== current?.email)
    changes["Email"] = { old: current?.email, new: body.email }
  if (body.contactNumber !== undefined && body.contactNumber !== current?.contact_number)
    changes["Contact Number"] = { old: current?.contact_number, new: body.contactNumber }
  if (body.status !== undefined && body.status !== current?.status)
    changes["Status"] = { old: current?.status, new: body.status }
  if (normalisedAccent !== undefined && normalisedAccent !== current?.accent_color)
    changes["Accent Colour"] = { old: current?.accent_color, new: normalisedAccent }
  if (
    body.collectPaymentAtUnit !== undefined &&
    body.collectPaymentAtUnit !== (current?.collect_payment_at_unit ?? false)
  )
    changes["Collect Payment At Unit"] = {
      old: current?.collect_payment_at_unit ?? false,
      new: body.collectPaymentAtUnit,
    }
  if (
    body.billMonthly !== undefined &&
    body.billMonthly !== (current?.bill_monthly ?? false)
  )
    changes["Bill Monthly"] = {
      old: current?.bill_monthly ?? false,
      new: body.billMonthly,
    }
  // Compare against the EFFECTIVE post-clamp value rather than the raw
  // body, so an audit-log entry only appears when the stored flag
  // actually changed (e.g. operator sent skipPatientMetrics=true but
  // bill_monthly was off → server clamped to false → no real change).
  const postClampSkip =
    dbUpdates.skip_patient_metrics !== undefined
      ? (dbUpdates.skip_patient_metrics as boolean)
      : (current?.skip_patient_metrics ?? false)
  if (postClampSkip !== (current?.skip_patient_metrics ?? false))
    changes["Skip Patient Metrics"] = {
      old: current?.skip_patient_metrics ?? false,
      new: postClampSkip,
    }

  if (Object.keys(changes).length > 0) {
    const action = changes["Status"] && Object.keys(changes).length === 1 ? "toggle_status" as const : "update" as const
    writeAuditLog({
      actorId: caller.id,
      actorName: caller.name,
      actorRole: caller.role,
      action,
      entityType: "client",
      entityId: id,
      entityName: current?.client_name ?? body.clientName,
      changes,
      ipAddress: getCallerIp(request),
    })
  }

  return NextResponse.json({ ok: true })
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

  // Load name before deletion for audit log.
  const { data: delTarget } = await admin
    .from("clients")
    .select("client_name")
    .eq("id", id)
    .single()

  // Cascade-delete chain. The DB doesn't have ON DELETE CASCADE on
  // units.client_id / bookings.unit_id / user_units.unit_id, so a plain
  // DELETE on clients fails with a FK violation when the client has
  // any units. We explicitly clear the dependent rows first, in this
  // order:
  //   bookings (where unit_id IN client's unit_ids)
  //   user_units (where unit_id IN client's unit_ids)
  //   units (where client_id = id)
  //   clients (where id = id)
  // This is destructive — patient bookings under this client are wiped.
  // The Manage Client UI puts a confirmation dialog + PIN gate in front
  // of this action so it's not reachable by accident.
  const { data: clientUnits } = await admin
    .from("units")
    .select("id")
    .eq("client_id", id)
  const unitIds = (clientUnits as { id: string }[] | null)?.map((u) => u.id) ?? []
  let cascadedBookings = 0
  let cascadedUnitAssignments = 0
  const cascadedUnits = unitIds.length

  if (unitIds.length > 0) {
    // 1. Bookings under any of these units. Count first so we can audit
    //    the blast radius.
    const { count: bookingCount } = await admin
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .in("unit_id", unitIds)
    cascadedBookings = bookingCount ?? 0

    if (cascadedBookings > 0) {
      const { error: delBookingsErr } = await admin
        .from("bookings")
        .delete()
        .in("unit_id", unitIds)
      if (delBookingsErr) {
        return NextResponse.json(
          {
            error: `Failed to cascade-delete bookings: ${delBookingsErr.message}`,
          },
          { status: 500 }
        )
      }
    }

    // 2. user_units join rows for these units.
    const { count: assignCount } = await admin
      .from("user_units")
      .select("user_id", { count: "exact", head: true })
      .in("unit_id", unitIds)
    cascadedUnitAssignments = assignCount ?? 0

    if (cascadedUnitAssignments > 0) {
      const { error: delAssignsErr } = await admin
        .from("user_units")
        .delete()
        .in("unit_id", unitIds)
      if (delAssignsErr) {
        return NextResponse.json(
          {
            error: `Failed to cascade-delete user-unit assignments: ${delAssignsErr.message}`,
          },
          { status: 500 }
        )
      }
    }

    // 3. The units themselves.
    const { error: delUnitsErr } = await admin
      .from("units")
      .delete()
      .eq("client_id", id)
    if (delUnitsErr) {
      return NextResponse.json(
        { error: `Failed to cascade-delete units: ${delUnitsErr.message}` },
        { status: 500 }
      )
    }
  }

  // 4. Finally the client.
  const { error: delErr } = await admin.from("clients").delete().eq("id", id)

  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 })
  }

  writeAuditLog({
    actorId: caller.id,
    actorName: caller.name,
    actorRole: caller.role,
    action: "delete",
    entityType: "client",
    entityId: id,
    entityName: delTarget?.client_name,
    changes:
      cascadedUnits > 0 || cascadedBookings > 0 || cascadedUnitAssignments > 0
        ? {
            "Cascade-deleted units": { new: cascadedUnits },
            "Cascade-deleted bookings": { new: cascadedBookings },
            "Cascade-deleted user-unit assignments": { new: cascadedUnitAssignments },
          }
        : undefined,
    ipAddress: getCallerIp(request),
  })

  return NextResponse.json({ ok: true })
}
