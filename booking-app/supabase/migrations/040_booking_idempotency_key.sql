-- =============================================================================
-- Migration 040 — bookings.idempotency_key + partial unique index + created_by
--
-- WHY
-- A production duplicate-booking incident (Lucky Mokoena, 2026/06/01 14:14) was
-- patched in D19 with client-side double-click guards only. The booking create
-- still ran as a direct browser → Supabase insert with no server-side
-- deduplication. D20 moves the create behind /api/bookings/create so it can be
-- rate-limited, audited centrally, and made idempotent at the database layer.
--
-- WHAT THIS DOES
-- 1. Adds a nullable `idempotency_key` text column to bookings. The new
--    create route stamps it with the client-supplied X-Idempotency-Key (a
--    UUID minted once per submit attempt). NULL for every legacy row and for
--    any create that omits the header — those keep working unchanged.
-- 2. A partial UNIQUE index on (idempotency_key) WHERE idempotency_key IS NOT
--    NULL. This is what makes a retried submit (double-click, network retry,
--    React re-fire) collapse onto the first insert instead of creating a
--    second booking: the second insert with the same key hits a 23505 unique
--    violation, which the route catches and resolves to the original row.
--
-- NOTE — we deliberately do NOT add a unique index on
-- (id_number, unit_id, status). That would block legitimate re-bookings
-- (a patient who books, completes, and returns the same day). Idempotency is
-- scoped to a single submit attempt via the per-attempt key, not to the
-- patient identity.
--
-- 3. Adds a nullable `created_by` uuid column stamping the user id of the
--    operator who created the booking. The create route scopes its
--    abandon-prior step to `created_by = caller AND status = 'In Progress'`,
--    faithfully preserving the pre-D20 behaviour where the store abandoned only
--    the operator's OWN previous draft (tracked client-side as activeBookingId).
--    Without this column the server can only scope abandon by unit, which would
--    clobber a *different* operator's in-progress draft on a shared unit. NULL
--    for every legacy row (no backfill — only matters for the abandon-prior
--    lookup on new creates). Plain uuid, no FK: mirrors audit_log.actor_id,
--    keeps legacy NULLs unconstrained, and avoids coupling to a users-table PK
--    shape. Read by the route only; never surfaced in the UI.
--
-- RLS: no policy change. The create route writes via the service-role client
-- (getSupabaseAdmin), which bypasses RLS. The route replicates the RLS INSERT
-- guarantees IN CODE — status forced to 'In Progress' (mirrors migration 016)
-- and unit membership checked for non-admin callers (mirrors the
-- current_app_user_unit_ids() check in 005/016). Idempotent per project
-- convention (IF NOT EXISTS on all statements).
-- =============================================================================

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS idempotency_key text;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS created_by uuid;

-- Partial unique index: only enforced for rows that carry a key, so the
-- thousands of legacy/no-key rows (all NULL) never collide with each other.
CREATE UNIQUE INDEX IF NOT EXISTS bookings_idempotency_key_uniq
  ON public.bookings (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Supports the abandon-prior lookup (created_by + status) on every create.
-- Partial: only In-Progress rows are ever queried by this path, and they're a
-- tiny slice of the table.
CREATE INDEX IF NOT EXISTS bookings_created_by_inprogress_idx
  ON public.bookings (created_by)
  WHERE status = 'In Progress';
