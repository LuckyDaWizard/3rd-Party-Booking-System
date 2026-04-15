-- =============================================================================
-- 014_sessions_view_not_after.sql
--
-- Re-create the public.active_sessions view to include `not_after` so the
-- Security dashboard can classify sessions as Active / Idle / Ended.
--
-- not_after = the refresh-token expiry timestamp. If it's in the past the
-- session is definitively dead and can't be resurrected by a refresh.
--
-- Supersedes migration 012. Same grants applied.
-- =============================================================================

DROP VIEW IF EXISTS public.active_sessions;

CREATE VIEW public.active_sessions
WITH (security_invoker = false) AS
SELECT
  s.id,
  s.user_id,
  s.created_at,
  s.updated_at,
  s.user_agent,
  s.ip,
  s.not_after
FROM auth.sessions s;

REVOKE ALL ON public.active_sessions FROM PUBLIC;
REVOKE ALL ON public.active_sessions FROM anon, authenticated;
GRANT SELECT ON public.active_sessions TO service_role;
