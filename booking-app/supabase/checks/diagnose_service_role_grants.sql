-- =============================================================================
-- diagnose_service_role_grants.sql
--
-- The backfill script failed with `permission denied for table users` even
-- though it's using the service_role key. The service_role normally bypasses
-- RLS and has full grants on the public schema, so this means the table-level
-- grants for service_role have been revoked at some point.
--
-- Run this in Supabase SQL Editor to confirm.
-- =============================================================================

-- 1. What roles currently have privileges on public.users?
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name   = 'users'
ORDER BY grantee, privilege_type;

-- 2. Same for the other app tables (so we know the full blast radius).
SELECT table_name, grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privs
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('users', 'user_units', 'units', 'clients', 'bookings')
GROUP BY table_name, grantee
ORDER BY table_name, grantee;
