/* eslint-disable no-console */
// =============================================================================
// PayFast ITN happy path (backlog C2)
//
// HOW TO RUN
// -----------
// First time (creates seeded fixtures in the dev Supabase):
//
//     cd booking-app
//     PLAYWRIGHT_SEED=1 npx playwright test payfast-itn-happy-path.spec.ts --project=chromium
//
// Subsequent runs (re-uses the seeded fixtures — no DB writes from setup):
//
//     npx playwright test payfast-itn-happy-path.spec.ts --project=chromium
//
// Required env (.env.local in booking-app/):
//     NEXT_PUBLIC_SUPABASE_URL=...
//     NEXT_PUBLIC_SUPABASE_ANON_KEY=...
//     SUPABASE_SERVICE_ROLE_KEY=...        (PLAYWRIGHT_SEED=1 only)
//     PAYFAST_MERCHANT_ID=...
//     PAYFAST_MERCHANT_KEY=...
//     PAYFAST_PASSPHRASE=...
//
// WHAT THIS TEST GUARDS
// ----------------------
// The PayFast ITN (Instant Transaction Notification) is the AUTHORITATIVE
// payment confirmation for the normal-gateway path — server-to-server, signed.
// Production's /api/payfast/notify validates the ITN in four steps:
//
//   1. Signature check        → 400 reject on mismatch
//   2. Source IP check        → 400 reject on non-PayFast IP
//                               (in non-production, the localhost carve-out
//                               accepts 127.0.0.1 — see validateItnSourceIp)
//   3. Amount validation      → 400 reject on mismatch with payment_amount
//   4. Server confirmation    → POST back to PayFast's /eng/query/validate
//                               and accept only if the body is "VALID".
//
// The Playwright PayFast mock (tests/_setup/payfast-mock-server.ts) stands
// in for step 4: PAYFAST_VALIDATE_URL_OVERRIDE is pinned at the mock in
// playwright.config.ts, so production's validateItnServerConfirmation()
// fetch lands on the mock instead of real PayFast. The mock default mode
// returns "VALID" so this happy-path spec gets through cleanly.
//
// The unique invariants vs the other coupon / self-collect / monthly_invoice
// paths:
//
//   1. STATUS FLIPS to Payment Complete. `payment_type` STAYS NULL — only
//      the three PayFast-BYPASS paths (self_collect, coupon_comp,
//      monthly_invoice) stamp a value into that column. The PayFast path's
//      in-DB tell is the inverse: payment_type IS NULL AND pf_payment_id
//      IS NOT NULL. Asserting on both catches accidental cross-wiring with
//      any of the bypass paths (any of which setting payment_type would
//      mean the wrong route ran).
//
//   2. pf_payment_id is stored on the booking — used for idempotency on
//      duplicate ITNs (notify route line 181) AND for reconciliation
//      against PayFast's Transaction History API. This is the affirmative
//      "PayFast path took us here" signal.
//
//   3. payment_amount is preserved (NOT overwritten by the ITN). The amount
//      check at step 3 only rejects on mismatch; it doesn't modify the row.
//
//   4. Audit log row is written by the route as a "Payment Status" change
//      with the SYSTEM_ACTOR_ID actor (audit-log.ts:16) and entity_id =
//      booking.id. writeAuditLog is fire-and-forget, so we poll briefly.
//
//   5. The mock observes the server-confirmation POST land on
//      /eng/query/validate with our m_payment_id — proof step 4 actually
//      ran end-to-end (it's the only network call inside the notify route
//      we can observe externally).
//
// SCOPE GUARDS
// -------------
// This spec covers the SUCCESS path of an ITN that means COMPLETE. The
// negative paths (bad signature, amount mismatch, server confirmation
// returning INVALID, COMPLETE arriving on an already-completed booking)
// are scoped for C4. Reconciliation via the Transaction History API is
// scoped for C5.
// =============================================================================

import { test, expect } from "@playwright/test"
import crypto from "node:crypto"

import { getAdmin } from "./_helpers/admin"
import {
  createBookingForUnit,
  getSeededIds,
  readBooking,
} from "./_helpers/fixtures"
import { signInAsSeededUser } from "./_helpers/auth"
import {
  clearPayfastMockReceived,
  getPayfastMockReceivedForBooking,
  postItnToApp,
  resetPayfastMockMode,
  signItn,
} from "./_helpers/payfast"

// PayFast item name used by the initiate route. Pinned here as a literal
// rather than imported from src/lib/payfast.ts — the Playwright test
// context doesn't have the Next.js path-alias resolver, and forking the
// constant means a production-side rename surfaces as a test failure
// rather than a silent drift.
const PAYMENT_ITEM_NAME = "CareFirst Consultation Booking"

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000"

// Force serial within the file — same reason as the other specs: the
// Next.js dev server (single process, on-demand compile) serialises
// compilation; parallel workers slamming it concurrently can trip
// Playwright's 30s timeout.
test.describe.configure({ mode: "serial" })

test.describe("PayFast ITN happy path", () => {
  // Belt-and-braces: reset mock state at the boundary so a prior test
  // that threw before its finally block ran can't poison this one.
  test.beforeEach(async () => {
    await resetPayfastMockMode()
    await clearPayfastMockReceived()
  })

  test("ITN COMPLETE flips booking to Payment Complete and stores pf_payment_id", async ({
    page,
  }) => {
    // ----- Arrange ------------------------------------------------------------
    // getSeededIds() triggers loadEnvLocal() inside getAdmin(), which is what
    // populates PAYFAST_PASSPHRASE in process.env before signItn() reads it.
    // Order matters — signItn() falls back to env when no passphrase arg is
    // passed.
    const { unitId } = await getSeededIds()
    const booking = await createBookingForUnit(unitId, "In Progress")

    // Sign in the seeded operator. The ITN itself is server-to-server (no
    // session needed — trust is signature + IP + server confirmation), but
    // signing in keeps the spec consistent with the other payment-path
    // specs and primes the dev server's auth state.
    await signInAsSeededUser(page)

    try {
      // Build the ITN form body. Field order matches what real PayFast
      // sends — merchant_id first, then m_payment_id, pf_payment_id,
      // payment_status, item_name, the three amount fields. Field order
      // doesn't matter for validation (the route parses the form into an
      // unordered map), but production's signature is computed over the
      // body in order, so the order here MUST match what we hand to
      // signItn().
      //
      // pf_payment_id is unique-suffixed so retries / re-runs don't
      // collide with each other in the audit log. Production's signature
      // is the only thing that constrains the value; we pick a recognisable
      // "TEST-PF-" prefix for grep-ability in the docker logs.
      const pfPaymentId = `TEST-PF-${crypto.randomBytes(8).toString("hex")}`

      const merchantId = process.env.PAYFAST_MERCHANT_ID
      if (!merchantId) {
        throw new Error(
          "PAYFAST_MERCHANT_ID missing from env. Set it in booking-app/.env.local."
        )
      }

      const fields: Record<string, string> = {
        merchant_id: merchantId,
        m_payment_id: booking.id,
        pf_payment_id: pfPaymentId,
        payment_status: "COMPLETE",
        item_name: PAYMENT_ITEM_NAME,
        amount_gross: "325.00",
        amount_fee: "-10.00",
        amount_net: "315.00",
      }

      const signature = signItn(fields)

      // ----- Act --------------------------------------------------------------
      const res = await postItnToApp(BASE_URL, fields, signature)

      // ----- Assert -----------------------------------------------------------
      // Route returns 200 + { ok: true, reason } on a successful flip.
      // A 400 here almost always means the signature didn't match
      // production's computeItnSignature() — read both functions
      // side-by-side if this fails. A 502 means the mock didn't return
      // "VALID" (or wasn't reachable on PAYFAST_MOCK_PORT).
      expect(
        res.status,
        "ITN POST should return 200 on the happy path"
      ).toBe(200)
      const body = (await res.json()) as { ok: boolean; reason: string }
      expect(body.ok).toBe(true)
      expect(body.reason).toMatch(/marked as Payment Complete/i)

      const final = await readBooking(booking.id)
      expect(final?.status).toBe("Payment Complete")
      // The path-distinguishing invariant has TWO halves for the PayFast
      // path:
      //   (a) pf_payment_id IS set — the affirmative tell that the ITN
      //       route is the one that flipped the row.
      //   (b) payment_type IS NULL — only the three bypass routes
      //       (self_collect, coupon_comp, monthly_invoice) ever stamp a
      //       value into payment_type. If any of those strings show up
      //       here the routes got cross-wired.
      expect(
        final?.pf_payment_id,
        "PayFast ITN must store pf_payment_id on the booking"
      ).toBe(pfPaymentId)
      expect(
        final?.payment_type,
        "PayFast path must leave payment_type NULL (only bypass paths stamp it)"
      ).toBeNull()
      // payment_amount preserved (the ITN check only validates equality;
      // the row keeps its original value, NOT amount_gross).
      expect(Number(final?.payment_amount)).toBe(325)
      // payment_confirmed_at stamped by transitionStatus() in the route.
      expect(
        final?.payment_confirmed_at,
        "payment_confirmed_at should be stamped"
      ).toBeTruthy()

      // Mock side: exactly one server-confirmation POST landed for this
      // booking. Filter by m_payment_id so we're safe against cross-spec /
      // cross-worker noise on the mock's shared `received` array.
      const received = await getPayfastMockReceivedForBooking(booking.id)
      if (received.length === 0) {
        // Most common cause of "expected 1, got 0" here is that `npm run
        // dev` was already running before Playwright started, and
        // `reuseExistingServer: true` (the local default) skipped the
        // webServer.env overrides — so PAYFAST_VALIDATE_URL_OVERRIDE
        // never got injected and the production fetch went to real
        // PayFast (which would have returned a 401 in sandbox, and the
        // notify route would have responded with a 502 transient failure
        // here). Surface the likely fix rather than a bare assertion miss.
        throw new Error(
          "PayFast mock received no server-confirmation POST for this booking. " +
            "Most likely cause: `npm run dev` was already running when " +
            "Playwright started, and `reuseExistingServer: true` skipped " +
            "the webServer.env overrides. Stop your local dev server and " +
            "let Playwright spawn its own (or set PAYFAST_VALIDATE_URL_OVERRIDE " +
            "in your shell before starting `npm run dev`). See " +
            "tests/_setup/payfast-mock-server.ts for details."
        )
      }
      expect(
        received.length,
        "mock should have received exactly one server-confirmation POST"
      ).toBe(1)
      const call = received[0]
      expect(call.method).toBe("POST")
      expect(call.path).toBe("/eng/query/validate")

      // The server-confirmation body includes every ITN field EXCEPT
      // `signature` (production strips it before posting — see
      // validateItnServerConfirmation in src/lib/payfast.ts). Confirm
      // our m_payment_id reached the mock; the booking-ID filter above
      // already implies this, but pin the key field explicitly so a
      // regression on the body shape doesn't slip through.
      const sentBody = call.body as {
        m_payment_id?: string
        payment_status?: string
        amount_gross?: string
        pf_payment_id?: string
      }
      expect(sentBody.m_payment_id).toBe(booking.id)
      expect(sentBody.payment_status).toBe("COMPLETE")
      expect(sentBody.amount_gross).toBe("325.00")
      expect(sentBody.pf_payment_id).toBe(pfPaymentId)

      // Audit log: writeAuditLog is fire-and-forget — the route returns
      // before it resolves. Poll briefly so a slow service-role write
      // doesn't flake the assertion. Mirrors the self-collect spec's
      // validated_by_user_id polling.
      const admin = getAdmin()
      type AuditRow = {
        actor_id: string
        actor_role: string
        action: string
        entity_type: string
        entity_id: string
        changes: unknown
      }
      let auditRow: AuditRow | null = null
      for (let i = 0; i < 20 && !auditRow; i++) {
        const { data } = await admin
          .from("audit_log")
          .select("actor_id, actor_role, action, entity_type, entity_id, changes")
          .eq("entity_id", booking.id)
          .eq("actor_role", "system")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
        auditRow = (data as AuditRow | null) ?? null
        if (!auditRow) await new Promise((r) => setTimeout(r, 100))
      }
      expect(
        auditRow,
        "ITN should write an audit_log row with actor_role='system'"
      ).not.toBeNull()
      expect(auditRow?.action).toBe("update")
      expect(auditRow?.entity_type).toBe("booking")
      // Sentinel SYSTEM_ACTOR_ID — pinned in audit-log.ts:16.
      expect(auditRow?.actor_id).toBe("00000000-0000-0000-0000-000000000000")
      // The route encodes the "Payment Status" change with the new value
      // "Payment Complete (ITN)" — the parenthetical disambiguates ITN-
      // triggered flips from manual confirms in the audit history. Pin
      // it so a regression that swaps it for the bare status drops the
      // ITN traceability signal.
      const changes = auditRow?.changes as
        | Record<string, { old?: unknown; new?: unknown }>
        | null
        | undefined
      expect(changes?.["Payment Status"]?.new).toBe("Payment Complete (ITN)")
      expect(changes?.["PF Payment ID"]?.new).toBe(pfPaymentId)
    } finally {
      // Audit-log rows for this booking are cleaned up via the booking's
      // FK cascade (audit_log has no FK to bookings — entity_id is a
      // free-form text/uuid column), so they survive. That's fine: they
      // carry the "TEST-PF-" prefix in the changes JSON and are easy to
      // grep / wipe by hand. Booking row cleanup is sufficient for the
      // re-runnability invariant tests care about.
      await booking.cleanup()
      await clearPayfastMockReceived()
    }
  })
})
