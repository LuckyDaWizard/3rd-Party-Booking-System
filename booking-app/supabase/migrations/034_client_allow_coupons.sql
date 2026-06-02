-- =============================================================================
-- Migration 034 — Per-client allow_coupons flag
--
-- Adds clients.allow_coupons. When TRUE, the booking flow renders the
-- "Have a coupon code?" input on the payment step AND the /api/coupons/apply
-- endpoint accepts apply requests for bookings under this client. When FALSE
-- (default), coupons are silently unavailable — the input doesn't render
-- and the apply endpoint rejects with a clear message.
--
-- Default FALSE so existing clients keep their current behaviour after the
-- migration lands; system_admin opts in per client.
--
-- Idempotent.
-- =============================================================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS allow_coupons BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.clients.allow_coupons IS
  'When TRUE, the booking flow shows the coupon code input and the apply endpoint accepts requests for bookings under this client. Defaults to FALSE so admin opts in per client.';
