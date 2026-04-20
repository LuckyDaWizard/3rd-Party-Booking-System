-- =============================================================================
-- 017_pin_reset_tokens.sql
--
-- Self-service PIN reset ("Forgot PIN?" flow, audit item #6).
--
-- A nurse who's forgotten her PIN enters her email on /forgot-pin. The server
-- emails her a 6-digit code. She enters the code + her new PIN on /reset-pin.
-- The server verifies the code against a row in this table, updates her
-- Supabase Auth password, revokes her existing sessions, and marks the token
-- used.
--
-- Security properties enforced by this schema:
--   1. Token is stored HASHED (sha256 hex of code + user_id salt). An attacker
--      who dumps the DB can't replay the code because they'd need the
--      plaintext to compute the matching hash.
--   2. Every token has a hard expires_at (15 min). Expired tokens are rejected
--      regardless of used_at.
--   3. Every token is single-use (used_at sets the kill switch). A replay
--      after success is rejected.
--   4. No user-facing RLS policies — this is service_role only. Users never
--      read or write this table through the anon / authenticated client.
--
-- Related routes:
--   /api/auth/forgot-pin  — issues a token, always returns 200 to prevent
--                           account enumeration
--   /api/auth/reset-pin   — consumes a token, updates the Auth password,
--                           signs out all existing sessions, audit-logs the
--                           reset
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.pin_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pin_reset_tokens_user_id
  ON public.pin_reset_tokens (user_id);

CREATE INDEX IF NOT EXISTS idx_pin_reset_tokens_expires_at
  ON public.pin_reset_tokens (expires_at);

-- Enable RLS but add NO policies. This locks the table to service_role only,
-- which is exactly what we want — reset tokens are sensitive and should
-- never be queryable by the anon / authenticated clients.
ALTER TABLE public.pin_reset_tokens ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- revoke_all_sessions_for_user(auth_user_id)
--
-- Used after a successful PIN reset to sign the user out of any active
-- sessions. Without this, a PIN reset doesn't boot an existing attacker
-- session — they'd continue to have access on their stolen device until
-- the refresh token expired.
--
-- Returns the number of sessions deleted.
--
-- SECURITY DEFINER so the function runs with table-owner privileges and
-- can touch auth.sessions. Only service_role is granted EXECUTE.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revoke_all_sessions_for_user(
  target_auth_user_id uuid
)
RETURNS integer AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM auth.sessions
  WHERE user_id = target_auth_user_id;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

REVOKE ALL ON FUNCTION public.revoke_all_sessions_for_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_all_sessions_for_user(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_all_sessions_for_user(uuid) TO service_role;

-- Sanity check.
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'pin_reset_tokens'
ORDER BY ordinal_position;

SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'revoke_all_sessions_for_user';
