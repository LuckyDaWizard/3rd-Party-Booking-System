-- =============================================================================
-- 021_move_collect_payment_to_clients.sql
--
-- Promote `collect_payment_at_unit` from the units table to the clients
-- table. The toggle is now per-client: when ON, every unit under that
-- client bypasses the PayFast gateway and the unit collects the
-- consultation fee directly.
--
-- Rationale: billing arrangements are negotiated at the client level (one
-- contract covers all of that client's sites), so the toggle belongs there.
-- Per-unit overrides would just reproduce the client setting on every
-- child unit.
--
-- Backfill: any client that has at least one unit currently flagged
-- collect_payment_at_unit = TRUE is promoted, so no operator-set toggle is
-- silently lost when the per-unit column is dropped.
--
-- Ordering matters — backfill BEFORE the DROP.
-- =============================================================================

-- 1. Add the new client-level column.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS collect_payment_at_unit BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.clients.collect_payment_at_unit IS
  'When TRUE, all units under this client skip PayFast and mark payment as self_collect (units collect fee directly).';

-- 2. Backfill from any existing per-unit flags. Skipped silently if the
-- units column was never created (the migration is then a no-op for the
-- backfill step).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'units'
      AND column_name = 'collect_payment_at_unit'
  ) THEN
    UPDATE public.clients
    SET collect_payment_at_unit = TRUE
    WHERE id IN (
      SELECT DISTINCT client_id
      FROM public.units
      WHERE collect_payment_at_unit = TRUE
        AND client_id IS NOT NULL
    );
  END IF;
END
$$;

-- 3. Drop the per-unit column. Safe to re-run (IF EXISTS).
ALTER TABLE public.units
  DROP COLUMN IF EXISTS collect_payment_at_unit;
