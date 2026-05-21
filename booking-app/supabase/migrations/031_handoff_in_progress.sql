-- =============================================================================
-- 031_handoff_in_progress.sql
--
-- Widen the bookings.handoff_status CHECK constraint to include
-- 'in_progress' — the new sentinel value used by the Start Consult
-- handoff-lock pattern.
--
-- Background: a race test on Start Consult (two browser windows clicking
-- simultaneously) showed that while the state-machine `transitionStatus`
-- protected the DB from double-transitions, BOTH requests still reached
-- CareFirst — and CareFirst is NOT idempotent on uniqueReference, so two
-- SSO sessions were created for one booking.
--
-- The fix in start-consultation/route.ts acquires a short-lived lock by
-- doing a conditional UPDATE setting handoff_status = 'in_progress'
-- before the CareFirst call. The original CHECK constraint (migration 015)
-- only allowed 'pending' / 'sent' / 'failed', so the lock UPDATE
-- bounced with a constraint violation.
--
-- This migration drops + recreates the constraint with 'in_progress'
-- added. Idempotent.
-- =============================================================================

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_handoff_status_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_handoff_status_check
  CHECK (
    handoff_status IS NULL
    OR handoff_status IN ('pending', 'in_progress', 'sent', 'failed')
  );

-- Sanity check — confirm the constraint allows the new value.
SELECT
  conname,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.bookings'::regclass
  AND conname = 'bookings_handoff_status_check';
