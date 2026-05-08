-- =============================================================================
-- Migration 026 — Nurse-verification flag
--
-- Adds clients.nurse_verification. When TRUE, bookings under this client
-- require an additional nurse-verification step. Independent of the
-- billing-mode flags (collect_payment_at_unit, bill_monthly) — it can be
-- combined with any payment mode.
--
-- Idempotent.
-- =============================================================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS nurse_verification BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.clients.nurse_verification IS
  'When TRUE, bookings under this client require a nurse-verification step. Independent of billing-mode flags.';
