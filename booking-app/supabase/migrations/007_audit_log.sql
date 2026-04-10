-- Migration 007: Audit log table for tracking all admin write operations
-- Required for medical compliance and accountability

CREATE TABLE public.audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  actor_id    uuid NOT NULL,
  actor_name  text NOT NULL,
  actor_role  text NOT NULL,
  action      text NOT NULL,
  entity_type text NOT NULL,
  entity_id   uuid NOT NULL,
  entity_name text,
  changes     jsonb,
  ip_address  text
);

-- Indexes for common query patterns
CREATE INDEX idx_audit_log_created_at ON public.audit_log (created_at DESC);
CREATE INDEX idx_audit_log_entity ON public.audit_log (entity_type, entity_id);
CREATE INDEX idx_audit_log_actor ON public.audit_log (actor_id);

-- RLS: system_admin can read via authenticated client; writes via service-role only
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "system_admin_can_read_audit_log"
  ON public.audit_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.auth_user_id = auth.uid()
        AND users.role = 'system_admin'
        AND users.status = 'Active'
    )
  );

-- Grant service_role full access (bypasses RLS but needs table grants)
GRANT ALL ON TABLE public.audit_log TO service_role;
GRANT SELECT ON TABLE public.audit_log TO authenticated;
