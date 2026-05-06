-- =============================================================================
-- Migration 022 — Self-collect payment alignment
--
-- Reinstates the self-collect payment columns at the CLIENT level (the
-- earlier rolled-back work originally placed it at unit level, then moved
-- it to client; only the second move survived in the live DB).
--
-- Background — migration filename collision:
--   The rolled-back 2026-04-28 work added migrations 019/020/021. Those
--   migrations were APPLIED to production Supabase before the rollback,
--   then their files were deleted from the repo. The branding/avatar work
--   that landed in main subsequently REUSED filenames 019/020/021 for
--   different content. So:
--     * `019_user_avatars_bucket.sql`        (in repo + DB) — branding work
--     * `020_client_logo_favicon.sql`        (in repo + DB) — branding work
--     * `021_client_accent_color.sql`        (in repo + DB) — branding work
--     * `019_unit_collect_payment_at_unit`   (DB only, file gone)
--     * `020_consultation_validator_columns`(DB only, file gone)
--     * `021_move_collect_payment_to_clients`(DB only, file gone)
--   Both sets were applied — the live DB has columns from both. This
--   migration is the next contiguous file (022) and re-declares the
--   self-collect columns idempotently so a fresh checkout against a
--   fresh DB ends up with the same shape as production.
--
-- All operations are no-ops on production. Safe to re-run.
-- =============================================================================

-- 1. Client-level self-collect flag.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS collect_payment_at_unit BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.clients.collect_payment_at_unit IS
  'When TRUE, all units under this client skip the payment gateway and mark bookings as self_collect (the unit collects the consultation fee directly).';

-- 2. Validator/facilitator snapshot columns on bookings — capture WHO
--    confirmed the payment / started the consultation, in case the user
--    record is later edited or deleted.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS validated_by_user_id UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS validated_by_name    TEXT,
  ADD COLUMN IF NOT EXISTS validated_by_email   TEXT;

CREATE INDEX IF NOT EXISTS idx_bookings_validated_by_user_id
  ON public.bookings (validated_by_user_id);

COMMENT ON COLUMN public.bookings.validated_by_user_id IS
  'FK to the user who validated the payment / started the consultation. Snapshot — name and email below are frozen at write time.';

-- 3. Defensive: if any environment still has the old per-unit column from
--    rolled-back migration 019, drop it. No-op on production (already dropped
--    by the rolled-back 021_move_collect_payment_to_clients).
ALTER TABLE public.units
  DROP COLUMN IF EXISTS collect_payment_at_unit;
