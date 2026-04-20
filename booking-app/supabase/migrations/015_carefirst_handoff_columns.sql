-- =============================================================================
-- 015_carefirst_handoff_columns.sql
--
-- Add tracking columns for the "Start Consult" handoff to the external
-- CareFirst Patient application.
--
-- Flow:
--   1. Booking reaches status = "Payment Complete"
--   2. Nurse / admin clicks "Start Consult" and enters their PIN
--   3. Backend POSTs patient data to CareFirst Patient's
--      /api/external/client-sso/auto-register endpoint
--   4. On success: store external_reference_id + redirect URL, mark status
--      "Successful", and open the redirect URL in a new tab
--   5. On failure: booking stays at "Payment Complete" so the nurse can
--      retry. The error reason is logged for troubleshooting.
--
-- Retries are unlimited for now (we'll cap if abuse is seen). We do NOT
-- reset `handed_off_at` on each retry — it records the FIRST successful
-- handoff only.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add the handoff columns.
-- ---------------------------------------------------------------------------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS handed_off_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS handoff_status TEXT
    CHECK (handoff_status IS NULL OR handoff_status IN ('pending', 'sent', 'failed')),
  ADD COLUMN IF NOT EXISTS external_reference_id TEXT,
  ADD COLUMN IF NOT EXISTS handoff_redirect_url TEXT,
  ADD COLUMN IF NOT EXISTS handoff_error_reason TEXT,
  ADD COLUMN IF NOT EXISTS handoff_attempt_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_handoff_attempt_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- 2. Indexes for lookup / reporting.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_bookings_handed_off_at
  ON public.bookings (handed_off_at);

CREATE INDEX IF NOT EXISTS idx_bookings_handoff_status
  ON public.bookings (handoff_status);

CREATE INDEX IF NOT EXISTS idx_bookings_external_reference_id
  ON public.bookings (external_reference_id);

-- ---------------------------------------------------------------------------
-- 3. Column grants.
--
-- Migration 011 revoked blanket UPDATE on bookings and granted back only
-- the columns users legitimately modify during the booking flow. The new
-- handoff columns are NOT re-granted — only service_role can write them.
-- This prevents an authenticated user from manually marking a booking as
-- handed-off without actually calling the CareFirst API.
-- ---------------------------------------------------------------------------
-- (No GRANT statements needed — absence of GRANT == service_role only)

-- ---------------------------------------------------------------------------
-- 4. Sanity check.
-- ---------------------------------------------------------------------------
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'bookings'
  AND column_name IN (
    'handed_off_at',
    'handoff_status',
    'external_reference_id',
    'handoff_redirect_url',
    'handoff_error_reason',
    'handoff_attempt_count',
    'last_handoff_attempt_at'
  )
ORDER BY column_name;
