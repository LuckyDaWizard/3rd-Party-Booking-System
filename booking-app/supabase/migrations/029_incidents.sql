-- Migration 029: Incidents table for automatic upstream-failure detection.
--
-- Populated by failure sites (Start Consult, PayFast ITN, PayFast reconcile).
-- A new failure with the same `signature` increments an open incident's
-- failure_count and last_seen_at; a different signature opens a new one.
-- Auto-resolves (status = 'resolved') after 30 min of no new failures via the
-- sweep helper in lib/incidents.ts, which is invoked lazily on every list
-- read so we don't need a separate cron.
--
-- The unique partial index on (signature) WHERE status = 'open' is what
-- enforces single-open-incident-per-signature; the helper does a select-then-
-- update-or-insert pattern that races safely under that constraint.

CREATE TABLE public.incidents (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signature             text NOT NULL,
  source                text NOT NULL,
  category              text NOT NULL,
  title                 text NOT NULL,
  http_status           int,
  error_msg             text NOT NULL,
  raw_sample            text,
  status                text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'resolved')),
  first_seen_at         timestamptz NOT NULL DEFAULT now(),
  last_seen_at          timestamptz NOT NULL DEFAULT now(),
  resolved_at           timestamptz,
  failure_count         int NOT NULL DEFAULT 1,
  affected_booking_ids  uuid[] NOT NULL DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_incidents_status_lastseen
  ON public.incidents (status, last_seen_at DESC);

CREATE UNIQUE INDEX idx_incidents_open_signature
  ON public.incidents (signature) WHERE status = 'open';

ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "system_admin_can_read_incidents"
  ON public.incidents FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.auth_user_id = auth.uid()
        AND users.role = 'system_admin'
        AND users.status = 'Active'
    )
  );

GRANT ALL ON TABLE public.incidents TO service_role;
GRANT SELECT ON TABLE public.incidents TO authenticated;
