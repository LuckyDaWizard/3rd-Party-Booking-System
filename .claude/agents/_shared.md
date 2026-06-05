# Shared context for all subagents

> **You are one of six specialist subagents** spawned by the team lead (Claude Opus 4.7 acting as orchestrator per `/CLAUDE.md`). Read this file at the start of every task to ground your work in the current system reality.

---

## What this system actually is

The **3rd Party Booking System** is an **operator-facing intake + payment gateway** that sits in front of the **CareFirst Patient** application. Clinic operators (front-desk staff) capture a patient's details, take payment, capture vital signs, get T&Cs accepted, and hand off via SSO to CareFirst Patient where the actual consultation happens.

**Critical clarifications** — these are the things most stale references get wrong:

| Wrong (don't say) | Right (current reality) |
|---|---|
| "Patient-facing booking platform" | **Operator-facing** — clinic staff at workstations or tablets are the primary users; patients only see our UI during the intake flow |
| "GoodX API integration" | We **do not integrate with GoodX**. The downstream integration is **CareFirst Patient** via the SSO `/api/external/client-sso/auto-register` endpoint |
| "Payment amounts as integers (cents)" | We use **Rand strings with two decimals** (e.g. `"325.00"`) — PayFast's wire format. Source of truth: `PAYMENT_AMOUNT` in `src/lib/payfast.ts` |
| "Patient accounts in Supabase Auth" | **There are no patient accounts**. Supabase Auth holds operator accounts only (system_admin, unit_manager, user). Patients never sign in |
| "Native scheduling" | Deferred per management decision. Bookings are walk-in / same-day only |
| "HTTPS pending" | Live at **https://bookings.carefirst.co.za** with Let's Encrypt auto-renewed by Traefik (2026-06-03) |
| "PayFast in production" | Currently **sandbox during pilot** — `PAYFAST_TEST_MODE=true`. See memory `project_payfast_mode` and Engineering Status B7 for promotion checklist. **Do not flag the 401 reconcile error as a bug — sandbox quirk** |

---

## Key library files every agent should know

These are the canonical places to look for existing patterns before inventing new ones.

### Server-side (`src/lib/`)

| File | What's there |
|---|---|
| `supabase-admin.ts` | Service-role client (`getSupabaseAdmin`), `unwrapEmbed<T>()` helper for PostgREST embed cardinality |
| `api-auth.ts` | `requireAuthenticated`, `requireAdminOrManager`, `requireSystemAdmin` |
| `api-response.ts` | `apiError(message, status)` — canonical error response shape used by ~225 sites |
| `audit-log.ts` | `writeAuditLog`, `bookingRef`, `getCallerIp`, `SYSTEM_ACTOR_ID` |
| `booking-state-machine.ts` | `transitionStatus()` — the only safe way to flip a booking's status (conditional UPDATE) |
| `booking-validator.ts` | `recordBookingValidator()` — snapshots who advanced a booking through a high-stakes step |
| `incidents.ts` | `recordIncident()` — single SECURITY DEFINER RPC since migration 039 |
| `carefirst.ts` | SSO payload builder, auto-register call, response parsing |
| `payfast.ts` | Initiate URL builder, ITN validation, Transaction History query, `PAYMENT_AMOUNT` constant |
| `coupons.ts` | Coupon types, `codeLookupKey`, `findCouponByCode()` helper, constraint check, discount resolver |
| `rate-limit.ts` | `createRateLimiter()` — shared per-IP / per-key throttling |
| `image-magic-bytes.ts` | `validateImageMagicBytes()` — sniffs uploaded image bytes before trusting the MIME type |
| `email.ts` | nodemailer transport + invite / PIN-reset email templates |
| `app-url.ts` | `getAppUrl()` — the **only** place to read the public base URL |

### Client-side (`src/lib/` + `src/components/`)

| File | What's there |
|---|---|
| `booking-store.tsx` | Booking list state, optimistic updates, `lastError` toast surface. Provider value is **memoised** (Sprint E) — don't break that |
| `client-store.tsx`, `unit-store.tsx`, `user-store.tsx`, `auth-store.tsx`, `sidebar-store.tsx` | Per-domain context stores following the same DB ↔ store mapping pattern |
| `use-active-client-branding.ts` | Resolves active unit → client → branding (logo, favicon, accent colour) |
| `components/ui/*` | 17+ shared primitives: `Banner`, `Button`, `ConfirmDialog`, `FloatingInput`, `FilterPill`, `OtpInput`, `StatusBadge`, `SubNav`, `TabStrip`, `StepPill`, `DesktopRow`, `DataCard`, `Sheet`, `Dialog`, `SearchInput`, `PinVerificationModal`, ... |
| `components/list-pagination.tsx` | `usePagination` hook + `ListPagination` component + `computePageWindow()` (windowed, max 7 buttons + ellipses) |

### Migrations

`booking-app/supabase/migrations/001_*.sql` through `039_*.sql`. Numbered, forward-only. **Filename collisions are permanent** — never rename a migration once committed. Latest live: 037 (release_coupon SECURITY DEFINER), 038 (coupons.code_lower generated column), 039 (record_incident RPC + partial unique index).

---

## Anti-patterns — things we DO NOT do

Memorise this list. If you're tempted to do one of these, stop:

| Don't | Do instead |
|---|---|
| `import { SupabaseClient } from "@supabase/supabase-js"` in client code | Use the project's existing client patterns; never expose service-role to the browser |
| `window.location.search` to read URL params | `useSearchParams()` from `next/navigation` (re-renders on URL change) |
| `transition-all` on hover-colour-only animations | `transition-colors` — doesn't animate layout-affecting properties |
| Raw `NextResponse.json({ error: "..." }, { status })` in API routes | `apiError(message, status)` from `api-response.ts` |
| `console.error(patient.firstName, patient.idNumber, ...)` | Use `bookingRef(id)` short reference; full context goes to `audit_log` |
| `.filter("code", "ilike", lookupKey)` on coupons | `findCouponByCode()` from `coupons.ts` (uses migration 038's `code_lower`) |
| `Array.isArray(x) ? x[0] ?? null : x` on PostgREST embeds | `unwrapEmbed<T>(x)` from `supabase-admin.ts` |
| Direct `UPDATE bookings SET status = ...` | `transitionStatus(admin, id, from, to, patch)` — conditional UPDATE with state-machine guard |
| Bare PG triggers that touch RLS-protected tables (`coupon_uses`, etc.) | `SECURITY DEFINER` + `SET search_path = public`. See memory `feedback_security_definer_triggers` |
| Add a column without `IF NOT EXISTS` | `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` — migrations must be idempotent |
| Fire-and-forget `writeAuditLog()` in slow cron paths (cleanup-sweep, retention-sweep) | `await writeAuditLog(...)` — serverless can cancel the call before it completes |
| Multi-choice `AskUserQuestion` when the user has shown evidence of a bug | Fix it. Reference memory `feedback_dont_over_ask` |
| Re-flag system audit items already closed | Read `public/system-audit.html` + memory `project_audit_closeout` first |
| Touch `docker-compose.yml` via the Hostinger UI | SSH-only deploys. The UI rewrites the file and wipes Traefik labels. See memory `project_deployment` |
| Treat the PayFast reconcile 401 as a bug | It's expected in sandbox. See memory `project_payfast_mode` |

---

## Memory — must-read pointers

Project memory lives at `~/.claude/projects/.../memory/`. The orchestrator reads these proactively; you should reference them by name in your output so you don't re-relitigate decisions.

**Feedback (mandatory behaviour rules):**
- `feedback_dont_over_ask` — don't gate fixes behind multi-choice when the user has shown evidence
- `feedback_update_memory_at_milestones` — proactively bump memory at sprint close, deploys with migrations, durable feedback
- `feedback_audit_page` — mark both copies of `system-audit.html` when finishing audit work
- `feedback_dev_server` — kill old dev server instances before restarting
- `feedback_security_definer_triggers` — RLS-touching triggers must be SECURITY DEFINER
- `feedback_nextjs_image_optimizer` — keep `images: { unoptimized: true }`; Alpine Docker has no sharp/vips
- `feedback_pattern_reuse` — reuse client-management page templates for new entity management

**Project state:**
- `project_pending_tasks` — current backlog
- `project_audit_closeout` — what's done (don't re-flag)
- `project_system_check_2026_06_05` — most recent audit + sprint summary
- `project_coupons` — coupons architecture
- `project_payfast` + `project_payfast_mode` + `project_payfast_reconcile` — PayFast integration + sandbox status
- `project_carefirst_handoff` — SSO contract
- `project_deployment` — VPS + Hostinger gotchas
- `project_vps_cron` — 15-min cron jobs
- `project_security_hardening` — security dashboard + do-not-break rules
- `project_self_collect`, `project_branding_assets`, `project_client_management_tabs` — feature shape

**Live status doc:**
- `/public/engineering-status.html` (rendered at `https://bookings.carefirst.co.za/engineering-status.html`) — current backlog (B1-B7), deferred items, recently shipped commits

---

## Team-lead protocol (you are being orchestrated)

You're being spawned by the orchestrator in `/CLAUDE.md`. The implications:

1. **Don't push to git.** The orchestrator owns the git workflow (commit + push + memory updates + Engineering Status updates). Make your changes, type-check, and return.
2. **Return a clean handoff.** Your final message must clearly state: what you changed (file paths + brief rationale), what tests pass, what's open / blocked, and any follow-ups the orchestrator should know about.
3. **Use the project's existing patterns** — see the library files table above. Inventing parallel patterns means the next person has to choose between them.
4. **Read before writing.** Always read the target file + nearest reference file before editing. The codebase has strong conventions; matching them is non-negotiable.
5. **Type-check before declaring done.** `npx tsc --noEmit` from `booking-app/` must be clean. Pre-existing warnings are documented in memory — don't add new ones.
6. **Respect scope guards.** If the orchestrator told you to skip dimensions another agent is handling, skip them — even if you see something to flag.

---

## Standard output format

Structure your final response to the orchestrator as:

```
## Summary
One sentence: what you did, what changed.

## Changes
- path/to/file.ts:42-78 — what changed and why
- path/to/other.ts — new helper added

## Verification
- `npx tsc --noEmit` clean
- (any tests run or considered)

## Open / blocked / follow-ups
- Anything the orchestrator needs to decide or track
- Memory updates the orchestrator should make
- Engineering-status backlog entries to add

## Recommended commit message
(short title + body if the change is non-trivial)
```

This format lets the orchestrator parse your work, decide on memory + status updates, and commit without re-reading your full reasoning.

---

*Last updated: 2026-06-05. If this file drifts from reality, the orchestrator should update it at the next milestone.*
