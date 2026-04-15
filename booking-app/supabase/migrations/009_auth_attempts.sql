-- Migration 009: Auth attempts table for brute-force protection
-- Tracks failed sign-in attempts per PIN. 5 failures in 15 minutes triggers lockout.

CREATE TABLE public.auth_attempts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pin         text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  succeeded   boolean NOT NULL DEFAULT false,
  ip_address  text
);

-- Index for efficient lookup by PIN within the lockout window
CREATE INDEX idx_auth_attempts_pin_time ON public.auth_attempts (pin, attempted_at DESC);

-- RLS: lock down completely. Only service_role (via API routes) can read/write.
ALTER TABLE public.auth_attempts ENABLE ROW LEVEL SECURITY;

-- No policies = no access for anon/authenticated roles.
-- service_role bypasses RLS automatically.

GRANT ALL ON TABLE public.auth_attempts TO service_role;
