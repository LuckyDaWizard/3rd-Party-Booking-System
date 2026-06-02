-- =============================================================================
-- Migration 036 — Release a coupon when its booking is Abandoned / Discarded
--
-- WHY
-- Once a coupon_uses row exists, the apply endpoint counts it against the
-- coupon's usage_limit and usage_limit_per_email. If a patient applies a
-- code and then bails (closes the tab, hits Discard, etc.), the booking
-- moves to Abandoned/Discarded but the usage row was sitting there
-- consuming a slot forever. A 100-use coupon could be silently exhausted
-- by 100 abandoned carts.
--
-- WHAT THIS DOES
-- A BEFORE-UPDATE trigger on public.bookings detects the moment a status
-- transition lands on 'Abandoned' or 'Discarded' for a booking that
-- currently has a coupon attached, and:
--   1. Deletes the matching coupon_uses row (frees the limit slot).
--   2. Clears the denormalised coupon columns on the booking
--      (coupon_id, coupon_code, discount_amount).
--   3. Resets payment_amount back to original_amount when present, so a
--      patient who resumes the booking sees the un-discounted price and
--      can choose whether to re-apply the same code (limits permitting)
--      or a different one.
--
-- We touch only OLD.coupon_id IS NOT NULL — bookings without a coupon
-- skip the work entirely (no extra writes on the hot Abandoned path).
--
-- BEFORE vs AFTER trigger: BEFORE so we can mutate NEW.* directly, saving
-- a second UPDATE round-trip and keeping the cleanup atomic with the
-- status change.
--
-- Idempotent.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.release_coupon_on_abandon()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only react when:
  --   * the status is actually changing (not a no-op UPDATE), AND
  --   * the new status is one of the cancellation states, AND
  --   * the booking currently has a coupon attached.
  IF NEW.status IN ('Abandoned', 'Discarded')
     AND OLD.status IS DISTINCT FROM NEW.status
     AND OLD.coupon_id IS NOT NULL
  THEN
    -- Free the usage-limit slot.
    DELETE FROM public.coupon_uses WHERE booking_id = NEW.id;

    -- Clear the denormalised coupon columns on the booking.
    NEW.coupon_id := NULL;
    NEW.coupon_code := NULL;
    NEW.discount_amount := NULL;

    -- Reset the price so a resumed booking starts at the original amount.
    IF NEW.original_amount IS NOT NULL THEN
      NEW.payment_amount := NEW.original_amount;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS release_coupon_on_abandon_trigger ON public.bookings;
CREATE TRIGGER release_coupon_on_abandon_trigger
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.release_coupon_on_abandon();
