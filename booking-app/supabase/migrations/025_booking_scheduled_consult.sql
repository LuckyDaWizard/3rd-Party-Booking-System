-- =============================================================================
-- Migration 025 — Scheduled consultations
--
-- Adds booking_type + scheduled_at to support a per-booking choice
-- between "instant consult" (the standard flow since launch) and
-- "scheduled consult" (operator captures the patient now, the
-- consultation happens at a future date/time).
--
-- - booking_type: enum-like TEXT, defaults to 'instant'. Constrained
--   to 'instant' | 'scheduled'.
-- - scheduled_at: TIMESTAMPTZ, NULL for instant bookings; required
--   (UI-side) when booking_type = 'scheduled'. We don't enforce the
--   coupling at the DB level because validation lives in the booking
--   flow, and a future feature might allow scheduled_at to be
--   populated for instant bookings (e.g. follow-up reminders) without
--   requiring a schema change.
--
-- Both fields are passed through to CareFirst on Start Consult so
-- their app can schedule the actual consult slot on their side.
--
-- Idempotent.
-- =============================================================================

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS booking_type TEXT NOT NULL DEFAULT 'instant'
    CHECK (booking_type IN ('instant', 'scheduled')),
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

COMMENT ON COLUMN public.bookings.booking_type IS
  'Per-booking consultation timing. ''instant'' = standard flow, consult begins at Start Consult. ''scheduled'' = operator picks a future date/time, CareFirst schedules the consult on their side.';

COMMENT ON COLUMN public.bookings.scheduled_at IS
  'When booking_type = ''scheduled'', the requested consultation start time. Stored in UTC; UI accepts local time and converts. NULL for instant bookings.';
