-- =============================================================================
-- Migration 023 — Monthly-invoice billing flag
--
-- Adds clients.bill_monthly. When TRUE, every booking under any of the
-- client's units skips the payment step entirely (no gateway, no self-
-- collect confirm) and is auto-marked Payment Complete with
-- payment_type = 'monthly_invoice'. The client is invoiced separately at
-- month-end.
--
-- Mutually exclusive with collect_payment_at_unit at the UI layer (the
-- Manage Client toggle pair enforces it). Server-side, if both ever land
-- TRUE, the resolution order is bill_monthly first — i.e. monthly wins.
-- This prevents an inconsistent booking from being created either way.
--
-- All operations idempotent, safe to re-run.
-- =============================================================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS bill_monthly BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.clients.bill_monthly IS
  'When TRUE, all units under this client skip the payment step and bookings are auto-marked Payment Complete with payment_type = ''monthly_invoice''. Mutually exclusive with collect_payment_at_unit at the UI; if both end up TRUE, monthly wins server-side.';
