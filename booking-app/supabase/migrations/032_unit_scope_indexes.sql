-- =============================================================================
-- 032_unit_scope_indexes.sql
--
-- Add the three indexes flagged by audit #4 — columns that the application
-- filters by on every page but which have no index, so Postgres scans the
-- whole table to satisfy the query.
--
-- Targets:
--   1. bookings.unit_id
--      Hit on every /patient-history load (non-admin) + every booking-store
--      fetch + every payment-mode lookup. At ~1,000 bookings per unit the
--      sequential scan starts being visible (>500ms).
--
--   2. user_units.user_id
--      Hit by api-auth.ts when loading the caller's unit list. Fires on
--      EVERY authenticated request that resolves caller scope. Sequential
--      scan grows linearly with total user_units rows.
--
--   3. user_units.unit_id
--      Hit when listing users assigned to a unit (admin tools) and when
--      resolving "which users belong to this unit" for cascading checks.
--
-- All three are FK columns. Postgres does NOT auto-index FK columns
-- (unlike PRIMARY KEYs and UNIQUE constraints), so this gap has been
-- there since day one.
--
-- Idempotent — IF NOT EXISTS lets this re-run safely.
-- CONCURRENTLY is intentionally NOT used because Supabase wraps migrations
-- in a transaction by default; CONCURRENTLY can't run inside one. At
-- current row counts (low thousands) the blocking-create is sub-second.
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_bookings_unit_id
  ON public.bookings (unit_id);

CREATE INDEX IF NOT EXISTS idx_user_units_user_id
  ON public.user_units (user_id);

CREATE INDEX IF NOT EXISTS idx_user_units_unit_id
  ON public.user_units (unit_id);

-- Sanity check — confirm the three new indexes exist.
SELECT
  schemaname,
  tablename,
  indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_bookings_unit_id',
    'idx_user_units_user_id',
    'idx_user_units_unit_id'
  )
ORDER BY indexname;
