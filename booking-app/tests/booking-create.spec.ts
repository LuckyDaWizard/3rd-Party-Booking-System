/* eslint-disable no-console */
// =============================================================================
// Booking create — server-authority POST /api/bookings/create (D20)
//
// Sibling of payfast-reconcile.spec.ts. Exercises the route that replaced the
// direct browser → Supabase insert the booking store used to run. Moving the
// create server-side gives us per-user rate limiting, DB-backed idempotency,
// central audit logging, and server-forced status/current_step — none of which
// the client-side double-click guard (D19) could provide. A production
// duplicate-booking incident (Lucky Mokoena, 2026/06/01 14:14) motivated D19;
// D20 closes the underlying gap.
//
// MIGRATION DEPENDENCY:
//   This spec depends on migration 040_booking_idempotency_key.sql being
//   applied to the dev DB — it adds bookings.idempotency_key + bookings.created_by
//   plus the partial unique index. If a run errors with a missing
//   `idempotency_key` / `created_by` column ("column does not exist"), the
//   migration has not landed yet; apply it and re-run.
//
// AUTH / CSRF:
//   The route requires an authenticated, Active user. We sign in via the real
//   UI (signInAsSeededUser) and POST through page.request so the Supabase
//   session cookie rides along. The dashboard proxy enforces double-submit CSRF
//   on POST /api/bookings/* (NOT exempt), so we read the cf_csrf cookie and
//   send it as x-csrf-token — page.request does NOT trigger the app's global
//   fetch interceptor, so CSRF is attached manually (mirrors the reconcile spec).
//
// BODY SHAPE:
//   snake_case DB-column JSON — the exact shape the store sends via
//   mapBookingToDb(). unit_id is required. status / current_step / id /
//   timestamps / payment / audit fields are dropped or server-forced.
//
// HOW TO RUN:
//     cd booking-app
//     $env:PLAYWRIGHT_SEED=1; npx playwright test booking-create --project=chromium --workers=1
//     npx playwright test booking-create --project=chromium --workers=1   # re-run
// =============================================================================

import { test, expect } from "@playwright/test"
import crypto from "node:crypto"

import { getAdmin } from "./_helpers/admin"
import { getSeededIds, getSeededUserId } from "./_helpers/fixtures"
import { readCsrfToken, signInAsSeededUser, CSRF_HEADER_NAME } from "./_helpers/auth"

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000"

interface CreateResponse {
  ok: boolean
  bookingId?: string
  idempotent?: boolean
  error?: string
}

/** A fresh per-attempt idempotency key, like the store mints on each submit. */
function newIdempotencyKey(): string {
  return crypto.randomUUID()
}

/**
 * Canonical valid snake_case body the store would send. Plausible fixture
 * data: Luhn-valid SA ID, *.test email. Omits server-controlled fields
 * (status / current_step / id / payment_* / audit) — those are forced or
 * dropped by the route.
 */
function validBody(unitId: string): Record<string, unknown> {
  return {
    unit_id: unitId,
    search_type: "SA ID",
    id_type: "SA ID",
    id_number: "8701015800084",
    first_names: "Thabo",
    surname: "Mokoena",
    title: "Mr",
    nationality: "South African",
    gender: "Male",
    date_of_birth: "1987-01-01",
    contact_number: "0710000000",
    country_code: "ZA",
    email_address: "thabo.mokoena@example.test",
  }
}

/** Service-role delete by id — used to clean up every booking a test creates. */
async function deleteBooking(id: string): Promise<void> {
  const admin = getAdmin()
  await admin.from("bookings").delete().eq("id", id)
}

test.describe.configure({ mode: "serial" })

test.describe("Booking create (server-authority, D20)", () => {
  // ---------------------------------------------------------------------------
  // Test 1 — happy path: valid body + fresh key → 200 with a server-forced row.
  // ---------------------------------------------------------------------------
  test("creates an In Progress booking with server-forced fields and an audit row", async ({
    page,
    context,
  }) => {
    // ----- Arrange ------------------------------------------------------------
    const { unitId } = await getSeededIds()
    const seededUserId = await getSeededUserId()
    await signInAsSeededUser(page)
    const csrf = await readCsrfToken(context)

    const idempotencyKey = newIdempotencyKey()
    let bookingId: string | null = null

    try {
      // ----- Act --------------------------------------------------------------
      const res = await page.request.post(`${BASE_URL}/api/bookings/create`, {
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER_NAME]: csrf,
          "X-Idempotency-Key": idempotencyKey,
        },
        data: validBody(unitId),
      })

      // ----- Assert -----------------------------------------------------------
      expect(res.status(), "create should return 200").toBe(200)
      const body = (await res.json()) as CreateResponse
      expect(body.ok).toBe(true)
      expect(body.bookingId, "response must include the new booking id").toBeTruthy()
      // A fresh insert is never flagged idempotent (those cases return earlier).
      expect(body.idempotent).toBeFalsy()
      bookingId = body.bookingId as string

      // The route writes via service-role; read the row back and prove every
      // server-forced field landed and a couple of client fields persisted.
      const admin = getAdmin()
      const { data: row } = await admin
        .from("bookings")
        .select(
          "status, current_step, created_by, unit_id, idempotency_key, first_names, surname, id_number"
        )
        .eq("id", bookingId)
        .single()
      expect(row, "created booking row must exist").not.toBeNull()
      const r = row as Record<string, unknown>
      // Server-forced — never trusted from the client.
      expect(r.status).toBe("In Progress")
      expect(r.current_step).toBe("search")
      // created_by is the caller (migration 040), not anything in the body.
      expect(r.created_by).toBe(seededUserId)
      // unit_id is the authoritative validated value.
      expect(r.unit_id).toBe(unitId)
      // idempotency_key stamped from the header.
      expect(r.idempotency_key).toBe(idempotencyKey)
      // Whitelisted client fields persisted.
      expect(r.first_names).toBe("Thabo")
      expect(r.id_number).toBe("8701015800084")

      // Audit: a "create" / "booking" row authored by the real caller. Poll —
      // writeAuditLog is fire-and-forget (mirrors the reconcile spec's poll).
      type AuditRow = {
        actor_id: string
        action: string
        entity_type: string
        entity_id: string
      }
      let auditRow: AuditRow | null = null
      for (let i = 0; i < 20 && !auditRow; i++) {
        const { data } = await admin
          .from("audit_log")
          .select("actor_id, action, entity_type, entity_id")
          .eq("entity_id", bookingId)
          .eq("action", "create")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
        auditRow = (data as AuditRow | null) ?? null
        if (!auditRow) await new Promise((res2) => setTimeout(res2, 100))
      }
      expect(auditRow, "create should write an audit_log row").not.toBeNull()
      expect(auditRow?.action).toBe("create")
      expect(auditRow?.entity_type).toBe("booking")
      expect(auditRow?.actor_id).toBe(seededUserId)
    } finally {
      if (bookingId) await deleteBooking(bookingId)
    }
  })

  // ---------------------------------------------------------------------------
  // Test 2 — idempotent replay: same key twice → one row, second flagged.
  // ---------------------------------------------------------------------------
  test("replaying the same X-Idempotency-Key returns the same booking without a second insert", async ({
    page,
    context,
  }) => {
    // ----- Arrange ------------------------------------------------------------
    const { unitId } = await getSeededIds()
    await signInAsSeededUser(page)
    const csrf = await readCsrfToken(context)

    const idempotencyKey = newIdempotencyKey()
    let bookingId: string | null = null

    try {
      const headers = {
        "Content-Type": "application/json",
        [CSRF_HEADER_NAME]: csrf,
        "X-Idempotency-Key": idempotencyKey,
      }

      // ----- Act --------------------------------------------------------------
      const first = await page.request.post(`${BASE_URL}/api/bookings/create`, {
        headers,
        data: validBody(unitId),
      })
      const second = await page.request.post(`${BASE_URL}/api/bookings/create`, {
        headers,
        data: validBody(unitId),
      })

      // ----- Assert -----------------------------------------------------------
      expect(first.status()).toBe(200)
      expect(second.status()).toBe(200)
      const firstBody = (await first.json()) as CreateResponse
      const secondBody = (await second.json()) as CreateResponse
      expect(firstBody.ok).toBe(true)
      expect(secondBody.ok).toBe(true)
      bookingId = firstBody.bookingId as string

      // Both resolve to ONE booking; the replay is flagged idempotent.
      expect(secondBody.bookingId).toBe(firstBody.bookingId)
      expect(secondBody.idempotent).toBe(true)

      // Prove the DB holds exactly one row for that key — the replay did not
      // insert a second booking (the duplicate-booking bug D20 closes).
      const admin = getAdmin()
      const { data: rows } = await admin
        .from("bookings")
        .select("id")
        .eq("idempotency_key", idempotencyKey)
      expect(rows, "exactly one booking row should carry the key").toHaveLength(1)
    } finally {
      if (bookingId) await deleteBooking(bookingId)
    }
  })

  // ---------------------------------------------------------------------------
  // Test 3 — missing unit_id → 400.
  // ---------------------------------------------------------------------------
  test("rejects a body with no unit_id (400)", async ({ page, context }) => {
    // ----- Arrange ------------------------------------------------------------
    await signInAsSeededUser(page)
    const csrf = await readCsrfToken(context)

    // ----- Act ----------------------------------------------------------------
    const res = await page.request.post(`${BASE_URL}/api/bookings/create`, {
      headers: {
        "Content-Type": "application/json",
        [CSRF_HEADER_NAME]: csrf,
        // Fresh key so a prior test's key can't accidentally short-circuit
        // (unit validation runs before the body is even read, but be explicit).
        "X-Idempotency-Key": newIdempotencyKey(),
      },
      data: {
        // No unit_id.
        first_names: "Nounit",
        surname: "Patient",
        id_type: "SA ID",
        id_number: "8701015800084",
      },
    })

    // ----- Assert -------------------------------------------------------------
    expect(res.status(), "missing unit_id should be a 400").toBe(400)
    const body = (await res.json()) as CreateResponse
    expect(body.error ?? "").toMatch(/unit_id is required/i)
    // No booking should have been created — nothing to clean up. (A 400 returns
    // before any insert; we don't have an id to delete.)
  })

  // ---------------------------------------------------------------------------
  // Test 4 — unit-scope 403.
  //
  // SKIPPED. The seeded Playwright user is `system_admin` (see _setup/seed.ts),
  // and the route explicitly BYPASSES unit scoping for system_admin
  // (route.ts: `caller.role !== "system_admin" && !caller.unitIds.includes(unitId)`).
  // So a 403 cannot be triggered with the seeded caller no matter which unit we
  // target. Triggering it requires a non-admin (`user`/`unit_manager`) caller
  // who is NOT a member of the target unit, which means minting a second
  // auth.users + public.users + user_units fixture AND signing it in through the
  // PIN UI — heavyweight and brittle for one assertion. Deferred to the
  // orchestrator: either (a) add a seeded non-admin user + a unit they don't
  // belong to and assert 403 here, or (b) leave the unit-scope guard covered by
  // a route-handler unit test. The guard itself is exercised in production by
  // mark-self-collect / coupons apply, which share the same pattern.
  // ---------------------------------------------------------------------------
  test.skip("returns 403 when a non-admin creates for a unit they don't belong to", async () => {
    // Intentionally skipped — see the comment block above. The seeded user is
    // system_admin and bypasses unit scoping; no non-admin fixture exists yet.
  })

  // ---------------------------------------------------------------------------
  // Test 5 — per-user rate limit: the 11th create in the window → 429.
  //
  // ⚠️ BUCKET POISONING: the limiter (createRateLimiter max:10 / 60_000ms) is
  // process-global and keyed on caller.id. The seeded user is the only caller
  // these tests have, so once this test fires 11 creates it POISONS that user's
  // budget for ~60s. Mitigations:
  //   • This is the LAST test in the file (serial mode), so it can't starve a
  //     later create test in the same minute.
  //   • Each of the 11 gets its OWN idempotency key, so they're distinct creates
  //     (not deduped replays) and actually consume 11 slots.
  //   • Every successfully-created row is cleaned up in `finally`.
  // A separate isolated user would be cleaner, but minting + signing in a second
  // auth fixture costs more than the isolation buys here, since this is already
  // the terminal test. If the suite grows past this file, revisit.
  // ---------------------------------------------------------------------------
  test("rate-limits creates once the per-user window is exhausted (429)", async ({ page, context }) => {
    // ----- Arrange ------------------------------------------------------------
    const { unitId } = await getSeededIds()
    await signInAsSeededUser(page)
    const csrf = await readCsrfToken(context)

    const createdIds: string[] = []

    try {
      const headersBase = {
        "Content-Type": "application/json",
        [CSRF_HEADER_NAME]: csrf,
      }

      // The limiter (10/min) is keyed on the caller and is process-global with
      // a 60s window — so the earlier tests in THIS file have already spent some
      // of the seeded user's budget against the same bucket. We therefore can't
      // assert a clean "first 10 pass, 11th fails"; instead we fire MORE than
      // the cap with distinct idempotency keys and assert the robust invariants
      // that hold regardless of prior consumption:
      //   (a) at least one 429 appears — the limiter engaged, and
      //   (b) the number of allowed (200) creates never exceeds the 10/min cap.
      // Distinct keys make every request a real create attempt (not a deduped
      // replay), so each one consumes a slot.
      const ATTEMPTS = 12
      const statuses: number[] = []
      for (let i = 0; i < ATTEMPTS; i++) {
        const res = await page.request.post(`${BASE_URL}/api/bookings/create`, {
          headers: { ...headersBase, "X-Idempotency-Key": newIdempotencyKey() },
          data: validBody(unitId),
        })
        statuses.push(res.status())
        if (res.status() === 200) {
          const b = (await res.json()) as CreateResponse
          if (b.bookingId) createdIds.push(b.bookingId)
        }
      }

      // ----- Assert -----------------------------------------------------------
      const allowed = statuses.filter((s) => s === 200).length
      const limited = statuses.filter((s) => s === 429).length

      expect(
        limited,
        `expected the limiter to engage within ${ATTEMPTS} attempts; statuses=${statuses.join(",")}`
      ).toBeGreaterThan(0)
      expect(
        allowed,
        `allowed creates must never exceed the 10/min cap; statuses=${statuses.join(",")}`
      ).toBeLessThanOrEqual(10)

      // Confirm a 429 carries the expected shape (find the first limited one).
      const firstLimitedIdx = statuses.indexOf(429)
      // Re-fire one more to deterministically read a 429 body (bucket is now
      // exhausted, so this will be limited too).
      if (firstLimitedIdx >= 0) {
        const limitedRes = await page.request.post(`${BASE_URL}/api/bookings/create`, {
          headers: { ...headersBase, "X-Idempotency-Key": newIdempotencyKey() },
          data: validBody(unitId),
        })
        expect(limitedRes.status()).toBe(429)
        const body = (await limitedRes.json()) as CreateResponse
        expect(body.error ?? "").toMatch(/too many/i)
      }
    } finally {
      // Clean up every booking this test created (including abandoned-prior
      // side effects — they're all rows we inserted, deleted by id).
      for (const id of createdIds) await deleteBooking(id)
    }
  })
})
