-- =============================================================================
-- 028 — Remove scheduling from the system
--
-- Scheduling was removed as a product decision (2026-05-11). All consults are
-- now instant. Drop the columns added by migration 025 and the column-level
-- grants added by migration 027.
--
-- Forward-only — no rollback. The previous migrations (025, 027) remain in
-- history but are now no-ops against the live schema.
-- =============================================================================

ALTER TABLE bookings
  DROP COLUMN IF EXISTS booking_type,
  DROP COLUMN IF EXISTS scheduled_at;

-- The column-level UPDATE grants from migration 027 went with the columns;
-- nothing to revoke explicitly. PostgreSQL drops grants together with the
-- columns they target.
