/* eslint-disable no-console */
// =============================================================================
// client-code-validation.spec.ts — server-authority validation of
// clients.client_code on the admin routes.
//
// POST   /api/admin/clients         creates a client (clientCode optional)
// PATCH  /api/admin/clients/[id]    updates a client (clientCode optional)
//
// Both routes uppercase-trim a present code, format-check it via
// isValidClientCode (→ 400 on a bad format), and rely on the partial unique
// index from migration 041 to surface a duplicate as a 23505 → 409. An
// absent / empty / null code is allowed (the column is nullable).
//
// AUTH: system_admin only. The seeded Playwright Tester is system_admin, so
// signInAsSeededUser gives us a session that clears the guard. CSRF is the
// double-submit cookie pattern (page.request + manual x-csrf-token), same as
// phone-e164.spec.ts / coupon-normal-discount.spec.ts.
//
// MIGRATION DEPENDENCY: needs migration 041 (clients.client_code column +
// format CHECK + partial unique index) applied to the dev Supabase. Without it
// the create write fails and these tests error out — see the note returned to
// the orchestrator.
//
// CLEANUP: every created client is deleted via service-role in a finally block
// so the dev DB doesn't accumulate "Playwright CC" rows.
//
// HOW TO RUN:
//     cd booking-app
//     $env:PLAYWRIGHT_SEED=1; npx playwright test client-code-validation --project=chromium --workers=1
// =============================================================================

import { test, expect } from "@playwright/test"
import crypto from "node:crypto"

import { getAdmin } from "./_helpers/admin"
import { readCsrfToken, signInAsSeededUser, CSRF_HEADER_NAME } from "./_helpers/auth"

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000"

interface CreateResponse {
  id?: string
  error?: string
}

/** Unique, grep-able client name so parallel/back-to-back runs don't collide. */
function uniqueClientName(): string {
  return `Playwright CC ${crypto.randomBytes(4).toString("hex")}`
}

/**
 * Generate a fresh VALID client code (3–5 uppercase alnum) that's very unlikely
 * to collide with another run. 4 base36 chars uppercased gives a 4-char code.
 */
function uniqueValidCode(): string {
  return crypto.randomBytes(3).toString("hex").slice(0, 4).toUpperCase()
}

async function deleteClient(id: string): Promise<void> {
  const admin = getAdmin()
  await admin.from("clients").delete().eq("id", id)
}

test.describe.configure({ mode: "serial" })

test.describe("Client code — admin-route validation", () => {
  // ---------------------------------------------------------------------------
  // Test 1 — POST with a bad-format code → 400, no client created.
  // ---------------------------------------------------------------------------
  test("POST /api/admin/clients rejects a bad-format client code with 400", async ({
    page,
    context,
  }) => {
    // ----- Arrange ------------------------------------------------------------
    await signInAsSeededUser(page)
    const csrf = await readCsrfToken(context)
    const clientName = uniqueClientName()

    // ----- Act ----------------------------------------------------------------
    // "ab" is too short AND lowercase — guaranteed to fail isValidClientCode.
    const res = await page.request.post(`${BASE_URL}/api/admin/clients`, {
      headers: { "Content-Type": "application/json", [CSRF_HEADER_NAME]: csrf },
      data: { clientName, clientCode: "ab" },
    })

    // ----- Assert -------------------------------------------------------------
    expect(res.status(), "bad-format code should be a 400").toBe(400)
    const body = (await res.json()) as CreateResponse
    expect(body.error ?? "").toMatch(/client code/i)

    // Belt-and-braces: a 400 returns before the insert, so no row should exist
    // with this name.
    const admin = getAdmin()
    const { data: rows } = await admin
      .from("clients")
      .select("id")
      .eq("client_name", clientName)
    expect(rows ?? [], "a rejected create must not insert a client").toHaveLength(0)
  })

  // ---------------------------------------------------------------------------
  // Test 2 — POST with no code is allowed (column is nullable).
  // ---------------------------------------------------------------------------
  test("POST /api/admin/clients allows an absent client code (stored null)", async ({
    page,
    context,
  }) => {
    // ----- Arrange ------------------------------------------------------------
    await signInAsSeededUser(page)
    const csrf = await readCsrfToken(context)
    const clientName = uniqueClientName()

    let clientId: string | null = null
    try {
      // ----- Act --------------------------------------------------------------
      const res = await page.request.post(`${BASE_URL}/api/admin/clients`, {
        headers: { "Content-Type": "application/json", [CSRF_HEADER_NAME]: csrf },
        data: { clientName }, // no clientCode
      })

      // ----- Assert -----------------------------------------------------------
      expect(res.status(), "absent code should create (201)").toBe(201)
      const body = (await res.json()) as CreateResponse
      expect(body.id).toBeTruthy()
      clientId = body.id as string

      const admin = getAdmin()
      const { data: row } = await admin
        .from("clients")
        .select("client_code")
        .eq("id", clientId)
        .single()
      expect((row as { client_code: string | null }).client_code).toBeNull()
    } finally {
      if (clientId) await deleteClient(clientId)
    }
  })

  // ---------------------------------------------------------------------------
  // Test 3 — POST with a valid code is stored uppercased; a duplicate → 409.
  // ---------------------------------------------------------------------------
  test("POST /api/admin/clients stores a valid code and rejects a duplicate with 409", async ({
    page,
    context,
  }) => {
    // ----- Arrange ------------------------------------------------------------
    await signInAsSeededUser(page)
    const csrf = await readCsrfToken(context)
    const code = uniqueValidCode()
    const firstName = uniqueClientName()
    const secondName = uniqueClientName()

    let firstId: string | null = null
    let secondId: string | null = null
    try {
      // ----- Act 1: create with a valid (lowercase) code → stored uppercased --
      const res1 = await page.request.post(`${BASE_URL}/api/admin/clients`, {
        headers: { "Content-Type": "application/json", [CSRF_HEADER_NAME]: csrf },
        // Lowercase input proves the route uppercases server-side before
        // storage + uniqueness comparison.
        data: { clientName: firstName, clientCode: code.toLowerCase() },
      })

      // ----- Assert 1 ---------------------------------------------------------
      expect(res1.status(), "valid code should create (201)").toBe(201)
      const body1 = (await res1.json()) as CreateResponse
      expect(body1.id).toBeTruthy()
      firstId = body1.id as string

      const admin = getAdmin()
      const { data: row } = await admin
        .from("clients")
        .select("client_code")
        .eq("id", firstId)
        .single()
      // Stored uppercased — load-bearing: the unique index + PayFast prefix both
      // depend on the canonical uppercase form.
      expect((row as { client_code: string | null }).client_code).toBe(code)

      // ----- Act 2: a second client with the SAME code → 409 ------------------
      const res2 = await page.request.post(`${BASE_URL}/api/admin/clients`, {
        headers: { "Content-Type": "application/json", [CSRF_HEADER_NAME]: csrf },
        data: { clientName: secondName, clientCode: code },
      })

      // ----- Assert 2 ---------------------------------------------------------
      expect(
        res2.status(),
        "duplicate code should be a 409 (partial unique index)"
      ).toBe(409)
      const body2 = (await res2.json()) as CreateResponse
      expect(body2.error ?? "").toMatch(/already in use/i)

      // The collided create must not have inserted a row.
      const { data: dupRows } = await admin
        .from("clients")
        .select("id")
        .eq("client_name", secondName)
      const dupRowsArr = (dupRows as { id: string }[] | null) ?? []
      secondId = dupRowsArr[0]?.id ?? null
      expect(dupRowsArr, "a 409'd create must not insert a client").toHaveLength(0)
    } finally {
      if (firstId) await deleteClient(firstId)
      if (secondId) await deleteClient(secondId)
    }
  })

  // ---------------------------------------------------------------------------
  // Test 4 — PATCH with a bad-format code → 400; PATCH to a duplicate → 409.
  // ---------------------------------------------------------------------------
  test("PATCH /api/admin/clients/[id] rejects a bad format (400) and a duplicate code (409)", async ({
    page,
    context,
  }) => {
    // ----- Arrange ------------------------------------------------------------
    await signInAsSeededUser(page)
    const csrf = await readCsrfToken(context)
    const headers = { "Content-Type": "application/json", [CSRF_HEADER_NAME]: csrf }

    // Two clients: one holds an existing code; the other we'll try to PATCH
    // into a collision with it.
    const existingCode = uniqueValidCode()
    const holderName = uniqueClientName()
    const targetName = uniqueClientName()

    let holderId: string | null = null
    let targetId: string | null = null
    try {
      const holderRes = await page.request.post(`${BASE_URL}/api/admin/clients`, {
        headers,
        data: { clientName: holderName, clientCode: existingCode },
      })
      expect(holderRes.status()).toBe(201)
      holderId = ((await holderRes.json()) as CreateResponse).id as string

      const targetRes = await page.request.post(`${BASE_URL}/api/admin/clients`, {
        headers,
        data: { clientName: targetName }, // no code yet
      })
      expect(targetRes.status()).toBe(201)
      targetId = ((await targetRes.json()) as CreateResponse).id as string

      // ----- Act / Assert: bad format → 400 ----------------------------------
      const badRes = await page.request.patch(
        `${BASE_URL}/api/admin/clients/${targetId}`,
        { headers, data: { clientCode: "TOOLONG6" } } // 7 chars → invalid
      )
      expect(badRes.status(), "bad-format PATCH code should be a 400").toBe(400)
      expect(((await badRes.json()) as CreateResponse).error ?? "").toMatch(
        /client code/i
      )

      // The target must still have no code (the 400 returned before the write).
      const admin = getAdmin()
      const { data: stillNull } = await admin
        .from("clients")
        .select("client_code")
        .eq("id", targetId)
        .single()
      expect((stillNull as { client_code: string | null }).client_code).toBeNull()

      // ----- Act / Assert: duplicate → 409 -----------------------------------
      const dupRes = await page.request.patch(
        `${BASE_URL}/api/admin/clients/${targetId}`,
        { headers, data: { clientCode: existingCode } }
      )
      expect(dupRes.status(), "duplicate PATCH code should be a 409").toBe(409)
      expect(((await dupRes.json()) as CreateResponse).error ?? "").toMatch(
        /already in use/i
      )

      // Target still has no code — the unique-index violation rolled the write.
      const { data: afterDup } = await admin
        .from("clients")
        .select("client_code")
        .eq("id", targetId)
        .single()
      expect((afterDup as { client_code: string | null }).client_code).toBeNull()
    } finally {
      if (holderId) await deleteClient(holderId)
      if (targetId) await deleteClient(targetId)
    }
  })
})
