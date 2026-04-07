-- =============================================================================
-- restore_service_role_grants.sql
--
-- The diagnose query showed that service_role only has REFERENCES, TRIGGER,
-- TRUNCATE on the app tables — it's missing SELECT, INSERT, UPDATE, DELETE.
-- Supabase normally grants these by default, so something revoked them.
--
-- This restores service_role's full DML access on the app tables. service_role
-- bypasses RLS by design (it's the admin/server-side key), so granting it
-- full DML is the expected configuration and does NOT weaken your RLS — only
-- holders of the secret service_role key can use it.
--
-- Run in Supabase SQL Editor.
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.users      TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_units TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.units      TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients    TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookings   TO service_role;

-- Also make sure future tables in the public schema get these grants
-- automatically for service_role (this matches Supabase's default behavior).
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;

-- Verify
SELECT table_name, grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privs
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('users', 'user_units', 'units', 'clients', 'bookings')
  AND grantee = 'service_role'
GROUP BY table_name, grantee
ORDER BY table_name;
