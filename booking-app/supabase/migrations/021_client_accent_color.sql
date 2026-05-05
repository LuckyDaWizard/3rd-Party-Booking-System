-- =============================================================================
-- 021_client_accent_color.sql
--
-- Per-client accent colour for in-app theming. Single hex token —
-- the audit confirmed only one brand colour is in meaningful use across
-- the dashboard (#3ea3db today). If a real need for a separate secondary
-- emerges we'll add a column then.
--
-- Nullable: clients without a value fall back to the system default
-- (#3ea3db) at render time. We don't enforce a CHECK constraint on the
-- hex format — validation lives in the API route + client form so we can
-- give friendly error messages rather than a Postgres error string.
-- =============================================================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS accent_color TEXT;

COMMENT ON COLUMN public.clients.accent_color IS
  'Hex colour (e.g. ''#3ea3db'') used as this client''s accent in the dashboard. NULL falls back to the system default.';
