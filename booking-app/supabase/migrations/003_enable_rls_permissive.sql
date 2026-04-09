-- =============================================================================
-- 003_enable_rls_permissive.sql
--
-- Enables Row Level Security on all application tables and adds permissive
-- policies for the `anon` role so the existing PIN-based auth flow keeps
-- working. The app currently authenticates by PIN against the `users` table
-- and uses the Supabase anon key for all queries, so auth.uid() is NULL
-- inside Postgres. Standard role-scoped policies cannot work until the app
-- migrates to Supabase Auth (planned as Path 2).
--
-- Security note: these policies do NOT add real protection. Anyone with the
-- public anon key (which ships in the client bundle) can still read and
-- write every row. The purpose of this migration is to:
--   1. Satisfy Supabase's "RLS disabled" warnings, and
--   2. Restore app functionality after RLS was enabled in the dashboard.
--
-- Tighten or replace these policies after migrating to Supabase Auth.
-- =============================================================================

-- Enable RLS on every app table.
ALTER TABLE bookings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients     ENABLE ROW LEVEL SECURITY;
ALTER TABLE units       ENABLE ROW LEVEL SECURITY;
ALTER TABLE users       ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_units  ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- bookings
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "anon_all_bookings" ON bookings;
CREATE POLICY "anon_all_bookings"
  ON bookings
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "anon_all_clients" ON clients;
CREATE POLICY "anon_all_clients"
  ON clients
  TO anon
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- units
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "anon_all_units" ON units;
CREATE POLICY "anon_all_units"
  ON units
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "anon_all_users" ON users;
CREATE POLICY "anon_all_users"
  ON users
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- user_units (junction table)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "anon_all_user_units" ON user_units;
CREATE POLICY "anon_all_user_units"
  ON user_units
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);
