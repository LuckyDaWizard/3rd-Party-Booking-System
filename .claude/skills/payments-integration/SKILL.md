---
name: Payments & CareFirst Integration
description: Implement or review payment processing (PayFast) and the CareFirst Patient SSO handoff for the 3rd Party Booking System. Use when handling payment webhooks, reconciliation, CareFirst auto-register calls, or writing payment/integration tests. Money and patient data are involved — these rules are mandatory.
---

# Payments & CareFirst Integration

Rules for the highest-risk parts of the system: PayFast payment processing and the CareFirst Patient SSO handoff. Bugs here cost money or expose patient data, so treat every rule as mandatory.

The two outbound integrations:

- **PayFast** — South African payment gateway. ITN webhook (push) plus Transaction History Query API (pull for reconcile). Currently in **sandbox** during pilot; see memory `project_payfast_mode`.
- **CareFirst Patient SSO** — single outbound call `POST /api/external/client-sso/auto-register` on Start Consult. The boundary out of our system.

No third practice-management API. No Zod. No Supabase Edge Functions. The codebase uses Next.js 16 App Router with `.ts` API routes running on Node 20 in production.

---

## PayFast payment processing

### Money format

- **PayFast amounts are Rand strings with two decimals** (e.g. `"325.00"`). Not floats, not integer cents.
- Source of truth: `PAYMENT_AMOUNT = "325.00"` in `src/lib/payfast.ts`. Import and reference this constant; never hard-code `325` or `325.00` anywhere else (the payment page used to drift — see Sprint C CH4).
- When reading `payment_amount` from the bookings row, the value comes back as a Postgres numeric; coerce with `Number(row.payment_amount)` if you need arithmetic.

### Webhook + idempotency

- **ITN handler is the authoritative payment-confirmation path.** Validates PayFast's signature, checks the merchant ID + status, then flips the booking via `transitionStatus()` (the state machine) — never via raw `.update({ status })`.
- **Idempotency via upsert / conditional UPDATE.** The state machine's `transitionStatus(admin, id, fromStatus, toStatus, patch)` does a conditional `UPDATE ... WHERE status = fromStatus`, so duplicate ITNs land as 0-row updates and short-circuit cleanly. Coupon-apply uses the same pattern (`upsert` with `onConflict: "booking_id"` since Sprint A C5).
- Server-side amount validation: ITN handler must verify `m_payment_id` matches our booking + reported amount matches `payment_amount` on the row. Mismatch is treated as a forged ITN and rejected with audit-log entry.

### Reconciliation

- Reconcile route (`POST /api/payfast/reconcile`) is the safety net for when ITN fails to land.
- **Bounded-concurrency pool** since Sprint A C6: chunks of 5 in flight per cron tick. Don't widen back to "all at once" — PayFast may throttle. Don't narrow to serial — 1 vCPU box blocks the event loop too long.
- Currently emits `payfast:reconcile:query-failed` 401 incidents in sandbox — that's expected sandbox behaviour, **not a bug**. See memory `project_payfast_mode` + Engineering Status B6/B7.

### Credentials + sandbox status

- PayFast credentials live in environment variables: `PAYFAST_MERCHANT_ID`, `PAYFAST_MERCHANT_KEY`, `PAYFAST_PASSPHRASE`, `PAYFAST_TEST_MODE`. Managed via the Hostinger Docker Manager env panel.
- Current production state: **sandbox** (`PAYFAST_TEST_MODE=true` with the public sandbox merchant credentials). No real money flows.
- Promotion checklist for production cutover: Engineering Status B7.
- Demo credentials reference file (`.claude/Demo Payfast Credentils.txt`) is git-ignored; never commit credential strings.

---

## CareFirst Patient SSO handoff

### Contract

- **Single outbound call:** `POST https://<api>/api/external/client-sso/auto-register` with `x-api-key` header. Fired by `src/lib/carefirst.ts` → `callSsoAutoRegister()`.
- Payload shape is pinned by CareFirst's published TypeScript interface + Postman collection (the canonical files live in the project root). Don't add fields without explicit confirmation from CareFirst — `additionalScriptEmail` and `user.vitals` were proposed but later **reverted** because CareFirst hadn't confirmed the schema.
- Payload builder: `buildSsoPayload(config, booking)` in `src/lib/carefirst.ts:175-212`. Single source of truth for field mapping (DB snake_case → SSO camelCase + enums).
- `uniqueReference` is the booking UUID. Idempotency on CareFirst's side should key off it — but the contract on retries isn't explicitly pinned; ask CareFirst before assuming.

### Multi-client routing

- Currently `clientCode` + `planCode` come from a **single env var** (`CAREFIRST_CLIENT_CODE` / `CAREFIRST_CLIENT_PLAN_CODE`). Every booking routes to the same CareFirst account regardless of which client (Local Choice, etc.) captured it.
- This is the only real architecture gap left. Engineering Status B1: add `carefirst_client_code` / `carefirst_plan_code` columns to the `clients` table and resolve per-booking via `unit.client_id`. Until that ships, do not add new code paths that assume per-client routing.

### Timeout + error handling

- **5-second timeout** via `AbortSignal.timeout(5000)`. Distinguished from generic network errors via `isAbortOrTimeout()` so the operator sees "CareFirst did not respond in time" instead of waiting 30s.
- 502/503/504 from CareFirst → friendly "service unavailable" message (it's their infra). Other 4xx/5xx → parse `displayMessage` / `errorMessage` / `message` / `error` / `detail` / `title` defensively (CareFirst hasn't pinned a stable error shape).
- Success without a `redirectUrl` → mark Successful but show a contact-support banner. Don't fail; CareFirst did register, we just don't have a link to open.

### Idempotency on the booking row

- On success: store `handoff_redirect_url`, `external_reference_id`, `handed_off_at`, flip `status = "Successful"`, set `handoff_status = "sent"`.
- A second Start Consult click on a `Successful` booking re-uses the stored `handoff_redirect_url` — no second outbound call. This is the only safe pattern for the retry case; never re-fire SSO auto-register against a booking we've already handed off.

---

## Required test scenarios

Payment and SSO-handoff code must have Playwright coverage of, at minimum:

| Scenario | Status | Why |
|---|---|---|
| Successful PayFast payment → ITN → status flips to Payment Complete | ❌ Not covered | Core revenue path |
| Self-collect mark-as-paid (PIN-gated) | ❌ Not covered | Alternate payment path |
| Monthly invoice auto-mark | ❌ Not covered | Alternate payment path |
| Coupon apply normal (discount, still pays via PayFast) | ❌ Not covered | Sprint A C4/C5 paths |
| **Coupon apply R0 → `complete-coupon-comp` bypasses PayFast** | ✅ **Covered** (B3, 2026-06-08, `tests/coupon-r0-happy-path.spec.ts`) | The unique flow that skips the gateway |
| **Coupon apply on an Abandoned booking → resumes to In Progress** | ✅ **Covered** (B3, 2026-06-08, same spec) | 2026-06-05 hotfix |
| Duplicate ITN → no double-status-flip | ❌ Not covered | Idempotency |
| Amount mismatch in ITN → rejected with audit-log entry | ❌ Not covered | Forged-ITN defence |
| PayFast Transaction History API timeout → incident recorded, batch continues | ❌ Not covered | Reconcile error path |
| CareFirst auto-register 5-second timeout → friendly message, booking stays Payment Complete | ❌ Not covered | Handoff retry safety |
| CareFirst returns 502 → operator-facing "unavailable" message | ❌ Not covered | Gateway error handling |
| Start Consult on already-Successful booking → returns cached redirect URL, no second outbound call | ❌ Not covered | Handoff idempotency |

The two ✅ rows shipped 2026-06-08 as B3. See [[project_playwright_setup]] for the test infrastructure (idempotent service-role seed, canonical sign-in pattern, CSRF on `page.request`). The rest are open follow-ups.

Mock the PayFast and CareFirst APIs at the network boundary via Playwright's `page.route()`. Don't mock inside `src/lib/payfast.ts` or `src/lib/carefirst.ts` — that's testing implementation, not behaviour.

Use realistic fixtures: a valid SA ID that passes Luhn (`8701015800084` is the canonical test value), plausible names + emails using `.test` domains so they don't collide with real ones, Rand amounts as strings.

---

## Things to use, not reinvent

Before adding new payment / handoff code, check the existing helpers:

| Need | Use |
|---|---|
| Build PayFast initiate URL + signature | functions in `src/lib/payfast.ts` |
| Validate ITN signature | `validatePayfastSignature()` in `src/lib/payfast.ts` |
| Query PayFast Transaction History | `findCompletedPayfastTransaction()` in `src/lib/payfast.ts` |
| Build SSO payload | `buildSsoPayload(config, booking)` in `src/lib/carefirst.ts` |
| Call CareFirst auto-register | `callSsoAutoRegister(config, payload)` in `src/lib/carefirst.ts` |
| Flip booking status | `transitionStatus(admin, id, from, to, patch)` in `src/lib/booking-state-machine.ts` |
| Snapshot operator on a high-stakes action | `recordBookingValidator()` in `src/lib/booking-validator.ts` |
| Record upstream failure as an incident | `recordIncident({ signature, source, category, title, errorMsg, bookingId })` — wraps the SECURITY DEFINER `record_incident` RPC (migration 039), single round-trip |
| Audit-log a payment / handoff event | `writeAuditLog({ ... })` from `src/lib/audit-log.ts` with `bookingRef(id)` in the entity name |
| Standard error response | `apiError(message, status)` from `src/lib/api-response.ts` |
| Auth + role guard | `requireAuthenticated()` / `requireAdminOrManager()` / `requireSystemAdmin()` from `src/lib/api-auth.ts` |
| Build outbound URLs (return_url, email links) | `getAppUrl()` from `src/lib/app-url.ts` — never read `process.env.NEXT_PUBLIC_APP_URL` directly |

---

## Review-gate blockers

Block a merge if any of the following are missing on payment or SSO-handoff changes:

- Server-side amount validation against the bookings row
- Idempotency: ITN handler tolerates duplicates, Start Consult re-uses cached redirect URL on Successful
- Rand-string format for all PayFast amounts (never floats, never cents)
- Status changes go through `transitionStatus()`, not raw `.update({ status })`
- **Unit-scope IDOR guard:** `caller.role !== "system_admin" && !caller.unitIds.includes(booking.unit_id)` → `403 Forbidden`. Mirrors `mark-self-collect`. Mandatory on any route that mutates a booking belonging to a unit. Coupons apply/remove got this 2026-06-08 (B5, commit `515f446`).
- Audit-log entry on every state-changing payment / handoff event, with `bookingRef(id)` in entity_name (never raw UUIDs in console.log)
- PII not logged to stderr (lessons from audit #2 — no `firstName`, `idNumber`, `nationality`, etc. in `console.error`)
- Credentials read from env vars (never inline), and any new env var is documented in the deployment memory
- Playwright coverage for the new code path: at minimum the happy path + one error path. See [[project_playwright_setup]] for the canonical patterns.
- For migrations: idempotent (`IF NOT EXISTS` / `OR REPLACE FUNCTION`), forward-only, never rename an existing migration number

---

## Cross-references

- Memory: `project_payfast`, `project_payfast_mode`, `project_payfast_reconcile`, `project_carefirst_handoff`, `project_security_hardening`, `project_coupons`, `project_playwright_setup`
- Reports KB: `/reports/sso-auto-register`, `/reports/payfast-payment-didnt-reflect`, `/reports/status-lifecycle`, `/reports/booking-flow`
- Engineering Status: B1 (multi-client clientCode routing), B6 (sandbox reconcile 401 — not a bug), B7 (production cutover checklist), D10 (CareFirst SSO mock for end-to-end test coverage)