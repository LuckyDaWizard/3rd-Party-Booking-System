-- =============================================================================
-- 019_unit_collect_payment_at_unit.sql
--
-- Per-unit toggle to bypass the PayFast payment gateway. When ON, bookings
-- created against this unit are marked Payment Complete with
-- payment_type = 'self_collect' and the unit collects the consultation fee
-- directly from the patient (cash / card terminal at the front desk).
--
-- Default FALSE — existing units continue going through PayFast unchanged.
-- system_admin only flips this (enforced in API layer).
-- =============================================================================

ALTER TABLE units
  ADD COLUMN IF NOT EXISTS collect_payment_at_unit BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN units.collect_payment_at_unit IS
  'When TRUE, bookings for this unit skip PayFast and mark payment as self_collect (unit collects fee directly).';
