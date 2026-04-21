-- =============================================================================
-- 018_popia_consent_and_erasure.sql
--
-- POPIA compliance support (audit item #4):
--
--   1. consent_accepted_at — timestamp for the pre-PII data-collection
--      consent tick-box that now lives at Step 1 of the booking flow.
--      Separate from `terms_accepted_at` which records the existing
--      end-of-flow medical-consultation consent.
--
--   2. erased_at + erased_reason — tombstone columns so a right-to-
--      erasure request can anonymise the PII without fully deleting the
--      booking row. Keeping the row lets us satisfy medical records
--      retention (HPCSA rules) and financial records retention while
--      still honouring the POPIA erasure right: the row exists, but it
--      can no longer be linked back to a living person.
--
-- Neither column is granted UPDATE for authenticated users — only the
-- service_role (behind the new /api/admin/privacy/* routes) can write to
-- them. This follows the same pattern as the payment columns locked down
-- in migration 011.
-- =============================================================================

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS consent_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS erased_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS erased_reason TEXT;

-- Grant UPDATE on consent_accepted_at to authenticated users. The booking
-- flow sets this when the user ticks the consent checkbox at Step 1. The
-- erasure columns stay service-role-only.
GRANT UPDATE (consent_accepted_at) ON public.bookings TO authenticated;

-- Index for efficient "list abandoned bookings older than N days that
-- haven't been erased yet" queries used by the retention sweep.
CREATE INDEX IF NOT EXISTS idx_bookings_erased_at
  ON public.bookings (erased_at);

CREATE INDEX IF NOT EXISTS idx_bookings_status_created_at
  ON public.bookings (status, created_at);

-- Sanity check.
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'bookings'
  AND column_name IN ('consent_accepted_at', 'erased_at', 'erased_reason')
ORDER BY column_name;
