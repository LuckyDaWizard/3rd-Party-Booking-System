/* eslint-disable no-console */
// =============================================================================
// phone-e164.spec.ts — server-authority contact-number normalization on
// POST /api/bookings/create.
//
// The route (src/app/api/bookings/create/route.ts, step 7b) normalises a
// present-but-loose contact_number to canonical E.164 against the row's
// country_code (ISO-2, default "ZA") BEFORE inserting, and returns 400 when the
// number is present-but-invalid. Empty/absent numbers stay allowed. Contact
// numbers are PII that flow to CareFirst on handoff, so the server — not the
// browser — is the authority on their canonical form.
//
// Sibling of booking-create.spec.ts: same auth (signInAsSeededUser), same CSRF
// handling (page.request + manual x-csrf-token), same service-role read-back and
// per-id cleanup. We do NOT re-implement sign-in or re-test the happy-path
// create — only the normalization behaviour.
//
// COUNTRY_CODE SHAPE (load-bearing): the route passes country_code straight to
// normalizeToE164(countryCode, raw), which expects an ISO-2 code ("ZA"), NOT a
// dial code ("+27"). The current patient-details client stores countryCode as
// ISO-2 (default "ZA"), so this spec sends "ZA". See the note returned to the
// orchestrator about booking-create.spec.ts's validBody still sending "+27".
//
// MIGRATION DEPENDENCY: same as booking-create.spec.ts — needs migration 040
// (bookings.idempotency_key + created_by + partial unique index).
//
// HOW TO RUN:
//     cd booking-app
//     $env:PLAYWRIGHT_SEED=1; npx playwright test phone-e164 --project=chromium --workers=1
// =============================================================================

import { test, expect } from "@playwright/test"
import crypto from "node:crypto"

import { getAdmin } from "./_helpers/admin"
import { getSeededIds } from "./_helpers/fixtures"
import { readCsrfToken, signInAsSeededUser, CSRF_HEADER_NAME } from "./_helpers/auth"

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000"

interface CreateResponse {
  ok: boolean
  bookingId?: string
  idempotent?: boolean
  error?: string
}

function newIdempotencyKey(): string {
  return crypto.randomUUID()
}

/**
 * Canonical snake_case create body, parameterised on the contact-number pair so
 * each test supplies its own (country_code, contact_number). Mirrors the store's
 * mapBookingToDb() output; server-controlled fields are omitted/forced.
 *
 * country_code is ISO-2 ("ZA") — the shape the route feeds to normalizeToE164.
 */
function bodyWithContact(
  unitId: string,
  countryCode: string,
  contactNumber: string
): Record<string, unknown> {
  return {
    unit_id: unitId,
    search_type: "SA ID",
    id_type: "SA ID",
    id_number: "8701015800084",
    first_names: "Naledi",
    surname: "Khumalo",
    title: "Ms",
    nationality: "South African",
    gender: "Female",
    date_of_birth: "1987-01-01",
    country_code: countryCode,
    contact_number: contactNumber,
    email_address: "naledi.khumalo@example.test",
  }
}

async function deleteBooking(id: string): Promise<void> {
  const admin = getAdmin()
  await admin.from("bookings").delete().eq("id", id)
}

test.describe.configure({ mode: "serial" })

test.describe("Booking create — E.164 contact-number normalization (7b)", () => {
  // ---------------------------------------------------------------------------
  // Test 1 — a loose ZA number is stored as canonical E.164.
  // ---------------------------------------------------------------------------
  test("normalizes a loose ZA number (0821234567) to +27821234567 before storage", async ({
    page,
    context,
  }) => {
    // ----- Arrange ------------------------------------------------------------
    const { unitId } = await getSeededIds()
    await signInAsSeededUser(page)
    const csrf = await readCsrfToken(context)

    let bookingId: string | null = null

    try {
      // ----- Act --------------------------------------------------------------
      const res = await page.request.post(`${BASE_URL}/api/bookings/create`, {
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER_NAME]: csrf,
          "X-Idempotency-Key": newIdempotencyKey(),
        },
        data: bodyWithContact(unitId, "ZA", "0821234567"),
      })

      // ----- Assert -----------------------------------------------------------
      expect(res.status(), "loose-but-valid number should create (200)").toBe(200)
      const body = (await res.json()) as CreateResponse
      expect(body.ok).toBe(true)
      expect(body.bookingId).toBeTruthy()
      bookingId = body.bookingId as string

      // Read back the STORED value — the load-bearing assertion. The trunk-0
      // local form must be persisted as canonical E.164, not as typed.
      const admin = getAdmin()
      const { data: row } = await admin
        .from("bookings")
        .select("contact_number")
        .eq("id", bookingId)
        .single()
      expect(row, "created booking row must exist").not.toBeNull()
      expect((row as { contact_number: string }).contact_number).toBe("+27821234567")
    } finally {
      if (bookingId) await deleteBooking(bookingId)
    }
  })

  // ---------------------------------------------------------------------------
  // Test 2 — an already-canonical number is stored unchanged.
  // ---------------------------------------------------------------------------
  test("stores an already-E.164 number (+27821234567) unchanged", async ({
    page,
    context,
  }) => {
    // ----- Arrange ------------------------------------------------------------
    const { unitId } = await getSeededIds()
    await signInAsSeededUser(page)
    const csrf = await readCsrfToken(context)

    let bookingId: string | null = null

    try {
      // ----- Act --------------------------------------------------------------
      const res = await page.request.post(`${BASE_URL}/api/bookings/create`, {
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER_NAME]: csrf,
          "X-Idempotency-Key": newIdempotencyKey(),
        },
        data: bodyWithContact(unitId, "ZA", "+27821234567"),
      })

      // ----- Assert -----------------------------------------------------------
      expect(res.status()).toBe(200)
      const body = (await res.json()) as CreateResponse
      bookingId = body.bookingId as string
      expect(bookingId).toBeTruthy()

      const admin = getAdmin()
      const { data: row } = await admin
        .from("bookings")
        .select("contact_number")
        .eq("id", bookingId)
        .single()
      expect((row as { contact_number: string }).contact_number).toBe("+27821234567")
    } finally {
      if (bookingId) await deleteBooking(bookingId)
    }
  })

  // ---------------------------------------------------------------------------
  // Test 3 — a present-but-invalid number is rejected with 400 and no insert.
  // ---------------------------------------------------------------------------
  test("rejects a present-but-invalid contact number (123) with 400 and creates no row", async ({
    page,
    context,
  }) => {
    // ----- Arrange ------------------------------------------------------------
    const { unitId } = await getSeededIds()
    await signInAsSeededUser(page)
    const csrf = await readCsrfToken(context)
    const idempotencyKey = newIdempotencyKey()

    // ----- Act ----------------------------------------------------------------
    const res = await page.request.post(`${BASE_URL}/api/bookings/create`, {
      headers: {
        "Content-Type": "application/json",
        [CSRF_HEADER_NAME]: csrf,
        "X-Idempotency-Key": idempotencyKey,
      },
      data: bodyWithContact(unitId, "ZA", "123"),
    })

    // ----- Assert -------------------------------------------------------------
    expect(res.status(), "invalid contact number should be a 400").toBe(400)
    const body = (await res.json()) as CreateResponse
    expect(body.error ?? "").toMatch(/invalid contact number/i)

    // Belt-and-braces: a 400 returns before the insert, so no row should carry
    // this attempt's idempotency key.
    const admin = getAdmin()
    const { data: rows } = await admin
      .from("bookings")
      .select("id")
      .eq("idempotency_key", idempotencyKey)
    expect(rows ?? [], "a rejected create must not insert a booking").toHaveLength(0)
  })

  // ---------------------------------------------------------------------------
  // Test 4 — an empty contact number is allowed (the field is optional).
  // ---------------------------------------------------------------------------
  test("allows an empty contact number and stores it without normalization", async ({
    page,
    context,
  }) => {
    // ----- Arrange ------------------------------------------------------------
    const { unitId } = await getSeededIds()
    await signInAsSeededUser(page)
    const csrf = await readCsrfToken(context)

    let bookingId: string | null = null

    try {
      // ----- Act --------------------------------------------------------------
      const res = await page.request.post(`${BASE_URL}/api/bookings/create`, {
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER_NAME]: csrf,
          "X-Idempotency-Key": newIdempotencyKey(),
        },
        data: bodyWithContact(unitId, "ZA", ""),
      })

      // ----- Assert -----------------------------------------------------------
      expect(res.status(), "empty contact number is allowed (200)").toBe(200)
      const body = (await res.json()) as CreateResponse
      bookingId = body.bookingId as string
      expect(bookingId).toBeTruthy()

      // Empty stays empty — the normalize branch is skipped for blank input.
      const admin = getAdmin()
      const { data: row } = await admin
        .from("bookings")
        .select("contact_number")
        .eq("id", bookingId)
        .single()
      const stored = (row as { contact_number: string | null }).contact_number
      expect(stored === "" || stored === null).toBe(true)
    } finally {
      if (bookingId) await deleteBooking(bookingId)
    }
  })
})
