-- =============================================================================
-- 020_consultation_validator_columns.sql
--
-- Records WHO validated a consultation (i.e. clicked Start Consult and
-- successfully handed the patient off to CareFirst). The Start Consult
-- action requires the operator to re-enter their PIN, so the user_id we
-- capture here is a high-trust attestation that the named user authorised
-- the consultation hand-off.
--
-- We denormalise name + email at write time (not just user_id) so that
-- historical reports remain accurate even if the user's profile is later
-- renamed, deactivated, or deleted.
--
-- service_role only writes these columns (no GRANT to authenticated) — they
-- are populated by /api/bookings/[id]/start-consultation only.
-- =============================================================================

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS validated_by_user_id   UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS validated_by_name      TEXT,
  ADD COLUMN IF NOT EXISTS validated_by_email     TEXT;

COMMENT ON COLUMN public.bookings.validated_by_user_id IS
  'public.users.id of the operator who successfully ran Start Consult on this booking. PIN-verified at the time.';
COMMENT ON COLUMN public.bookings.validated_by_name IS
  'Snapshot of the validator''s full name at the moment of Start Consult.';
COMMENT ON COLUMN public.bookings.validated_by_email IS
  'Snapshot of the validator''s email at the moment of Start Consult.';

CREATE INDEX IF NOT EXISTS idx_bookings_validated_by_user_id
  ON public.bookings (validated_by_user_id);
