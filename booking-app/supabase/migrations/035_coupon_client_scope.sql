-- =============================================================================
-- Migration 035 — Coupon client scope
--
-- Adds an OPTIONAL client restriction to each coupon. When client_id is set,
-- the apply endpoint only accepts the coupon for bookings whose parent
-- client matches. NULL = "any client" (the existing behaviour).
--
-- ON DELETE CASCADE so deleting a client also deletes any coupons
-- exclusively scoped to it (those codes only make sense in that
-- relationship). Coupons with NULL client_id are unaffected.
--
-- Idempotent.
-- =============================================================================

ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS client_id uuid
    REFERENCES public.clients(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.coupons.client_id IS
  'Optional client restriction. When set, the coupon only applies to bookings under this client. NULL = any client (system-wide).';

-- Fast list filter on the admin /coupons page.
CREATE INDEX IF NOT EXISTS coupons_client_idx
  ON public.coupons (client_id)
  WHERE client_id IS NOT NULL;
