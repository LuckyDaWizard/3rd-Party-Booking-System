// =============================================================================
// coupons.ts
//
// Shared types + validation logic for WooCommerce-style coupon codes.
//
// Used by:
//   - POST /api/coupons/apply  (the patient/operator apply path)
//   - POST /api/coupons/remove (the patient/operator remove path)
//   - The admin create/edit endpoints (re-uses the shape definitions)
//
// All discount maths is here so the patient-facing input and the
// PayFast-initiate path can never disagree about what the discounted
// amount is.
// =============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CouponDiscountType = "percentage" | "fixed"
export type CouponStatus = "active" | "disabled"

/** Shape of a row from public.coupons. */
export interface DbCoupon {
  id: string
  code: string
  description: string | null
  discount_type: CouponDiscountType
  discount_value: number
  valid_from: string | null
  valid_until: string | null
  min_spend: number | null
  max_spend: number | null
  usage_limit: number | null
  usage_limit_per_email: number | null
  allowed_emails: string[] | null
  /** Optional client restriction. NULL = any client. */
  client_id: string | null
  status: CouponStatus
  created_by: string | null
  /** ISO-8601 timestamp string (Postgres `timestamptz` serialised by PostgREST). */
  created_at: string
  /** ISO-8601 timestamp string (Postgres `timestamptz` serialised by PostgREST). */
  updated_at: string
}

/** Outcome of resolving a discount against an amount. */
export interface ResolvedDiscount {
  /** Original amount before any discount. */
  originalAmount: number
  /** Resolved discount, rounded to 2dp, capped at originalAmount. */
  discountAmount: number
  /** What the patient will actually be charged. */
  finalAmount: number
}

/** Why a coupon was rejected — friendly enough to render verbatim. */
export type CouponRejectionReason =
  | "not-found"
  | "disabled"
  | "not-yet-active"
  | "expired"
  | "min-spend-not-met"
  | "max-spend-exceeded"
  | "usage-limit-reached"
  | "usage-limit-per-email-reached"
  | "email-not-allowed"
  | "missing-email"
  | "wrong-client"

/** Human-readable text per rejection reason. Patient-side messages. */
export function rejectionMessage(reason: CouponRejectionReason): string {
  switch (reason) {
    case "not-found":
      return "Coupon code not found. Check for typos and try again."
    case "disabled":
      return "This coupon is no longer available."
    case "not-yet-active":
      return "This coupon isn't active yet."
    case "expired":
      return "This coupon has expired."
    case "min-spend-not-met":
      return "This coupon doesn't apply to this consultation amount."
    case "max-spend-exceeded":
      return "This coupon doesn't apply to this consultation amount."
    case "usage-limit-reached":
      return "This coupon has reached its usage limit."
    case "usage-limit-per-email-reached":
      return "You've already used this coupon the maximum number of times."
    case "email-not-allowed":
      return "This coupon isn't available for this patient email."
    case "missing-email":
      return "A patient email is required to apply this coupon."
    case "wrong-client":
      return "This coupon isn't valid for bookings under this clinic."
  }
}

// ---------------------------------------------------------------------------
// Discount maths
// ---------------------------------------------------------------------------

/**
 * Resolve a coupon's discount against a given amount. Pure function — no
 * DB / time / constraint checks; just the maths once we've decided the
 * coupon applies.
 *
 *   percentage:  discount = round(amount * value / 100, 2), capped at amount
 *   fixed:       discount = min(value, amount)
 *
 * Always returns non-negative numbers; finalAmount can be 0 but never
 * below.
 */
export function resolveDiscount(
  coupon: Pick<DbCoupon, "discount_type" | "discount_value">,
  amount: number
): ResolvedDiscount {
  if (amount < 0) {
    throw new Error("resolveDiscount: amount must be >= 0")
  }
  const safeAmount = round2(amount)
  let discount: number
  if (coupon.discount_type === "percentage") {
    discount = round2((safeAmount * Number(coupon.discount_value)) / 100)
  } else {
    discount = round2(Number(coupon.discount_value))
  }
  // Cap at amount — a coupon worth more than the booking just zeroes it.
  discount = Math.min(discount, safeAmount)
  // Floor at 0 (defensive — discount_value > 0 per CHECK constraint).
  discount = Math.max(0, discount)
  const finalAmount = round2(safeAmount - discount)
  return {
    originalAmount: safeAmount,
    discountAmount: discount,
    finalAmount,
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ---------------------------------------------------------------------------
// Constraint checks
// ---------------------------------------------------------------------------

/**
 * Run every coupon constraint against the supplied context. Returns the
 * first failing reason, or null on success.
 *
 * Caller is responsible for COUNT-ing the usage tables — passing the
 * counts in means this function stays a pure single-row check that's
 * trivial to test.
 */
export function checkCouponConstraints(
  coupon: DbCoupon,
  ctx: {
    /** Patient email (lower-case, trimmed). null if the booking has no email yet. */
    patientEmail: string | null
    /** The booking's payment_amount before the discount. */
    bookingAmount: number
    /** COUNT(*) of coupon_uses for this coupon overall. */
    totalUses: number
    /** COUNT(*) of coupon_uses for this coupon WHERE lower(patient_email) = ctx.patientEmail. */
    usesForEmail: number
    /** ISO timestamp to compare valid_from / valid_until against. Pass new Date().toISOString() in production. */
    now: string
    /** Parent client id of the booking. Used for the client-scope check. null if unknown. */
    bookingClientId: string | null
  }
): CouponRejectionReason | null {
  if (coupon.status === "disabled") return "disabled"

  if (coupon.valid_from && ctx.now < coupon.valid_from) return "not-yet-active"
  if (coupon.valid_until && ctx.now > coupon.valid_until) return "expired"

  // Client scope: when a coupon is restricted to a specific client, the
  // booking's parent client must match. NULL = "any client".
  if (coupon.client_id !== null && coupon.client_id !== ctx.bookingClientId) {
    return "wrong-client"
  }

  if (coupon.min_spend !== null && ctx.bookingAmount < Number(coupon.min_spend)) {
    return "min-spend-not-met"
  }
  if (coupon.max_spend !== null && ctx.bookingAmount > Number(coupon.max_spend)) {
    return "max-spend-exceeded"
  }

  if (coupon.usage_limit !== null && ctx.totalUses >= coupon.usage_limit) {
    return "usage-limit-reached"
  }

  // Per-email + allowed-email checks require an email.
  const hasEmailConstraint =
    (coupon.allowed_emails && coupon.allowed_emails.length > 0) ||
    coupon.usage_limit_per_email !== null
  if (hasEmailConstraint && !ctx.patientEmail) {
    return "missing-email"
  }

  if (coupon.allowed_emails && coupon.allowed_emails.length > 0) {
    const allowed = coupon.allowed_emails.map((e) => e.toLowerCase().trim())
    if (!ctx.patientEmail || !allowed.includes(ctx.patientEmail)) {
      return "email-not-allowed"
    }
  }

  if (
    coupon.usage_limit_per_email !== null &&
    ctx.usesForEmail >= coupon.usage_limit_per_email
  ) {
    return "usage-limit-per-email-reached"
  }

  return null
}

// ---------------------------------------------------------------------------
// Code normalisation
// ---------------------------------------------------------------------------

/**
 * Lower-case + trim — for the unique-index look-up.
 *
 * Codes are stored case-preserving in `coupons.code` but matched
 * case-insensitively (the unique index from migration 038 is on the
 * generated `lower(code)` column). All callers should lower-case
 * before look-up.
 */
export function codeLookupKey(input: string): string {
  return input.trim().toLowerCase()
}

// ---------------------------------------------------------------------------
// Coupon lookup helper
// ---------------------------------------------------------------------------

/**
 * Case-insensitive coupon lookup by code. Returns the first matching row
 * or null. Centralises the `.filter("code", "ilike", codeLookupKey(code))`
 * + `.limit(1).maybeSingle()` pattern that was previously duplicated
 * across the apply endpoint and the two admin endpoints (create + PATCH).
 *
 * @param admin    Service-role Supabase client (from getSupabaseAdmin).
 * @param code     Raw code as entered (case + whitespace are normalised).
 * @param options  Tunables:
 *                   - columns: which columns to select (default "*")
 *                   - excludeId: skip a specific row id (used by the PATCH
 *                     clash-check so the row being edited doesn't match
 *                     itself)
 */
type AdminClient = ReturnType<typeof import("./supabase-admin").getSupabaseAdmin>

export async function findCouponByCode<T = Record<string, unknown>>(
  admin: AdminClient,
  code: string,
  options?: { columns?: string; excludeId?: string }
): Promise<T | null> {
  const lookupKey = codeLookupKey(code)
  const columns = options?.columns ?? "*"

  // Use the generated `code_lower` column added in migration 038, which
  // has a regular unique index. Equality against a plain column is the
  // pattern the planner always picks the unique index for — replaces the
  // previous ILIKE-on-`code` which depended on the planner choosing the
  // functional index from migration 033.
  let query = admin
    .from("coupons")
    .select(columns)
    .eq("code_lower", lookupKey)
    .limit(1)

  if (options?.excludeId) {
    query = query.neq("id", options.excludeId)
  }

  const { data } = await query.maybeSingle<T>()
  return data ?? null
}
