-- =============================================================================
-- Migration 037 — Make release_coupon_on_abandon a SECURITY DEFINER function
--
-- WHY
-- Migration 036 added a BEFORE-UPDATE trigger on public.bookings that
-- DELETEs from public.coupon_uses + clears denormalised coupon columns
-- when a booking moves to Abandoned/Discarded. The function was created
-- without an explicit security clause, which means it runs as SECURITY
-- INVOKER — with the caller's privileges.
--
-- That works fine when the caller is the service role (server-side API
-- routes), but BREAKS when the browser client triggers the UPDATE:
--   * The booking-store discards/abandons through the user's JWT.
--   * coupon_uses has RLS enabled with NO policies (service-role only).
--   * The trigger's DELETE on coupon_uses is denied → trigger raises →
--     the entire bookings UPDATE rolls back.
--   * The user sees "Couldn't discard this booking. Please retry."
--
-- WHAT THIS DOES
-- Recreates the function as SECURITY DEFINER so it always runs with
-- the function owner's privileges (postgres / migration role), which
-- bypasses RLS on coupon_uses for the cleanup DELETE. We pin a safe
-- search_path to avoid trojan-search-path attacks — the function only
-- ever touches public.coupon_uses, so that's all it needs.
--
-- The trigger binding from 036 is unchanged. Idempotent.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.release_coupon_on_abandon()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('Abandoned', 'Discarded')
     AND OLD.status IS DISTINCT FROM NEW.status
     AND OLD.coupon_id IS NOT NULL
  THEN
    DELETE FROM public.coupon_uses WHERE booking_id = NEW.id;

    NEW.coupon_id := NULL;
    NEW.coupon_code := NULL;
    NEW.discount_amount := NULL;

    IF NEW.original_amount IS NOT NULL THEN
      NEW.payment_amount := NEW.original_amount;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
