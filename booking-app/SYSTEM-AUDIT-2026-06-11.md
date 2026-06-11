# System Audit — CareFirst 3rd Party Booking System

**Date:** 2026-06-11
**Scope:** Full-system, production codebase (`main`, current with deploy)
**Method:** Six specialist agents audited independent dimensions in parallel (read-only), each with scope guards to avoid overlap and to skip already-closed work. Findings consolidated and de-duplicated below.
**Auditors:** Security & Compliance · Payments & Integrations · Backend Correctness & Data Integrity · Database/RLS/Migrations · Frontend/UX/Accessibility · Performance & Operations

---

## Executive summary

The system is in **strong shape for a live pilot**. There are **no Critical vulnerabilities** and no data-loss bug in the awaited server paths. The architecture's high-trust mechanisms — real RLS, server-authority booking create, idempotent payment confirmation, SECURITY DEFINER triggers, PII-redacted logging, POPIA erasure — are correctly built and consistently applied.

The findings cluster into three themes, none of which block the pilot but all of which matter before scaling or the PayFast live cutover:

1. **Authorization edges** in the user-management surface (a unit-manager can act slightly outside their scope).
2. **Audit-trail durability** on payment paths (some money-event audit writes are fire-and-forget and can be lost) — *flagged independently by two auditors*.
3. **Operational visibility** — the box self-heals, but nothing alerts a human when something breaks at 3am.

| Severity | Count | Meaning |
|---|---|---|
| 🔴 Critical | **0** | Exploitable now; data/payment loss or PII breach |
| 🟠 High | **8** | Exploitable with conditions, or a serious correctness/compliance/ops gap |
| 🟡 Medium | **14** | Defence-in-depth gap, broken-on-some-device, or convention break |
| ⚪ Low | **13** | Hygiene / latent / scaling-cliff |

**Bottom line for the meeting:** the engineering foundation is solid and the team should be confident in it. There's a short, high-leverage punch-list (≈1–2 days of work) that closes the High items and removes the biggest operational blind spots. Most are small, surgical fixes.

---

## 🟠 High-priority findings (action before scale / go-live)

### H1 — Money-path audit writes are fire-and-forget *(corroborated: Integrations + Backend)*
**Where:** `api/payfast/notify/route.ts:255`, `api/payfast/reconcile/route.ts:318`, `api/bookings/[id]/start-consultation/route.ts:386`
**Issue:** `writeAuditLog(...)` is not `await`ed on these payment-confirmation / successful-handoff paths. On standalone/serverless Next.js the runtime can tear the request down after the response flushes, dropping the audit insert. The project's own rule (used correctly in cleanup-sweep and retention-sweep) is that slow/cron-reachable paths must await the audit write.
**Impact:** A confirmed payment or successful consult handoff may have **no audit row** — exactly the events most needed for POPIA/financial accountability.
**Fix:** `await writeAuditLog(...)` at all three sites (the calls are already inside awaited handlers).

### H2 — ITN accepts a COMPLETE payment with no amount when `amount_gross` is absent *(corroborated: Integrations + Backend)*
**Where:** `api/payfast/notify/route.ts:191-197` (mirror in `reconcile/route.ts:264-271`)
**Issue:** Amount validation is gated on `if (amountGross && ...)`. A COMPLETE ITN that omits `amount_gross` skips the tamper check entirely. The server-confirmation POST is the backstop, but in sandbox the signature step accepts without passphrase, so steps 1+3 are weaker than they appear.
**Impact:** Defence-in-depth hole on the payment-integrity path; must be closed before real money flows.
**Fix:** If `payment_status === "COMPLETE"` and `amount_gross` is missing/empty → reject 400. Apply the same to reconcile.

### H3 — `unit_manager` can assign a user to units they don't own
**Where:** `api/admin/users/[id]/route.ts:118-153`
**Issue:** `callerCanAccessUser()` checks the target's *current* units, but the `unitIds` array in the PATCH body is applied wholesale with no check that the caller belongs to each requested unit.
**Impact:** A unit-manager can move a staff member into a foreign unit, expanding their effective reach beyond their authority.
**Fix:** For non-admins, intersect `body.unitIds` with `caller.unitIds` and reject any unit not in the caller's set.

### H4 — Browser-side discard bypasses the state machine and can discard *terminal* bookings
**Where:** `src/lib/booking-store.tsx:605-612` (enabled by `migrations/011:78,104`)
**Issue:** `discardBooking` does a direct `update({status:"Discarded"}).eq("id",id)` with **no status guard** (unlike `abandonBooking`). The DB trigger only blocks transitions *into* Payment Complete/Successful, not *out of* them, and `authenticated` has UPDATE on `status`. The patient-history list can invoke this against rows of any status.
**Impact:** A paid/handed-off booking can be silently moved to Discarded — distorting reports/reconciliation and dropping it from the retention-sweep's completed-records carve-out into the 30-day anonymisation set.
**Fix:** Route discard through a server endpoint using `transitionStatus(... "In Progress" → "Discarded")`; minimum stop-gap is adding `.eq("status","In Progress")` to the store call. Add a DB `OLD.status` terminal guard.

### H5 — Identity lock is bypassable on the Verify step
**Where:** `create-booking/patient-details/page.tsx:1374-1432`
**Issue:** Step 1 locks identity fields (name/ID/DOB/etc.) to prevent overwriting an established CareFirst patient, but the Step-4 "Verify your Details" screen re-renders the same fields **fully editable**. Edits there are auto-saved and persisted.
**Impact:** Defeats the lock and reproduces the exact "already registered to a different account" CareFirst handoff failure the lock exists to prevent.
**Fix:** Pass `readOnly={identityLocked}` to the verify-step identity inputs (it's a verify screen — arguably always read-only there).

### H6 — `deleteUser` swallows failures → false "deleted" success banner
**Where:** `src/lib/user-store.tsx:271-276` + `user-management/manage/page.tsx:462-468`
**Issue:** `deleteUser` logs and `return`s on a non-OK response instead of throwing (unlike `deleteClient`, which was explicitly fixed to throw). The page then unconditionally shows a success banner.
**Impact:** On a 500/RLS denial the user stays in the DB but the operator is told it was deleted — a false-success on a destructive action.
**Fix:** Make `deleteUser` throw on `!res.ok`, mirroring `deleteClient`.

### H7 — No monitoring/alerting (app down, cron stopped, payments failing)
**Where:** Operations-wide
**Issue:** `/api/health` drives Docker auto-restart, but nothing pages a human. A crash-loop, a stopped cron, or PayFast reconcile returning 500s is invisible until a patient complains. Incidents + logs are pull-only.
**Impact:** A quiet overnight failure can strand a paid booking with nobody aware until morning.
**Fix:** External uptime monitor (e.g. UptimeRobot free tier) on `https://bookings.carefirst.co.za/api/health` with email/SMS; a dead-man's-switch (e.g. healthchecks.io) pinged at the end of `booking-cron.sh` so a stopped cron alerts. ~30 min, no code change.

### H8 — Database backups are runbook-documented but not verified as deployed
**Where:** `OPERATIONS.md` "Verify Supabase Backups"
**Issue:** The runbook documents a pg_dump cron as "Option A" for Free tier, but there's no evidence it's installed on the VPS. For a live pilot holding patient PII + payment records, an unverified backup is the highest-consequence gap after alerting.
**Fix:** Confirm the live Supabase tier; if Free, install the documented pg_dump cron now and run a restore test once.

---

## 🟡 Medium-priority findings

| ID | Finding | Where | Fix |
|---|---|---|---|
| M1 | Cron has no overlap guard — an overrun run stacks a second concurrent run on 1 vCPU | `booking-cron.sh` | Wrap in `flock -n /tmp/booking-cron.lock` |
| M2 | Reconcile (+ retention sweep) also fire on **every Patient-History page visit**, multiplying load beyond the cron | `patient-history/page.tsx:485`, `retention-sweep:40-42` | Debounce mount-time reconcile (skip if last run < N min) or scope to on-screen rows |
| M3 | `unit_manager` can change a target's `clientId`/`status` cross-scope | `api/admin/users/[id]/route.ts:112-113` | Restrict `clientId` (and cross-scope `status`) to system_admin, like the role-change guard |
| M4 | `/api/bookings/audit` trusts client-supplied `changes`/`entityName` verbatim | `api/bookings/audit/route.ts:90-108` | Treat as untrusted; recompute diff server-side or clamp shape/length |
| M5 | Handoff lock can strand a paid booking in `handoff_status="in_progress"` on a crash | `start-consultation/route.ts:191-218` | Add staleness escape (re-acquire if last attempt > N min) or an admin reset path |
| M6 | `updateBooking` swallows save failures (resolves, never rejects) — flow advances on a failed save | `booking-store.tsx:590-594` | Throw on error so `handleNext` stops advancing |
| M7 | `toggleClientStatus`/`toggleUserStatus` swallow errors — failed toggle looks like success | `client-store.tsx:361`, `user-store.tsx:289` | Throw / surface an error to the page |
| M8 | PIN modal hand-rolls inputs: no paste, no per-digit aria-labels (gates the highest-trust actions) | `pin-verification-modal.tsx:140-167` | Reuse the shared `OtpInput` primitive (paste + labels) |
| M9 | `CountryCodeSelect` not keyboard/screen-reader operable (no listbox semantics, no arrow-keys/Escape) | `CountryCodeSelect.tsx:54-96` | Add listbox/option roles, keyboard nav, aria wiring |
| M10 | `FloatingInput` error not linked to input (no `aria-invalid`/`aria-describedby`) — used on every form | `floating-input.tsx:61-107` | Wire `aria-describedby` + `aria-invalid` |
| M11 | `coupons`/`coupon_uses` missing the project-standard `GRANT ... TO service_role` | `migrations/033:170-171` | Add the GRANT for parity with 007/009/013/029 |
| M12 | Redundant index — `idx_bookings_status` is fully covered by `idx_bookings_status_created_at` | `001:66` vs `018:39` | `DROP INDEX idx_bookings_status` (write-hot table) |
| M13 | No composite index for the dominant list read `(unit_id, created_at DESC)` | `032:33` | Add the composite; consider superseding plain `idx_bookings_unit_id` |
| M14 | Unbounded `select("*")` of all bookings to the client on dashboard mount (documented scaling cliff) | `booking-store.tsx:419-443` | Server-side `.range()` + streaming CSV export before any tenant > ~5k bookings |

---

## ⚪ Low-priority findings (hygiene / latent)

| ID | Finding | Where |
|---|---|---|
| L1 | Emailed pay link charges full `PAYMENT_AMOUNT`, ignoring an applied coupon (over-charge + possible ITN amount mismatch) | `app/pay/[bookingId]/page.tsx:97-100` |
| L2 | Public pay page is UUID-as-bearer (accepted by design; no PII rendered) | `app/pay/[bookingId]/page.tsx:26-60` |
| L3 | Rate limiter is process-local — fine on single container; weakens per-IP limits if scaled horizontally | `lib/rate-limit.ts:8-12` |
| L4 | Retention-sweep audit row mislabels `entityType:"user"`/`entityId:caller.id` (it anonymises bookings) | `retention-sweep/route.ts:166-169` |
| L5 | `coupons/apply` rollback can blind-delete the new coupon_use, leaving booking denorm desynced | `coupons/apply/route.ts:246-253` |
| L6 | CareFirst timeout vs network errors collapse into one incident signature | `start-consultation/route.ts:290` |
| L7 | `m_payment_id` prefix has no explicit length-headroom assertion vs PayFast's 100-char cap (safe today at ≤42) | `payfast.ts:247-249` |
| L8 | Low-value handoff indexes add write cost on the hot `bookings` table | `migrations/015:38-45` |
| L9 | No index for `id_number`/`contact_number` patient dedup/search | `migrations/001:27,43` |
| L10 | `audit_log`/`incidents` SELECT policy re-queries `users` instead of the `current_app_user_role()` helper (correct but inconsistent/per-row) | `007:30`, `029:45` |
| L11 | `release_coupon_on_abandon` fires on every bookings UPDATE, not `BEFORE UPDATE OF status` (guarded cheaply; correct) | `037:29` |
| L12 | Verify-step ID-number input skips digit cleaning/validation (subsumed by H5 fix) | `patient-details/page.tsx:1396` |
| L13 | `beforeunload` abandon uses the anon key as Bearer — usually no-ops under RLS (cron sweep is the real mechanism) | `booking-store.tsx:692-719` |
| — | `incidents` lazy-sweep on every list GET; `mem_limit:1g` OOM-kill drops in-flight requests (paired with auto-restart) | `incidents/route.ts:29`; `docker-compose.yml:20-22` |

---

## What's solid (worth telling the team)

- **Authorization is uniform and enumeration-resistant** — every route uses the correct guard; provisioning/disabled/wrong-role all collapse to one generic 403 with the real reason logged server-side only.
- **Service-role routes faithfully replicate RLS in code** — booking-mutation routes re-check unit membership and re-verify server-authority flags before every write rather than trusting the client.
- **PII discipline in logs is excellent** — patient PII is explicitly redacted from stderr; full context goes only to the RLS-protected `audit_log`.
- **PIN flows are textbook** — salted SHA-256 tokens, 15-min single-use, timing-safe compare, all-session revocation on reset, shared DB throttle so endpoint-pivoting can't bypass lockout.
- **Payment confirmation is genuinely robust** — constant-time signature compare, fail-closed IP checks, 5s server-confirm abort, correct 200/4xx/5xx retry policy, and triple-layer idempotency (pf_payment_id guard + status precondition + conditional UPDATE) so duplicate ITNs and ITN-vs-reconcile races settle cleanly in Postgres.
- **The RLS cutover is clean and the trigger rule is honoured without exception** — every SECURITY DEFINER function pins `search_path`; the permissive scaffold was fully dropped; partial-index discipline is consistent.
- **Strong deploy/rollback story** — image-tag-per-deploy, DB-verifying healthcheck, log rotation, compose drift resolved (labels in git), env via SSH `.env`.
- **The booking create + idle + payment-success hot paths show real engineering investment** — synchronous double-click ref guard + Promise dedup, memoised stores, debounced search, O(1) booking index, no client-side payment fabrication.

---

## Recommended action plan

**P0 — quick, high-leverage (≈half a day, mostly small diffs)**
- H1: `await` the three money-path audit writes.
- H2: reject COMPLETE ITN/reconcile with missing `amount_gross`.
- H6: make `deleteUser` throw on failure.
- H5: make verify-step identity fields honour the identity lock.
- H7: stand up uptime + dead-man's-switch alerting (no code).
- M1: add `flock` to the cron (one line).

**P1 — before scaling / important correctness**
- H3 + M3: tighten the user-management PATCH authorization (unit intersection + restrict clientId/status).
- H4: close the discard terminal-state hole (server route + status guard + DB guard).
- M5: handoff-lock staleness escape so a crash can't permanently strand a paid booking.
- M6/M7: stores throw on failure (booking update + status toggles).
- H8: verify/instate DB backups + one restore test.

**P2 — hygiene, accessibility, scaling prep**
- M8/M9/M10: accessibility pass on PIN modal, CountryCodeSelect, FloatingInput.
- M2 + M14: debounce mount-time reconcile; plan server-side pagination + streaming CSV before ~5k bookings.
- M11/M12/M13: DB GRANT parity + index cleanup + the `(unit_id, created_at DESC)` composite.
- L-series as the relevant files are next touched.

---

## PayFast sandbox → live cutover readiness

Must fix/verify before flipping `PAYFAST_TEST_MODE=false`:

1. **H2** — close the missing-amount gap (the sandbox passphrase-optional signature branch hardens at go-live, but the amount gap remains).
2. **H1** — await the ITN + reconcile audit writes (a live payment with no audit row is a compliance problem).
3. Verify the **live signature includes the passphrase** end-to-end against a real transaction (sandbox dual-accept masks signature bugs).
4. Confirm the **Transaction History 401 clears** on live creds (the reconcile safety net).
5. Confirm `getAppUrl()` resolves to `https://bookings.carefirst.co.za` so `notify_url`/`return_url` are correct.

*(These dovetail with the outstanding business items: Nic's credentials, Jean enabling ITN + the dashboard's default notify URL, and the Q3 go-live timing.)*

---

## Methodology note

This audit was performed by six specialist agents working in parallel, each scoped to a single dimension with explicit guards to avoid double-counting and to skip already-closed hardening work (real-RLS migration, CSRF, rate limiting, HSTS/HTTPS, double-click guard, server-authority create, ITN abort, E.164, client_code, retention sweep, CSV injection guard). Findings H1 and H2 were independently surfaced by two auditors, which raises confidence they're real. All findings are read-only observations — **no code was modified during the audit.** Severity reflects exploitability/impact at the current pilot posture (single container, PayFast sandbox).
