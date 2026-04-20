-- =============================================================================
-- 016_lock_booking_insert_status.sql
--
-- Close a gap in the bookings INSERT policy. The UPDATE trigger from
-- migration 011 (enforce_booking_status_transition) blocks non-admin
-- callers from transitioning a booking's status to "Payment Complete"
-- or "Successful" — but it only fires on UPDATE.
--
-- The original INSERT policy (005_real_rls_policies.sql) had no check on
-- the `status` column, so an authenticated user could INSERT a row with
-- `status = 'Payment Complete'` directly and bypass the trigger entirely.
--
-- This migration replaces the INSERT policy with one that enforces
-- `status = 'In Progress'` on creation. The only legitimate creation
-- state is In Progress — any other value is either tampering or a bug.
--
-- service_role is unaffected (the admin-scoped `bookings_admin_all` policy
-- still covers it, and service_role bypasses RLS anyway).
-- =============================================================================

DROP POLICY IF EXISTS "bookings_unit_scoped_insert" ON public.bookings;

CREATE POLICY "bookings_unit_scoped_insert"
  ON public.bookings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Must be creating with the starting status only.
    status = 'In Progress'
    -- Unit scoping: either no unit (legacy / pre-assignment) or the
    -- caller must be in the booking's unit.
    AND (
      unit_id IS NULL
      OR unit_id IN (SELECT public.current_app_user_unit_ids())
    )
  );

-- Sanity check — verify the new WITH CHECK expression is in place.
SELECT
  policyname,
  cmd,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'bookings'
  AND policyname = 'bookings_unit_scoped_insert';
