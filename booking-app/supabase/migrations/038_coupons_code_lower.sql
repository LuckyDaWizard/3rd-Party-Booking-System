-- =============================================================================
-- Migration 038 — coupons.code_lower generated column + plain unique index
--
-- WHY
-- Migration 033 created a functional unique index `coupons_code_lower_unique`
-- on `lower(code)`. The apply / admin-create / admin-PATCH endpoints used
-- `.filter("code", "ilike", lookupKey)` to do case-insensitive lookups. ILIKE
-- without a wildcard CAN use a functional index, but PostgreSQL's planner
-- isn't guaranteed to pick it — depends on statistics, escape handling, and
-- collation. When it doesn't, the lookup falls back to a sequential scan on
-- the coupons table. Currently tiny, grows linearly.
--
-- WHAT THIS DOES
-- Adds a STORED GENERATED column `code_lower` that's always `lower(code)`,
-- backed by a regular unique index. Lookups now use `.eq("code_lower", ...)`
-- which is an obvious equality match against a regular column — the planner
-- will always pick the unique index. No more ILIKE / planner-dependent
-- behaviour, and no double-write maintenance burden because the generated
-- column updates automatically.
--
-- The existing functional unique index from migration 033 is dropped at the
-- end since the new one supersedes it; the GENERATED column itself guarantees
-- the same uniqueness with a cleaner mechanism.
--
-- Compatibility: existing code that reads `code` keeps working — the original
-- column is untouched. Only the lookup paths were updated to use code_lower.
-- =============================================================================

ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS code_lower text
    GENERATED ALWAYS AS (lower(code)) STORED;

-- The plain unique index on the generated column is what the lookup queries
-- will hit. IF NOT EXISTS so this migration is idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS coupons_code_lower_idx
  ON public.coupons (code_lower);

-- The original functional index from migration 033 is now redundant — the
-- generated-column unique index does the same job more cleanly. Safe to drop
-- (IF EXISTS so older deploys without 033's index don't error out here).
DROP INDEX IF EXISTS public.coupons_code_lower_unique;
