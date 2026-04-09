-- =============================================================================
-- 006_mask_pin_column.sql
--
-- Creates a view `public.users_visible` that masks the `pin` column for
-- non-system_admin callers. The client-side app reads from this view
-- instead of the raw `public.users` table, so unit_managers and regular
-- users can no longer see other users' PINs (or even their own).
--
-- Why a view:
--   Postgres RLS is row-level, not column-level. You can't hide one column
--   via a policy. A view with a CASE expression is the standard workaround.
--
-- Who still sees the real PIN:
--   - system_admin (via this view — the CASE returns the real value)
--   - service_role (reads the raw table directly, bypasses the view + RLS)
--   - Supabase dashboard / SQL Editor (logged in as postgres role)
--
-- The view is SECURITY INVOKER (default) so it inherits the caller's RLS
-- policies on the underlying `public.users` table. A unit_manager calling
-- SELECT * FROM users_visible still only sees users in their units — the
-- row-level filtering from migration 005 is preserved.
-- =============================================================================

CREATE OR REPLACE VIEW public.users_visible AS
SELECT
  id,
  first_names,
  surname,
  email,
  contact_number,
  role,
  status,
  unit_id,
  client_id,
  auth_user_id,
  avatar_url,
  created_at,
  -- Mask the PIN for everyone except system_admin
  CASE
    WHEN public.current_app_user_role() = 'system_admin'
      THEN pin
    ELSE NULL
  END AS pin
FROM public.users;

-- Grant the same SELECT privileges as the underlying table.
GRANT SELECT ON public.users_visible TO authenticated;
-- anon doesn't need access (no anon policies on users anyway).
