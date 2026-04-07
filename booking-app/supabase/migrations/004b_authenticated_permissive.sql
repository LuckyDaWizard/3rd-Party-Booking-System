-- =============================================================================
-- 004b_authenticated_permissive.sql
--
-- Bridge migration: extend the permissive policies from 003 (which only
-- granted access to the `anon` role) to the `authenticated` role as well.
--
-- Why: Phase 4 of the auth migration switched the app to Supabase Auth via
-- @supabase/ssr. After signing in, the browser client now uses the
-- `authenticated` role, not `anon`. The 003 policies were only written for
-- `anon`, so post-sign-in queries (loadUser, fetchUsers, etc.) were silently
-- returning 0 rows under RLS, breaking the new login flow.
--
-- This migration adds matching permissive policies for `authenticated` so the
-- app keeps working under both roles. It is intentionally permissive — real
-- role/unit-scoped policies come in migration 005 (Phase 5), at which point
-- ALL of the permissive policies (both 003's anon and this file's
-- authenticated) will be dropped and replaced.
--
-- Security note: same caveat as 003. These policies do NOT add real
-- protection — they're a foundation step, not a hardening step.
-- =============================================================================

DROP POLICY IF EXISTS "auth_all_bookings"   ON bookings;
CREATE POLICY "auth_all_bookings"
  ON bookings
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "auth_all_clients"    ON clients;
CREATE POLICY "auth_all_clients"
  ON clients
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "auth_all_units"      ON units;
CREATE POLICY "auth_all_units"
  ON units
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "auth_all_users"      ON users;
CREATE POLICY "auth_all_users"
  ON users
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "auth_all_user_units" ON user_units;
CREATE POLICY "auth_all_user_units"
  ON user_units
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
