-- =============================================================================
-- Migration 041 — clients.client_code (nullable, unique, uppercase-alnum)
--
-- WHY
-- Two consumers need a short, human-readable per-client identifier:
--   1. PayFast m_payment_id prefix. Until now m_payment_id was the bare booking
--      UUID, which is opaque in the PayFast merchant dashboard / settlement
--      reports — an operator reconciling a payout can't tell which client a
--      transaction belongs to. The payment-initiate route now builds
--      m_payment_id as "<CLIENT_CODE>-<booking-uuid>" when the booking's client
--      has a code, falling back to the bare UUID when it doesn't. Both PayFast
--      confirmation paths (ITN notify + Transaction History reconcile) strip a
--      recognised code prefix before resolving the booking, so legacy bare-UUID
--      refs and new prefixed refs both work.
--   2. Future B1 multi-client routing key — a stable short slug per client that
--      can key public routing / sub-paths without exposing the UUID.
--
-- WHAT THIS DOES
--   1. Adds a NULLABLE `client_code` text column. Nullable because existing
--      clients get codes later via the Manage Client UI — there is NO backfill
--      and NO NOT NULL. A booking under a client with a null code simply uses
--      the bare-UUID m_payment_id, so nothing breaks before codes are assigned.
--   2. A format CHECK that ALLOWS NULL: when present, the code must be 3–5
--      uppercase letters/digits, no hyphen (the hyphen is the reserved
--      separator between code and UUID in m_payment_id). Mirrors CLIENT_CODE_RE
--      in src/lib/client-code.ts.
--   3. A PARTIAL UNIQUE index (WHERE client_code IS NOT NULL) so codes are
--      unique among clients that have one, while allowing many NULLs to coexist
--      (a plain UNIQUE would treat NULLs as distinct in Postgres anyway, but the
--      partial index keeps the index small and the intent explicit — mirrors the
--      bookings_idempotency_key_uniq pattern from migration 040).
--
-- GRANTS: a new column on public.clients inherits the table's existing
-- column-level grants — no new GRANT statement needed (same as migration 034's
-- allow_coupons column).
--
-- RLS: no policy change. Client writes already go through the service-role
-- admin routes (/api/admin/clients[/id]) which bypass RLS; those routes
-- validate + normalise the code in code (uppercase-trim, format check, 23505 →
-- 409 on collision).
--
-- Idempotent per project convention. Do NOT run automatically — applied
-- separately as part of the deploy.
-- =============================================================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS client_code text;

COMMENT ON COLUMN public.clients.client_code IS
  'Short human-readable per-client identifier (3-5 uppercase letters/digits, no hyphen). Nullable; assigned via the Manage Client UI, no backfill. Used as the PayFast m_payment_id prefix ("<CLIENT_CODE>-<booking-uuid>") and reserved as the future B1 multi-client routing key.';

-- Format check that tolerates NULL (unset codes). The hyphen is intentionally
-- excluded — it is the reserved separator in m_payment_id.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clients_client_code_format'
  ) THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_client_code_format
      CHECK (client_code IS NULL OR client_code ~ '^[A-Z0-9]{3,5}$');
  END IF;
END $$;

-- Partial unique index: uniqueness only among clients that carry a code, so
-- the many null-code rows never collide. Mirrors migration 040.
CREATE UNIQUE INDEX IF NOT EXISTS clients_client_code_uniq
  ON public.clients (client_code)
  WHERE client_code IS NOT NULL;
