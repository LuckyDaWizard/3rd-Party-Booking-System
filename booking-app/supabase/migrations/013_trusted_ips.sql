-- =============================================================================
-- 013_trusted_ips.sql
--
-- Allowlist of IPs that are exempt from rapid-probing and password-spraying
-- suspicious-activity flags. Used for dev machines, office networks, and
-- testing environments where the normal thresholds would false-positive.
--
-- Flags that still fire even for trusted IPs:
--   - Cracked password (N failures then success for a known PIN)
--   - Unknown PIN heavily probed (you shouldn't do that in testing)
-- Flags that are silenced for trusted IPs:
--   - Rapid probing from IP
--   - Password spraying
--
-- Auth: system_admin only, via API routes using service_role.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.trusted_ips (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address  text NOT NULL UNIQUE,
  label       text,              -- optional human-readable name ("Office network")
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid NOT NULL      -- public.users.id of the admin who added it
);

CREATE INDEX IF NOT EXISTS idx_trusted_ips_ip ON public.trusted_ips (ip_address);

-- Lock down: service_role only.
ALTER TABLE public.trusted_ips ENABLE ROW LEVEL SECURITY;

-- No policies = no authenticated/anon access. service_role bypasses RLS.
GRANT ALL ON TABLE public.trusted_ips TO service_role;
