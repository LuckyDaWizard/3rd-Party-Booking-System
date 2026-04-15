-- Migration 010: Drop plaintext `pin` column from public.users
--
-- The `pin` column is redundant with auth.users — Supabase Auth stores a
-- bcrypt hash of the PIN as the password. Keeping a plaintext copy leaked
-- through admin views, error messages, and potential log lines.
--
-- All code paths that previously queried public.users.pin have been migrated
-- to use auth.users via the admin API + synthetic email scheme.
--
-- Preconditions:
--   - Deploy the updated app code FIRST (the code must no longer read/write
--     the pin column before this migration runs).
--
-- Drop the `users_visible` view first since it references the pin column.
DROP VIEW IF EXISTS public.users_visible;

-- Drop the column itself.
ALTER TABLE public.users DROP COLUMN IF EXISTS pin;
