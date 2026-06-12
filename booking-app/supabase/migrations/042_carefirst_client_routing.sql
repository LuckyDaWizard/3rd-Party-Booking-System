-- =============================================================================
-- Migration 042 — per-client CareFirst SSO routing fields (B1)
--
-- WHY
-- Until now every booking handed off to the SAME CareFirst account, resolved
-- from a single set of env vars (CAREFIRST_API_DOMAIN / _API_KEY / _CLIENT_CODE
-- / _CLIENT_PLAN_CODE) in src/lib/carefirst.ts. B1 lets each client route to
-- its OWN CareFirst account. Routing resolves per booking via
-- booking.unit_id → unit.client_id → clients, falling back to the env default
-- for un-mapped clients and FAILING CLOSED for partially-configured ones
-- (never silently route a patient to the wrong CareFirst account).
--
-- SECRET HANDLING (B-ENV): the per-client API KEY is NOT stored in the DB.
-- It lives in the SSH `.env`, keyed by the CareFirst client code:
--   CAREFIRST_API_KEY__<carefirst_client_code>   e.g. CAREFIRST_API_KEY__4B0B68ADC6
-- The resolver in carefirst.ts derives that env var name from the code below.
-- The format CHECK (^[A-Z0-9]+$) is what makes that derivation safe — the code
-- can only contain characters that are legal in an env var name suffix, so it
-- can never inject a weird key or read an unintended variable.
--
-- WHAT THIS DOES
--   Adds three NULLABLE, NON-SECRET routing columns to public.clients:
--     carefirst_client_code  — CareFirst's client code (e.g. "4B0B68ADC6").
--                              DISTINCT from our existing client_code column,
--                              which is the short PayFast m_payment_id prefix.
--     carefirst_plan_code    — optional per-client plan code override.
--     carefirst_api_domain   — optional per-client CareFirst API domain override.
--   Plus a format CHECK on carefirst_client_code that tolerates NULL.
--
-- No backfill, no NOT NULL: existing clients keep null routing fields and
-- continue to use the env default (unchanged behaviour). Codes are assigned
-- later via the Manage Client UI.
--
-- GRANTS: new columns inherit public.clients' existing column-level grants —
-- no GRANT needed (same as migrations 034 / 041). These are NON-SECRET routing
-- fields, so they are safe to be SELECT-able like client_code; no REVOKE.
--
-- RLS: no policy change. Client writes go through the service-role admin routes
-- (/api/admin/clients[/id]) which bypass RLS and validate/normalise in code.
--
-- Idempotent per project convention. Do NOT run automatically — applied
-- separately as part of the deploy.
-- =============================================================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS carefirst_client_code text;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS carefirst_plan_code text;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS carefirst_api_domain text;

COMMENT ON COLUMN public.clients.carefirst_client_code IS
  'CareFirst''s client code for per-client SSO routing (e.g. "4B0B68ADC6"). NON-SECRET. DISTINCT from client_code (the PayFast m_payment_id prefix). The per-client API KEY is NOT stored here — it lives in env as CAREFIRST_API_KEY__<carefirst_client_code>. Nullable; null → booking uses the env-default CareFirst account.';

COMMENT ON COLUMN public.clients.carefirst_plan_code IS
  'Optional per-client CareFirst plan-code override (NON-SECRET). Null → resolver falls back to env CAREFIRST_CLIENT_PLAN_CODE.';

COMMENT ON COLUMN public.clients.carefirst_api_domain IS
  'Optional per-client CareFirst API domain override (NON-SECRET). Bare hostname or full http(s) URL. Null → resolver falls back to env CAREFIRST_API_DOMAIN.';

-- Format check that tolerates NULL (unset codes). Uppercase letters + digits
-- only. This charset guard is what makes deriving the env var name
-- CAREFIRST_API_KEY__<carefirst_client_code> safe — the code can never contain
-- characters that would build an unintended / malformed env var name.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clients_carefirst_client_code_format'
  ) THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_carefirst_client_code_format
      CHECK (carefirst_client_code IS NULL OR carefirst_client_code ~ '^[A-Z0-9]+$');
  END IF;
END $$;
