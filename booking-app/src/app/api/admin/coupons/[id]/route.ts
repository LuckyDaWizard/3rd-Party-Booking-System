import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireSystemAdminWithCaller } from "@/lib/api-auth"
import { apiError } from "@/lib/api-response"
import {
  writeAuditLog,
  getCallerIp,
  SYSTEM_ACTOR_ID,
} from "@/lib/audit-log"
import { codeLookupKey, normaliseCode } from "@/lib/coupons"

// =============================================================================
// GET    /api/admin/coupons/[id]  — fetch single + usage list
// PATCH  /api/admin/coupons/[id]  — edit any subset of fields
// DELETE /api/admin/coupons/[id]  — hard delete (only if zero uses;
//                                   otherwise admin should disable instead)
//
// All system_admin only.
// =============================================================================

interface RouteContext {
  params: Promise<{ id: string }>
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------
export async function GET(_request: Request, context: RouteContext) {
  const { denied } = await requireSystemAdminWithCaller()
  if (denied) return denied

  const { id } = await context.params
  if (!id) return apiError("Missing id", 400)

  let admin
  try { admin = getSupabaseAdmin() }
  catch (err) {
    return apiError(err instanceof Error ? err.message : "Server misconfigured", 500)
  }

  const { data: coupon, error } = await admin
    .from("coupons")
    .select("*")
    .eq("id", id)
    .maybeSingle()
  if (error) return apiError(error.message, 500)
  if (!coupon) return apiError("Coupon not found", 404)

  // Recent uses (most recent 50) for the admin manage page.
  const { data: uses } = await admin
    .from("coupon_uses")
    .select("id, booking_id, patient_email, original_amount, discount_amount, final_amount, applied_at")
    .eq("coupon_id", id)
    .order("applied_at", { ascending: false })
    .limit(50)

  const { count: totalUses } = await admin
    .from("coupon_uses")
    .select("id", { count: "exact", head: true })
    .eq("coupon_id", id)

  return NextResponse.json({
    data: coupon,
    uses: uses ?? [],
    usedCount: totalUses ?? 0,
  })
}

// ---------------------------------------------------------------------------
// PATCH
// ---------------------------------------------------------------------------

interface PatchBody {
  code?: string
  description?: string | null
  discount_type?: "percentage" | "fixed"
  discount_value?: number
  valid_from?: string | null
  valid_until?: string | null
  min_spend?: number | null
  max_spend?: number | null
  usage_limit?: number | null
  usage_limit_per_email?: number | null
  allowed_emails?: string[] | null
  status?: "active" | "disabled"
}

export async function PATCH(request: Request, context: RouteContext) {
  const { caller, denied } = await requireSystemAdminWithCaller()
  if (denied) return denied

  const { id } = await context.params
  if (!id) return apiError("Missing id", 400)

  let body: PatchBody
  try { body = (await request.json()) as PatchBody }
  catch { return apiError("Invalid JSON body", 400) }

  let admin
  try { admin = getSupabaseAdmin() }
  catch (err) {
    return apiError(err instanceof Error ? err.message : "Server misconfigured", 500)
  }

  const { data: existing } = await admin.from("coupons").select("*").eq("id", id).maybeSingle()
  if (!existing) return apiError("Coupon not found", 404)

  // Build the patch incrementally — only set keys the caller sent.
  const patch: Record<string, unknown> = {}
  const changes: Record<string, { old?: string; new: string }> = {}

  if (typeof body.code === "string") {
    const code = normaliseCode(body.code)
    if (!code) return apiError("Code can't be empty", 400)
    if (code.length > 64) return apiError("Code must be 64 characters or fewer", 400)
    if (code.toLowerCase() !== String(existing.code).toLowerCase()) {
      const { data: clash } = await admin
        .from("coupons")
        .select("id")
        .filter("code", "ilike", codeLookupKey(code))
        .neq("id", id)
        .limit(1)
        .maybeSingle()
      if (clash) return apiError(`A coupon with code "${code}" already exists`, 409)
    }
    patch.code = code
    changes["Code"] = { old: existing.code, new: code }
  }

  if (body.description !== undefined) {
    patch.description = body.description ?? null
    changes["Description"] = { old: existing.description ?? "", new: body.description ?? "" }
  }

  if (body.discount_type !== undefined) {
    if (body.discount_type !== "percentage" && body.discount_type !== "fixed") {
      return apiError("discount_type must be 'percentage' or 'fixed'", 400)
    }
    patch.discount_type = body.discount_type
    changes["Type"] = { old: existing.discount_type, new: body.discount_type }
  }

  if (body.discount_value !== undefined) {
    const v = Number(body.discount_value)
    if (!isFinite(v) || v <= 0) return apiError("discount_value must be a positive number", 400)
    const effectiveType = patch.discount_type ?? existing.discount_type
    if (effectiveType === "percentage" && v > 100) {
      return apiError("Percentage discount can't exceed 100", 400)
    }
    patch.discount_value = v
    changes["Value"] = { old: String(existing.discount_value), new: String(v) }
  }

  function optionalPositive(v: unknown): number | null | "invalid" {
    if (v === null || v === undefined || v === "") return null
    const n = Number(v)
    if (!isFinite(n) || n <= 0) return "invalid"
    return n
  }

  if (body.min_spend !== undefined) {
    const n = optionalPositive(body.min_spend)
    if (n === "invalid") return apiError("min_spend must be a positive number", 400)
    patch.min_spend = n
    changes["Min spend"] = { old: String(existing.min_spend ?? ""), new: String(n ?? "") }
  }
  if (body.max_spend !== undefined) {
    const n = optionalPositive(body.max_spend)
    if (n === "invalid") return apiError("max_spend must be a positive number", 400)
    patch.max_spend = n
    changes["Max spend"] = { old: String(existing.max_spend ?? ""), new: String(n ?? "") }
  }
  if (body.usage_limit !== undefined) {
    const n = optionalPositive(body.usage_limit)
    if (n === "invalid") return apiError("usage_limit must be a positive number", 400)
    patch.usage_limit = n
    changes["Usage limit"] = { old: String(existing.usage_limit ?? ""), new: String(n ?? "") }
  }
  if (body.usage_limit_per_email !== undefined) {
    const n = optionalPositive(body.usage_limit_per_email)
    if (n === "invalid") return apiError("usage_limit_per_email must be a positive number", 400)
    patch.usage_limit_per_email = n
    changes["Per-email limit"] = {
      old: String(existing.usage_limit_per_email ?? ""),
      new: String(n ?? ""),
    }
  }

  if (body.valid_from !== undefined) {
    patch.valid_from = body.valid_from ?? null
    changes["Valid from"] = { old: existing.valid_from ?? "", new: body.valid_from ?? "" }
  }
  if (body.valid_until !== undefined) {
    patch.valid_until = body.valid_until ?? null
    changes["Valid until"] = { old: existing.valid_until ?? "", new: body.valid_until ?? "" }
  }

  if (body.allowed_emails !== undefined) {
    const cleaned = Array.isArray(body.allowed_emails)
      ? Array.from(
          new Set(
            body.allowed_emails
              .map((e) => (typeof e === "string" ? e.trim().toLowerCase() : ""))
              .filter((e) => e.length > 0)
          )
        )
      : null
    patch.allowed_emails = cleaned && cleaned.length > 0 ? cleaned : null
    changes["Allowed emails"] = {
      old: (existing.allowed_emails ?? []).join(", "),
      new: (cleaned ?? []).join(", "),
    }
  }

  if (body.status !== undefined) {
    if (body.status !== "active" && body.status !== "disabled") {
      return apiError("status must be 'active' or 'disabled'", 400)
    }
    patch.status = body.status
    changes["Status"] = { old: existing.status, new: body.status }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ data: existing })
  }

  // Sanity-check the resulting (existing + patch) row before writing.
  const merged = { ...existing, ...patch }
  if (
    merged.min_spend !== null && merged.max_spend !== null &&
    Number(merged.min_spend) > Number(merged.max_spend)
  ) return apiError("min_spend can't exceed max_spend", 400)
  if (
    merged.valid_from && merged.valid_until &&
    new Date(merged.valid_from as string) > new Date(merged.valid_until as string)
  ) return apiError("valid_from can't be after valid_until", 400)

  const { data: updated, error: updateErr } = await admin
    .from("coupons")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single()
  if (updateErr || !updated) {
    return apiError(updateErr?.message ?? "Failed to update coupon", 500)
  }

  writeAuditLog({
    actorId: caller.id || SYSTEM_ACTOR_ID,
    actorName: caller.name || "System",
    actorRole: caller.role,
    action: "update",
    entityType: "system",
    entityId: updated.id,
    entityName: `Coupon ${updated.code}`,
    changes,
    ipAddress: getCallerIp(request),
  })

  return NextResponse.json({ data: updated })
}

// ---------------------------------------------------------------------------
// DELETE — only if the coupon has never been used. Otherwise the admin
// should call PATCH with status=disabled to preserve the audit chain.
// ---------------------------------------------------------------------------
export async function DELETE(request: Request, context: RouteContext) {
  const { caller, denied } = await requireSystemAdminWithCaller()
  if (denied) return denied

  const { id } = await context.params
  if (!id) return apiError("Missing id", 400)

  let admin
  try { admin = getSupabaseAdmin() }
  catch (err) {
    return apiError(err instanceof Error ? err.message : "Server misconfigured", 500)
  }

  const { data: existing } = await admin
    .from("coupons")
    .select("id, code")
    .eq("id", id)
    .maybeSingle()
  if (!existing) return apiError("Coupon not found", 404)

  const { count: usesCount } = await admin
    .from("coupon_uses")
    .select("id", { count: "exact", head: true })
    .eq("coupon_id", id)

  if ((usesCount ?? 0) > 0) {
    return apiError(
      "This coupon has been used and can't be deleted. Disable it instead so the audit trail survives.",
      409
    )
  }

  const { error: delErr } = await admin.from("coupons").delete().eq("id", id)
  if (delErr) return apiError(delErr.message, 500)

  writeAuditLog({
    actorId: caller.id || SYSTEM_ACTOR_ID,
    actorName: caller.name || "System",
    actorRole: caller.role,
    action: "delete",
    entityType: "system",
    entityId: id,
    entityName: `Coupon ${existing.code}`,
    changes: { "Code": { old: existing.code, new: "" } },
    ipAddress: getCallerIp(request),
  })

  return NextResponse.json({ ok: true })
}
