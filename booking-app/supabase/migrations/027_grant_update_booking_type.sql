-- =============================================================================
-- Migration 027 — Grant UPDATE on booking_type + scheduled_at to authenticated
--
-- Background: migration 011 revoked blanket UPDATE on public.bookings and
-- re-granted UPDATE column-by-column to the `authenticated` role. New
-- columns added later must be explicitly added to that grant — otherwise
-- writes from the booking flow (which runs as the authenticated user via
-- the Supabase JS client) hit "permission denied for table bookings".
--
-- Migration 025 added booking_type + scheduled_at but missed the grant.
-- Result: step 4 / step 5 of the patient-details flow silently failed to
-- persist the operator's "Scheduled Consult" pick — the row stayed at
-- the DB default 'instant'. This migration restores the intended write
-- path for those two columns.
--
-- Idempotent (Postgres GRANT is idempotent for the same role + columns).
-- =============================================================================

GRANT UPDATE (booking_type, scheduled_at) ON public.bookings TO authenticated;
