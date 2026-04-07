-- =============================================================================
-- 005_real_rls_policies.sql
--
-- Phase 5 of the Path 2 auth migration: replace ALL permissive policies from
-- migrations 003 (anon) and 004b (authenticated) with real role-scoped and
-- unit-scoped policies that enforce the application's RBAC model inside
-- Postgres.
--
-- After this migration:
--   - anon role can do nothing on app tables (no policies = denied)
--   - authenticated role can only see and modify rows according to their
--     role and assigned units
--   - service_role bypasses RLS as before, used by /api/admin/users routes
--
-- Roles enforced:
--   - system_admin → unrestricted access to all rows on all app tables
--   - unit_manager → scoped to their assigned units (via user_units)
--   - user         → scoped to their assigned units, plus narrower writes
--
-- Helpers used (defined in migration 004):
--   - public.current_app_user_id()        UUID
--   - public.current_app_user_role()      TEXT
--   - public.current_app_user_unit_ids()  SETOF UUID
--
-- Rollback: re-apply migration 003_enable_rls_permissive.sql AND
-- 004b_authenticated_permissive.sql to restore the open policies.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Drop ALL permissive policies from 003 and 004b.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "anon_all_bookings"   ON public.bookings;
DROP POLICY IF EXISTS "anon_all_clients"    ON public.clients;
DROP POLICY IF EXISTS "anon_all_units"      ON public.units;
DROP POLICY IF EXISTS "anon_all_users"      ON public.users;
DROP POLICY IF EXISTS "anon_all_user_units" ON public.user_units;

DROP POLICY IF EXISTS "auth_all_bookings"   ON public.bookings;
DROP POLICY IF EXISTS "auth_all_clients"    ON public.clients;
DROP POLICY IF EXISTS "auth_all_units"      ON public.units;
DROP POLICY IF EXISTS "auth_all_users"      ON public.users;
DROP POLICY IF EXISTS "auth_all_user_units" ON public.user_units;

-- ---------------------------------------------------------------------------
-- 2. users
--
-- Reads:
--   - system_admin → all
--   - unit_manager → users sharing at least one of their units, plus self
--   - user         → only self
-- Writes:
--   - All write paths go through /api/admin/users (service_role), so we do
--     NOT grant INSERT/UPDATE/DELETE to authenticated. Service role bypasses
--     RLS, so admin actions still work.
-- ---------------------------------------------------------------------------
CREATE POLICY "users_select_self"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (
    auth_user_id = auth.uid()
  );

CREATE POLICY "users_select_admin"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (
    public.current_app_user_role() = 'system_admin'
  );

CREATE POLICY "users_select_unit_manager"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (
    public.current_app_user_role() = 'unit_manager'
    AND EXISTS (
      SELECT 1
      FROM public.user_units uu
      WHERE uu.user_id = public.users.id
        AND uu.unit_id IN (SELECT public.current_app_user_unit_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- 3. user_units
--
-- Reads:
--   - system_admin → all
--   - unit_manager → rows for users in their units
--   - user         → only their own assignments
-- Writes: service_role only.
-- ---------------------------------------------------------------------------
CREATE POLICY "user_units_select_self"
  ON public.user_units
  FOR SELECT
  TO authenticated
  USING (
    user_id = public.current_app_user_id()
  );

CREATE POLICY "user_units_select_admin"
  ON public.user_units
  FOR SELECT
  TO authenticated
  USING (
    public.current_app_user_role() = 'system_admin'
  );

CREATE POLICY "user_units_select_unit_manager"
  ON public.user_units
  FOR SELECT
  TO authenticated
  USING (
    public.current_app_user_role() = 'unit_manager'
    AND unit_id IN (SELECT public.current_app_user_unit_ids())
  );

-- ---------------------------------------------------------------------------
-- 4. units
--
-- Reads: system_admin all; others only their assigned units.
-- Writes: service_role only.
-- ---------------------------------------------------------------------------
CREATE POLICY "units_select_admin"
  ON public.units
  FOR SELECT
  TO authenticated
  USING (
    public.current_app_user_role() = 'system_admin'
  );

CREATE POLICY "units_select_assigned"
  ON public.units
  FOR SELECT
  TO authenticated
  USING (
    id IN (SELECT public.current_app_user_unit_ids())
  );

-- ---------------------------------------------------------------------------
-- 5. clients
--
-- Reads: system_admin all; others only the client(s) tied to their units.
-- Writes: service_role only.
-- ---------------------------------------------------------------------------
CREATE POLICY "clients_select_admin"
  ON public.clients
  FOR SELECT
  TO authenticated
  USING (
    public.current_app_user_role() = 'system_admin'
  );

CREATE POLICY "clients_select_via_units"
  ON public.clients
  FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT u.client_id
      FROM public.units u
      WHERE u.id IN (SELECT public.current_app_user_unit_ids())
        AND u.client_id IS NOT NULL
    )
  );

-- ---------------------------------------------------------------------------
-- 6. bookings
--
-- system_admin → full CRUD on all bookings.
-- unit_manager + user → full CRUD on bookings whose unit_id is in their
-- assigned units. (Booking creation is the core app function for both roles.)
--
-- Bookings without a unit_id (legacy/in-progress) are visible to admins only.
-- ---------------------------------------------------------------------------
CREATE POLICY "bookings_admin_all"
  ON public.bookings
  FOR ALL
  TO authenticated
  USING (
    public.current_app_user_role() = 'system_admin'
  )
  WITH CHECK (
    public.current_app_user_role() = 'system_admin'
  );

CREATE POLICY "bookings_unit_scoped_select"
  ON public.bookings
  FOR SELECT
  TO authenticated
  USING (
    unit_id IS NOT NULL
    AND unit_id IN (SELECT public.current_app_user_unit_ids())
  );

CREATE POLICY "bookings_unit_scoped_insert"
  ON public.bookings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    unit_id IS NULL
    OR unit_id IN (SELECT public.current_app_user_unit_ids())
  );

CREATE POLICY "bookings_unit_scoped_update"
  ON public.bookings
  FOR UPDATE
  TO authenticated
  USING (
    unit_id IS NOT NULL
    AND unit_id IN (SELECT public.current_app_user_unit_ids())
  )
  WITH CHECK (
    unit_id IS NULL
    OR unit_id IN (SELECT public.current_app_user_unit_ids())
  );

CREATE POLICY "bookings_unit_scoped_delete"
  ON public.bookings
  FOR DELETE
  TO authenticated
  USING (
    unit_id IS NOT NULL
    AND unit_id IN (SELECT public.current_app_user_unit_ids())
  );

-- ---------------------------------------------------------------------------
-- 7. Sanity check
--
-- After applying, anon role has zero policies (so anon can't read anything),
-- and authenticated has the role/unit-scoped set above. service_role is
-- unaffected (it bypasses RLS by design).
-- ---------------------------------------------------------------------------
SELECT
  tablename,
  policyname,
  roles,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
