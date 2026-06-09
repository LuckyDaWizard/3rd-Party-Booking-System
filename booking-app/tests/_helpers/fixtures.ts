// =============================================================================
// tests/_helpers/fixtures.ts
//
// Shared per-test fixtures + lookup helpers:
//  - createBookingForUnit() — service-role booking insert with cleanup
//  - readBooking() — read every commonly-asserted column from a booking row
//  - createDiscountCoupon() — service-role coupon insert with cleanup
//  - getSeededIds() — resolve seeded test client + unit
//  - getSeededUserId() — resolve seeded test user
//
// Per-test fixtures all return a `cleanup` function. Specs MUST run cleanup
// in `finally` blocks so a mid-test failure doesn't leak DB rows.
// =============================================================================

import { SEED, pinToEmail } from "../_setup/seed"
import { getAdmin } from "./admin"

// ----- Booking fixture -------------------------------------------------------

export interface CreatedBooking {
  id: string
  cleanup: () => Promise<void>
}

/**
 * Inserts a booking under the given unit with the canonical Playwright
 * patient fixture. Returns the id + a cleanup function.
 *
 * The booking is created directly via service-role rather than walking the
 * 5-step UI form. The invariants under test in the coupon / self-collect /
 * monthly-invoice specs are owned by API routes, not form steps — walking
 * the form would add flakiness without adding signal.
 */
export async function createBookingForUnit(
  unitId: string,
  initialStatus: "In Progress" | "Abandoned" = "In Progress"
): Promise<CreatedBooking> {
  const admin = getAdmin()
  const { data, error } = await admin
    .from("bookings")
    .insert({
      unit_id: unitId,
      status: initialStatus,
      current_step: "payment",
      first_names: "Playwright",
      surname: "Patient",
      id_type: "SA ID",
      // Canonical Luhn-valid SA ID per the payments-integration skill.
      id_number: "8701015800084",
      title: "Mr",
      nationality: "South African",
      gender: "Male",
      date_of_birth: "1987-01-01",
      address: "1 Test Lane",
      suburb: "Testville",
      city: "Johannesburg",
      province: "Gauteng",
      country: "South Africa",
      country_code: "+27",
      contact_number: "0710000000",
      email_address: "patient.playwright@example.test",
      payment_amount: 325.0,
      original_amount: 325.0,
    })
    .select("id")
    .single()
  if (error || !data) {
    throw new Error(`Failed to seed booking: ${error?.message}`)
  }
  const id = (data as { id: string }).id

  return {
    id,
    async cleanup() {
      // coupon_uses cascades on booking delete (migration 033 FK ON
      // DELETE CASCADE). booking_validator_* are denormalised columns
      // on bookings itself, not a separate table — no separate cleanup.
      await admin.from("bookings").delete().eq("id", id)
    },
  }
}

// ----- Booking row reader ----------------------------------------------------

/**
 * Every column any current spec asserts on. Add new columns here when a
 * new test needs them; don't fork per-spec readers. The kitchen-sink
 * approach trades a few extra bytes per read for one shared type.
 */
export interface BookingRow {
  status: string
  payment_amount: number
  original_amount: number | null
  discount_amount: number | null
  payment_type: string | null
  payment_confirmed_at: string | null
  coupon_id: string | null
  coupon_code: string | null
  handoff_status: string | null
  handoff_redirect_url: string | null
  external_reference_id: string | null
  handoff_attempt_count: number | null
  email_address: string | null
  validated_by_user_id: string | null
  validated_by_name: string | null
}

const READ_COLUMNS =
  "status, payment_amount, original_amount, discount_amount, payment_type, payment_confirmed_at, coupon_id, coupon_code, handoff_status, handoff_redirect_url, external_reference_id, handoff_attempt_count, email_address, validated_by_user_id, validated_by_name"

/**
 * Reads every commonly-asserted column from a booking row. Returns null
 * if the booking doesn't exist (e.g. cleanup ran early).
 */
export async function readBooking(bookingId: string): Promise<BookingRow | null> {
  const admin = getAdmin()
  const { data } = await admin
    .from("bookings")
    .select(READ_COLUMNS)
    .eq("id", bookingId)
    .single()
  return data as BookingRow | null
}

// ----- Coupon fixture --------------------------------------------------------

export interface CreatedCoupon {
  id: string
  code: string
  cleanup: () => Promise<void>
}

export interface CreateCouponOpts {
  discount_type: "percentage" | "fixed"
  /** Percentage 0-100, or rand amount for fixed. */
  discount_value: number
  /** Prefix for the unique code (e.g. "PLAYWRIGHT-50PCT"). */
  codePrefix: string
}

/**
 * Creates a one-off coupon scoped to the given client. The code is suffixed
 * with `Date.now()` + 4 chars of base36 to dodge the coupons.code_lower
 * unique-index collision when tests run back-to-back. Returns the id + code
 * + cleanup function.
 *
 * Cleanup deletes the coupon row; coupon_uses cascades via migration 033's
 * FK ON DELETE CASCADE.
 */
export async function createDiscountCoupon(
  clientId: string,
  createdBy: string,
  opts: CreateCouponOpts
): Promise<CreatedCoupon> {
  const admin = getAdmin()
  const suffix =
    Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6)
  const code = `${opts.codePrefix}-${suffix}`

  const { data, error } = await admin
    .from("coupons")
    .insert({
      code,
      description: `Playwright one-off ${opts.discount_type} ${opts.discount_value}`,
      discount_type: opts.discount_type,
      discount_value: opts.discount_value,
      client_id: clientId,
      status: "active",
      created_by: createdBy,
    })
    .select("id")
    .single()
  if (error || !data) {
    throw new Error(`Failed to seed coupon: ${error?.message}`)
  }
  const id = (data as { id: string }).id

  return {
    id,
    code,
    async cleanup() {
      await admin.from("coupons").delete().eq("id", id)
    },
  }
}

// ----- Seeded fixture lookup -------------------------------------------------

/**
 * Resolves the seeded Playwright Test Clinic + Test Unit IDs. The seed
 * runs in globalSetup; these IDs persist across runs.
 */
export async function getSeededIds(): Promise<{ clientId: string; unitId: string }> {
  const admin = getAdmin()
  const { data: client } = await admin
    .from("clients")
    .select("id")
    .eq("client_name", SEED.clientName)
    .maybeSingle()
  const { data: unit } = await admin
    .from("units")
    .select("id")
    .eq("unit_name", SEED.unitName)
    .maybeSingle()
  if (!client || !unit) {
    throw new Error(
      "Seeded client/unit not found. Run once with PLAYWRIGHT_SEED=1 to create them."
    )
  }
  return {
    clientId: (client as { id: string }).id,
    unitId: (unit as { id: string }).id,
  }
}

/**
 * Resolves the seeded Playwright Tester user id (system_admin role).
 * Used as the `created_by` FK for one-off coupons in tests.
 */
export async function getSeededUserId(): Promise<string> {
  const admin = getAdmin()
  const email = pinToEmail(SEED.user.pin)
  const { data } = await admin
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle()
  if (!data) {
    throw new Error(
      `Seeded user (${email}) not found. Run once with PLAYWRIGHT_SEED=1.`
    )
  }
  return (data as { id: string }).id
}
