-- =============================================================================
-- 012_sessions_view.sql
--
-- Expose a safe subset of auth.sessions + auth.users to the service_role
-- client so the admin Security dashboard can list and force-revoke sessions.
--
-- What's exposed:
--   - id, user_id, created_at, updated_at, user_agent, ip
--
-- Why a view (not direct table access):
--   - Supabase's PostgREST restricts the `auth` schema even for service_role
--     in some configurations. A SECURITY DEFINER view in the `public` schema
--     is the canonical workaround.
--   - Lets us filter/shape columns if we need to in future (e.g. hide
--     sensitive access tokens).
--
-- Auth: the view + revoke function are accessible to service_role only. No
-- authenticated or anon grants. The API routes that call these enforce
-- system_admin via requireSystemAdminWithCaller().
-- =============================================================================

-- Drop any previous version.
DROP VIEW IF EXISTS public.active_sessions;

CREATE VIEW public.active_sessions
WITH (security_invoker = false) AS
SELECT
  s.id,
  s.user_id,
  s.created_at,
  s.updated_at,
  s.user_agent,
  s.ip
FROM auth.sessions s;

-- Lock it down — service_role only.
REVOKE ALL ON public.active_sessions FROM PUBLIC;
REVOKE ALL ON public.active_sessions FROM anon, authenticated;
GRANT SELECT ON public.active_sessions TO service_role;

-- ---------------------------------------------------------------------------
-- Function to revoke a specific session by id.
-- Deletes the row from auth.sessions, which invalidates the user's refresh
-- token. On their next JWT refresh the user is signed out. Access-token-only
-- requests continue to work until the short-lived access token expires
-- (~60 min by default — configurable in Supabase Auth settings).
--
-- Returns true if a row was deleted, false otherwise.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revoke_session(session_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM auth.sessions WHERE id = session_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_session(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_session(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_session(uuid) TO service_role;
