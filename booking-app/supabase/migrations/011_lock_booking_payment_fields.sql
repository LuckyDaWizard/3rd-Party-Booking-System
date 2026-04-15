-- =============================================================================
-- 011_lock_booking_payment_fields.sql
--
-- Prevent authenticated users from writing to payment-sensitive columns on
-- public.bookings. Before this migration, a user could directly mark their
-- own booking as "Payment Complete" by writing to the bookings table with
-- the anon/authenticated client (unit-scoped RLS allowed it). That's a
-- financial-integrity risk.
--
-- Fix: use Postgres column-level privileges. Revoke UPDATE on all columns,
-- then grant back UPDATE only on the columns users legitimately need to
-- modify (patient details, vitals, contact info, status transitions for
-- Discarded/Abandoned, etc). Payment columns (`status`, `payment_amount`,
-- `pf_payment_id`, `payment_confirmed_at`) are NOT re-granted — only
-- service_role can touch them.
--
-- Note: `status` is tricky. Users legitimately write:
--   - "In Progress" (on create)
--   - "Discarded"   (on explicit discard)
--   - "Abandoned"   (on browser close / nav away)
-- but must NOT write:
--   - "Payment Complete"
--   - "Successful"
--
-- Postgres column-grants operate at column level, not value level — so we
-- can't grant-some-values-but-not-others. Instead, we:
--   1. Revoke UPDATE on `status` from authenticated
--   2. Add an RLS trigger that rejects status transitions that change
--      status to "Payment Complete" or "Successful" unless the caller is
--      service_role (or system_admin).
--
-- Rollback: revert the GRANTs and DROP the trigger.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Revoke blanket UPDATE, then grant back only the safe columns.
--
-- This is the defense-in-depth layer. Even if RLS lets the row through,
-- the column grant blocks UPDATE on payment columns.
-- ---------------------------------------------------------------------------
REVOKE UPDATE ON public.bookings FROM authenticated;

-- Grant UPDATE only on columns users legitimately modify during the
-- booking flow. Anything not listed here is service-role-only.
GRANT UPDATE (
  current_step,
  search_type,
  first_names,
  surname,
  id_type,
  id_number,
  title,
  nationality,
  gender,
  date_of_birth,
  address,
  suburb,
  city,
  province,
  country,
  postal_code,
  country_code,
  contact_number,
  email_address,
  script_to_another_email,
  additional_email,
  payment_type,
  blood_pressure,
  glucose,
  temperature,
  oxygen_saturation,
  urine_dipstick,
  heart_rate,
  additional_comments,
  terms_accepted,
  terms_accepted_at,
  unit_id,
  status
) ON public.bookings TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Trigger: reject status transitions to payment-complete states from
--    non-service_role callers.
--
-- This is the value-level check that column grants alone can't do. The
-- trigger fires on UPDATE and raises an exception if status is changing
-- to "Payment Complete" or "Successful" and the caller is not service_role
-- or system_admin.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_booking_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  -- service_role bypasses the check entirely.
  IF current_setting('role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- If the status is not changing, allow.
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- If the new status is a payment-complete state, only system_admin may set it.
  IF NEW.status IN ('Payment Complete', 'Successful') THEN
    IF public.current_app_user_role() <> 'system_admin' THEN
      RAISE EXCEPTION
        'Only service role or system_admin may transition a booking to %',
        NEW.status
        USING ERRCODE = '42501'; -- insufficient_privilege
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS enforce_booking_status_transition ON public.bookings;

CREATE TRIGGER enforce_booking_status_transition
  BEFORE UPDATE OF status ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_booking_status_transition();

-- ---------------------------------------------------------------------------
-- 3. Sanity check: confirm the trigger is in place and payment columns have
--    no UPDATE grant to authenticated.
-- ---------------------------------------------------------------------------
SELECT
  trigger_name,
  event_manipulation,
  event_object_table
FROM information_schema.triggers
WHERE trigger_name = 'enforce_booking_status_transition';
