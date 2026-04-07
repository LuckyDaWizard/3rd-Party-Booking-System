-- =============================================================================
-- check_pin_uniqueness.sql
--
-- Run this in the Supabase SQL editor BEFORE applying migration 004.
--
-- The Path 2 plan uses synthetic emails of the form `pin-{pin}@carefirst.local`
-- as the Supabase Auth identifier. That only works if every PIN is unique.
--
-- Expected result: 0 rows.
-- If any rows come back, those PINs collide and must be reissued before we
-- can backfill auth users.
-- =============================================================================

SELECT
  pin,
  count(*)              AS duplicate_count,
  array_agg(id)         AS user_ids,
  array_agg(first_names || ' ' || surname) AS names
FROM public.users
WHERE pin IS NOT NULL
  AND pin <> ''
GROUP BY pin
HAVING count(*) > 1
ORDER BY duplicate_count DESC;
