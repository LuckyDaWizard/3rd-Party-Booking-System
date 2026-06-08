/* eslint-disable no-console */
// =============================================================================
// tests/_setup/seed.ts
//
// Idempotent Playwright seed for the coupon R0 happy-path regression net
// (backlog B3). Inserts the MINIMUM set of rows the test needs:
//
//   1. clients          — "Playwright Test Clinic" with allow_coupons=true,
//                         no monthly-invoice, no self-collect.
//   2. units            — "Playwright Test Unit" under that client.
//   3. coupons          — "100OFF-PLAYWRIGHT" (100% off, active, scoped to
//                         the test client only — won't apply to any other
//                         clinic in the dev DB).
//   4. auth.users + public.users + user_units — "Playwright Tester" with PIN
//                         900900 and role system_admin (chosen so the test
//                         skips unit-scoping fiddliness; the routes we exercise
//                         are unchanged for admins vs unit_managers on the R0
//                         path because the unique invariant is what flips the
//                         status, not who clicks the button).
//
// Everything is labelled with the magic strings "Playwright" / "PLAYWRIGHT"
// so it's safe to leave behind in the dev Supabase and grep for during
// clean-up. Service-role only — never imported from app code.
//
// To run manually:
//   PLAYWRIGHT_SEED=1 npx playwright test
//
// To inspect / clean up by hand:
//   select * from public.clients where client_name = 'Playwright Test Clinic';
//   select * from public.coupons where code = '100OFF-PLAYWRIGHT';
//   -- to wipe: cascade-delete the client (units, user_units, coupon_uses
//   -- all FK-cascade), then delete the coupon and the auth user manually.
//
// Seeded constants are exported so the spec can import them rather than
// hard-coding magic strings.
// =============================================================================

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// ----- Public seeded constants the spec imports ------------------------------

export const SEED = {
  clientName: "Playwright Test Clinic",
  unitName: "Playwright Test Unit",
  couponCode: "100OFF-PLAYWRIGHT",
  user: {
    pin: "900900",
    firstNames: "Playwright",
    surname: "Tester",
    role: "system_admin" as const,
  },
} as const

export function pinToEmail(pin: string): string {
  return `pin-${pin}@carefirst.local`
}

// ----- Env loading -----------------------------------------------------------

/**
 * Minimal .env.local parser so the seed can run via `tsx` / Playwright's
 * globalSetup without depending on `dotenv`. Only handles plain KEY=VALUE
 * lines — no quoting tricks, no interpolation. That's enough for the keys
 * we read (Supabase URL + service role).
 */
function loadEnvFile(): void {
  try {
    const p = join(process.cwd(), ".env.local")
    const txt = readFileSync(p, "utf8")
    for (const rawLine of txt.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith("#")) continue
      const eq = line.indexOf("=")
      if (eq < 0) continue
      const key = line.slice(0, eq).trim()
      const value = line.slice(eq + 1).trim()
      if (!key || process.env[key] !== undefined) continue
      process.env[key] = value
    }
  } catch {
    // .env.local missing — fall through and let the explicit env check below
    // surface the right error.
  }
}

// ----- Seed entry point ------------------------------------------------------

export interface SeededIds {
  clientId: string
  unitId: string
  couponId: string
  userId: string
  authUserId: string
}

export async function seedForCouponR0Test(): Promise<SeededIds> {
  loadEnvFile()

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    throw new Error(
      "[seed] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
        "Set them in booking-app/.env.local."
    )
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const clientId = await ensureClient(admin)
  const unitId = await ensureUnit(admin, clientId)
  const { userId, authUserId } = await ensureUser(admin)
  await ensureUserUnit(admin, userId, unitId)
  const couponId = await ensureCoupon(admin, clientId, userId)

  console.log(
    `[seed] OK — client=${clientId} unit=${unitId} user=${userId} coupon=${couponId}`
  )
  return { clientId, unitId, couponId, userId, authUserId }
}

// ----- Individual upserters --------------------------------------------------

async function ensureClient(admin: SupabaseClient): Promise<string> {
  const { data: existing } = await admin
    .from("clients")
    .select("id")
    .eq("client_name", SEED.clientName)
    .maybeSingle()
  if (existing) return (existing as { id: string }).id

  const { data, error } = await admin
    .from("clients")
    .insert({
      client_name: SEED.clientName,
      email: "playwright@example.test",
      contact_number: "+27000000000",
      status: "Active",
      allow_coupons: true,
      collect_payment_at_unit: false,
      bill_monthly: false,
      skip_patient_metrics: false,
      nurse_verification: false,
    })
    .select("id")
    .single()
  if (error || !data) {
    throw new Error(`[seed] Failed to create client: ${error?.message}`)
  }
  return (data as { id: string }).id
}

async function ensureUnit(admin: SupabaseClient, clientId: string): Promise<string> {
  const { data: existing } = await admin
    .from("units")
    .select("id")
    .eq("unit_name", SEED.unitName)
    .eq("client_id", clientId)
    .maybeSingle()
  if (existing) return (existing as { id: string }).id

  const { data, error } = await admin
    .from("units")
    .insert({
      unit_name: SEED.unitName,
      client_id: clientId,
      status: "Active",
    })
    .select("id")
    .single()
  if (error || !data) {
    throw new Error(`[seed] Failed to create unit: ${error?.message}`)
  }
  return (data as { id: string }).id
}

async function ensureUser(
  admin: SupabaseClient
): Promise<{ userId: string; authUserId: string }> {
  const email = pinToEmail(SEED.user.pin)

  // 1. public.users — keyed by the synthetic email (also unique on pin in
  // most envs; we look up by email to dodge that ambiguity).
  const { data: existing } = await admin
    .from("users")
    .select("id, auth_user_id")
    .eq("email", email)
    .maybeSingle()

  let userId: string
  let authUserId: string | null = null

  if (existing) {
    userId = (existing as { id: string; auth_user_id: string | null }).id
    authUserId = (existing as { id: string; auth_user_id: string | null }).auth_user_id
  } else {
    // NB: public.users.pin was dropped in migration 010 — the synthetic
    // email + auth.users password is now the only source of PIN truth.
    const { data, error } = await admin
      .from("users")
      .insert({
        first_names: SEED.user.firstNames,
        surname: SEED.user.surname,
        email,
        contact_number: "+27000000001",
        role: SEED.user.role,
        status: "Active",
      })
      .select("id")
      .single()
    if (error || !data) {
      throw new Error(`[seed] Failed to create user: ${error?.message}`)
    }
    userId = (data as { id: string }).id
  }

  // 2. auth.users — create-or-find via admin API, then link.
  if (!authUserId) {
    const created = await admin.auth.admin.createUser({
      email,
      password: SEED.user.pin,
      email_confirm: true,
      user_metadata: {
        app_user_id: userId,
        first_names: SEED.user.firstNames,
        surname: SEED.user.surname,
        role: SEED.user.role,
      },
    })
    if (created.error) {
      const msg = (created.error.message || "").toLowerCase()
      if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
        // Walk listUsers to find the existing auth row.
        let page = 1
        let found: { id: string } | null = null
        while (page <= 10 && !found) {
          const { data: list, error: listErr } = await admin.auth.admin.listUsers({
            page,
            perPage: 1000,
          })
          if (listErr) {
            throw new Error(`[seed] Failed to list auth users: ${listErr.message}`)
          }
          found = list.users.find((u) => u.email === email) ?? null
          if (list.users.length < 1000) break
          page++
        }
        if (!found) {
          throw new Error(`[seed] Auth user "${email}" reported as existing but not found`)
        }
        authUserId = found.id
      } else {
        throw new Error(`[seed] Failed to create auth user: ${created.error.message}`)
      }
    } else {
      authUserId = created.data.user.id
    }

    const { error: linkErr } = await admin
      .from("users")
      .update({ auth_user_id: authUserId })
      .eq("id", userId)
    if (linkErr) {
      throw new Error(`[seed] Failed to link auth_user_id: ${linkErr.message}`)
    }
  }

  return { userId, authUserId: authUserId as string }
}

async function ensureUserUnit(
  admin: SupabaseClient,
  userId: string,
  unitId: string
): Promise<void> {
  const { data: existing } = await admin
    .from("user_units")
    .select("user_id")
    .eq("user_id", userId)
    .eq("unit_id", unitId)
    .maybeSingle()
  if (existing) return

  const { error } = await admin
    .from("user_units")
    .insert({ user_id: userId, unit_id: unitId })
  // Re-running can race with a concurrent seed in CI — treat unique-violation
  // as success.
  if (error && !/duplicate|unique/i.test(error.message)) {
    throw new Error(`[seed] Failed to link user_units: ${error.message}`)
  }
}

async function ensureCoupon(
  admin: SupabaseClient,
  clientId: string,
  createdBy: string
): Promise<string> {
  const { data: existing } = await admin
    .from("coupons")
    .select("id, client_id, status, discount_type, discount_value")
    .eq("code_lower", SEED.couponCode.toLowerCase())
    .maybeSingle()

  if (existing) {
    const row = existing as {
      id: string
      client_id: string | null
      status: string
      discount_type: string
      discount_value: number
    }
    // Repair drift — make sure the row still matches what the test expects.
    const needsUpdate =
      row.client_id !== clientId ||
      row.status !== "active" ||
      row.discount_type !== "percentage" ||
      Number(row.discount_value) !== 100
    if (needsUpdate) {
      console.warn(
        `[seed] Coupon "${SEED.couponCode}" drifted from test-expected values (` +
          `client_id=${row.client_id} status=${row.status} ` +
          `type=${row.discount_type} value=${row.discount_value}). ` +
          `Reverting. If you intentionally edited this row in dev, rename it ` +
          `or change SEED.couponCode.`
      )
      const { error } = await admin
        .from("coupons")
        .update({
          client_id: clientId,
          status: "active",
          discount_type: "percentage",
          discount_value: 100,
        })
        .eq("id", row.id)
      if (error) {
        throw new Error(`[seed] Failed to repair coupon: ${error.message}`)
      }
    }
    return row.id
  }

  const { data, error } = await admin
    .from("coupons")
    .insert({
      code: SEED.couponCode,
      description: "Playwright test fixture — 100% off, scoped to the test clinic.",
      discount_type: "percentage",
      discount_value: 100,
      client_id: clientId,
      status: "active",
      created_by: createdBy,
    })
    .select("id")
    .single()
  if (error || !data) {
    throw new Error(`[seed] Failed to create coupon: ${error?.message}`)
  }
  return (data as { id: string }).id
}
