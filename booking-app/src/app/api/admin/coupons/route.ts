import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireSystemAdminWithCaller } from "@/lib/api-auth"
import { apiError } from "@/lib/api-response"
import {
  writeAuditLog,
  getCallerIp,
  SYSTEM_ACTOR_ID,
} from "@/lib/audit-log"
import {
  findCouponByCode,
  normaliseCode,
  type CouponDiscountType,
} from "@/lib/coupons"

// =============================================================================
// GET  /api/admin/coupons — list all coupons (system_admin)
// POST /api/admin/coupons — create a coupon (system_admin)
//
// Both gated to system_admin only. The middleware also default-denies
// /api/admin/* without a session, so this is belt + braces.
// =============================================================================

// ---------------------------------------------------------------------------
// GET — list
// ---------------------------------------------------------------------------
export async function GET() {
  const { denied } = await requireSystemAdminWithCaller()
  if (denied) return denied

  let admin
  try { admin = getSupabaseAdmin() }
  catch (err) {
    return apiError(err instanceof Error ? err.message : "Server misconfigured", 500)
  }

  const { data, error } = await admin
    .from("coupons")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) return apiError(error.message, 500)

  // Attach the live usage counts in a single follow-up query — cheaper
  // than N+1 and means the UI can render the list without another trip.
  const ids = (data ?? []).map((c) => c.id)
  const counts = new Map<string, number>()
  if (ids.length > 0) {
    const { data: uses } = await admin
      .from("coupon_uses")
      .select("coupon_id")
      .in("coupon_id", ids)
    for (const row of uses ?? []) {
      counts.set(row.coupon_id, (counts.get(row.coupon_id) ?? 0) + 1)
    }
  }

  const enriched = (data ?? []).map((c) => ({
    ...c,
    used_count: counts.get(c.id) ?? 0,
  }))

  return NextResponse.json({ data: enriched })
}

// ---------------------------------------------------------------------------
// POST — create
// ---------------------------------------------------------------------------

interface CreateBody {
  code?: string
  description?: string | null
  discount_type?: CouponDiscountType
  discount_value?: number
  valid_from?: string | null
  valid_until?: string | null
  min_spend?: number | null
  max_spend?: number | null
  usage_limit?: number | null
  usage_limit_per_email?: number | null
  allowed_emails?: string[] | null
  client_id?: string | null
}

export async function POST(request: Request) {
  const { caller, denied } = await requireSystemAdminWithCaller()
  if (denied) return denied

  let body: CreateBody
  try { body = (await request.json()) as CreateBody }
  catch { return apiError("Invalid JSON body", 400) }

  // Validate the inputs. Errors here are 400s with a specific message —
  // the admin form needs to display them next to fields.
  const code = normaliseCode(body.code ?? "")
  if (!code) return apiError("Code is required", 400)
  if (code.length > 64) return apiError("Code must be 64 characters or fewer", 400)

  if (body.discount_type !== "percentage" && body.discount_type !== "fixed") {
    return apiError("discount_type must be 'percentage' or 'fixed'", 400)
  }
  const value = Number(body.discount_value)
  if (!isFinite(value) || value <= 0) {
    return apiError("discount_value must be a positive number", 400)
  }
  if (body.discount_type === "percentage" && value > 100) {
    return apiError("Percentage discount can't exceed 100", 400)
  }

  // Optional numeric fields — coerce to null for empty / non-numeric.
  function optionalPositive(v: unknown, label: string): number | null | NextResponse {
    if (v === null || v === undefined || v === "") return null
    const n = Number(v)
    if (!isFinite(n) || n <= 0) {
      return apiError(`${label} must be a positive number`, 400)
    }
    return n
  }
  const minSpend = optionalPositive(body.min_spend, "min_spend")
  if (minSpend instanceof NextResponse) return minSpend
  const maxSpend = optionalPositive(body.max_spend, "max_spend")
  if (maxSpend instanceof NextResponse) return maxSpend
  const usageLimit = optionalPositive(body.usage_limit, "usage_limit")
  if (usageLimit instanceof NextResponse) return usageLimit
  const usageLimitPerEmail = optionalPositive(
    body.usage_limit_per_email,
    "usage_limit_per_email"
  )
  if (usageLimitPerEmail instanceof NextResponse) return usageLimitPerEmail

  if (minSpend !== null && maxSpend !== null && minSpend > maxSpend) {
    return apiError("min_spend can't exceed max_spend", 400)
  }
  if (
    body.valid_from && body.valid_until &&
    new Date(body.valid_from) > new Date(body.valid_until)
  ) {
    return apiError("valid_from can't be after valid_until", 400)
  }

  // Allowed emails: lower-case + dedupe; null/empty means no constraint.
  const allowedEmails = Array.isArray(body.allowed_emails)
    ? Array.from(
        new Set(
          body.allowed_emails
            .map((e) => (typeof e === "string" ? e.trim().toLowerCase() : ""))
            .filter((e) => e.length > 0)
        )
      )
    : null

  let admin
  try { admin = getSupabaseAdmin() }
  catch (err) {
    return apiError(err instanceof Error ? err.message : "Server misconfigured", 500)
  }

  // Pre-check the unique index gives a nicer error than the raw 23505.
  const existing = await findCouponByCode<{ id: string }>(admin, code, {
    columns: "id",
  })
  if (existing) return apiError(`A coupon with code "${code}" already exists`, 409)

  // Optional client restriction. Verify the client exists when provided
  // so we don't write an FK-dangling row that the apply endpoint would
  // silently reject.
  let clientId: string | null = null
  if (body.client_id) {
    const { data: client } = await admin
      .from("clients")
      .select("id")
      .eq("id", body.client_id)
      .maybeSingle()
    if (!client) return apiError("Selected client not found", 400)
    clientId = body.client_id
  }

  const { data: inserted, error } = await admin
    .from("coupons")
    .insert({
      code,
      description: body.description ?? null,
      discount_type: body.discount_type,
      discount_value: value,
      valid_from: body.valid_from ?? null,
      valid_until: body.valid_until ?? null,
      min_spend: minSpend,
      max_spend: maxSpend,
      usage_limit: usageLimit,
      usage_limit_per_email: usageLimitPerEmail,
      allowed_emails: allowedEmails && allowedEmails.length > 0 ? allowedEmails : null,
      client_id: clientId,
      status: "active",
      created_by: caller.id,
    })
    .select("*")
    .single()

  if (error || !inserted) {
    return apiError(error?.message ?? "Failed to create coupon", 500)
  }

  writeAuditLog({
    actorId: caller.id || SYSTEM_ACTOR_ID,
    actorName: caller.name || "System",
    actorRole: caller.role,
    action: "create",
    entityType: "system",
    entityId: inserted.id,
    entityName: `Coupon ${inserted.code}`,
    changes: {
      "Code": { new: inserted.code },
      "Type": { new: inserted.discount_type },
      "Value": { new: String(inserted.discount_value) },
    },
    ipAddress: getCallerIp(request),
  })

  return NextResponse.json({ data: inserted }, { status: 201 })
}
