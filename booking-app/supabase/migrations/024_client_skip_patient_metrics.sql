-- =============================================================================
-- Migration 024 — Skip-patient-metrics flag (sub-option of bill_monthly)
--
-- Adds clients.skip_patient_metrics. When TRUE (and bill_monthly is also
-- TRUE), bookings under this client skip the /patient-metrics step in
-- the booking flow — Operators go straight from /payment/success to
-- /create-booking/creating after the auto-completed payment.
--
-- The UI exposes this toggle only inside the blue "Bill at end of month"
-- panel; turning bill_monthly OFF in the UI also forces this flag OFF.
-- The PATCH route enforces the same coupling server-side: any update
-- that lands bill_monthly = false also forces skip_patient_metrics =
-- false, even if the request body didn't mention it.
--
-- Idempotent.
-- =============================================================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS skip_patient_metrics BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.clients.skip_patient_metrics IS
  'When TRUE (and bill_monthly is TRUE), bookings under this client skip the patient-metrics step in the booking flow. Sub-option of bill_monthly — meaningless on its own.';
