-- =============================================================================
-- 004_add_auth_link.sql
--
-- Phase 1 of Path 2: link public.users to auth.users so we can migrate the
-- PIN-based login flow onto Supabase Auth.
--
-- This migration is non-destructive:
--   - Adds an `auth_user_id` column to public.users (nullable, unique).
--   - Adds three SECURITY DEFINER helper functions used by the real RLS
--     policies in migration 005.
--
-- After running this migration the app will keep working exactly as before
-- (still using the permissive policies from 003). The next step is the
-- backfill script (Phase 2), which populates auth_user_id for every user.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Link column
-- ---------------------------------------------------------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS auth_user_id UUID
    REFERENCES auth.users(id) ON DELETE SET NULL;

-- One auth user maps to at most one app user.
CREATE UNIQUE INDEX IF NOT EXISTS users_auth_user_id_unique
  ON public.users (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Helper: current app user id
--
-- Returns the public.users.id for the currently authenticated Supabase Auth
-- user, or NULL if not signed in. Used by RLS policies in 005.
--
-- SECURITY DEFINER so the function can read public.users without needing the
-- caller to satisfy RLS on that table (which would cause infinite recursion).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM public.users
  WHERE auth_user_id = auth.uid()
  LIMIT 1;
$$;

-- ---------------------------------------------------------------------------
-- 3. Helper: current app user role
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_app_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.users
  WHERE auth_user_id = auth.uid()
  LIMIT 1;
$$;

-- ---------------------------------------------------------------------------
-- 4. Helper: current app user unit ids
--
-- Returns the set of unit_ids the current user is assigned to via user_units.
-- Used by RLS policies that need unit-scoped access checks.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_app_user_unit_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT uu.unit_id
  FROM public.user_units uu
  JOIN public.users u ON u.id = uu.user_id
  WHERE u.auth_user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- 5. Lock down EXECUTE on these helpers
--
-- They are SECURITY DEFINER so they bypass RLS — only allow authenticated
-- callers to invoke them. anon should never need them.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.current_app_user_id()        FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_app_user_role()      FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_app_user_unit_ids()  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.current_app_user_id()        TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_app_user_role()      TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_app_user_unit_ids()  TO authenticated;
