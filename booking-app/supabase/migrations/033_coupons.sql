-- =============================================================================
-- 033_coupons.sql
--
-- WooCommerce-style coupon codes for the consultation fee.
--
-- Two tables:
--   coupons         — the catalogue of codes. system_admin creates these.
--   coupon_uses     — one row per successful apply, used for the
--                     per-coupon / per-email usage-limit checks AND as the
--                     audit trail. Inserted by the apply endpoint, never
--                     mutated.
--
-- Plus three columns on bookings to denormalise the resolved discount so
-- it shows on listings + survives a coupon being later disabled.
--
-- Discount rules (resolved server-side in /api/coupons/apply):
--   percentage   — discount = round(amount * value / 100, 2), capped at amount
--   fixed        — discount = min(value, amount)
-- Final amount   = original - discount (never below 0)
--
-- Constraint matrix (mirrors WooCommerce; all nullable = "no limit"):
--   valid_from / valid_until    — time window
--   min_spend / max_spend       — booking payment_amount must satisfy
--   usage_limit                 — max total applies across all patients
--   usage_limit_per_email       — max applies for the SAME patient email
--   allowed_emails              — whitelist; if set, patient email must be in
--
-- A coupon with zero rows in coupon_uses can be hard-deleted. Once it has
-- been used, the admin UI offers "Disable" instead so the audit trail and
-- the booking.coupon_id FK stay intact.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enum: discount type
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.coupon_discount_type AS ENUM ('percentage', 'fixed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Enum: status
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.coupon_status AS ENUM ('active', 'disabled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- coupons
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.coupons (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                    text NOT NULL,
  description             text,
  discount_type           public.coupon_discount_type NOT NULL,
  -- For 'percentage': 0 < value <= 100. For 'fixed': value > 0 (rand amount).
  discount_value          numeric(10,2) NOT NULL,
  valid_from              timestamptz,
  valid_until             timestamptz,
  min_spend               numeric(10,2),
  max_spend               numeric(10,2),
  usage_limit             integer,
  usage_limit_per_email   integer,
  -- TEXT array; NULL or {} means "any email". Stored lower-cased to make
  -- the membership check case-insensitive without needing extra indexes.
  allowed_emails          text[],
  status                  public.coupon_status NOT NULL DEFAULT 'active',
  created_by              uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT coupons_value_positive
    CHECK (discount_value > 0),
  CONSTRAINT coupons_percentage_at_most_100
    CHECK (discount_type <> 'percentage' OR discount_value <= 100),
  CONSTRAINT coupons_min_max_consistent
    CHECK (min_spend IS NULL OR max_spend IS NULL OR min_spend <= max_spend),
  CONSTRAINT coupons_window_consistent
    CHECK (valid_from IS NULL OR valid_until IS NULL OR valid_from <= valid_until),
  CONSTRAINT coupons_usage_limit_positive
    CHECK (usage_limit IS NULL OR usage_limit > 0),
  CONSTRAINT coupons_usage_limit_per_email_positive
    CHECK (usage_limit_per_email IS NULL OR usage_limit_per_email > 0)
);

-- Case-insensitive unique on the code so an admin can't accidentally
-- create two codes that differ only in case (and patients can type
-- whatever case they like).
CREATE UNIQUE INDEX IF NOT EXISTS coupons_code_unique_ci
  ON public.coupons (lower(code));

-- Look-up by status for the admin list.
CREATE INDEX IF NOT EXISTS coupons_status_idx
  ON public.coupons (status);

-- ---------------------------------------------------------------------------
-- coupon_uses — audit + usage-limit counter
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.coupon_uses (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id         uuid NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  booking_id        uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  -- Snapshotted at apply-time so the per-email usage check stays correct
  -- even if the booking's email_address is later edited or anonymised.
  patient_email     text NOT NULL,
  original_amount   numeric(10,2) NOT NULL,
  discount_amount   numeric(10,2) NOT NULL,
  final_amount      numeric(10,2) NOT NULL,
  applied_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT coupon_uses_amounts_positive
    CHECK (original_amount >= 0 AND discount_amount >= 0 AND final_amount >= 0),
  CONSTRAINT coupon_uses_discount_not_exceeding
    CHECK (discount_amount <= original_amount),
  CONSTRAINT coupon_uses_final_consistent
    CHECK (abs(final_amount - (original_amount - discount_amount)) < 0.01)
);

-- One coupon may only be applied once to a given booking (re-application
-- of the same code on the same booking must replace, not stack — enforce
-- here as a guard against a buggy client.)
CREATE UNIQUE INDEX IF NOT EXISTS coupon_uses_booking_unique
  ON public.coupon_uses (booking_id);

-- Fast COUNT(*) for usage_limit / usage_limit_per_email checks.
CREATE INDEX IF NOT EXISTS coupon_uses_coupon_idx
  ON public.coupon_uses (coupon_id);

CREATE INDEX IF NOT EXISTS coupon_uses_coupon_email_idx
  ON public.coupon_uses (coupon_id, lower(patient_email));

-- ---------------------------------------------------------------------------
-- Booking columns — denormalised resolved discount.
--
-- Keeps the booking row self-describing for the existing reports + CSV
-- export without joining coupon_uses every time. Mirror values; the
-- coupon_uses row is the source of truth for limit counting.
-- ---------------------------------------------------------------------------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS coupon_id        uuid REFERENCES public.coupons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS coupon_code      text,
  ADD COLUMN IF NOT EXISTS original_amount  numeric(10,2),
  ADD COLUMN IF NOT EXISTS discount_amount  numeric(10,2);

-- Fast lookup of "all bookings that used coupon X" for the manage page.
CREATE INDEX IF NOT EXISTS bookings_coupon_idx
  ON public.bookings (coupon_id)
  WHERE coupon_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Updated-at trigger on coupons (mirrors the pattern used for clients/units).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.coupons_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS coupons_updated_at_trigger ON public.coupons;
CREATE TRIGGER coupons_updated_at_trigger
  BEFORE UPDATE ON public.coupons
  FOR EACH ROW
  EXECUTE FUNCTION public.coupons_set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — service-role only for now. All access goes through API routes
-- which gate by role server-side.
-- ---------------------------------------------------------------------------
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_uses ENABLE ROW LEVEL SECURITY;
