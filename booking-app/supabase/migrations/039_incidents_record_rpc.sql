-- =============================================================================
-- Migration 039 — incidents partial unique index + record_incident() RPC
--
-- WHY
-- recordIncident() in src/lib/incidents.ts did 2-3 sequential round-trips per
-- upstream failure (SELECT existing → INSERT or UPDATE → retry SELECT+UPDATE
-- on insert race). It's called from PayFast notify/reconcile + Start Consult,
-- which are hot precisely during outages — when we're already amplifying our
-- own DB load at the worst time.
--
-- WHAT THIS DOES
-- 1. A partial unique index on (signature) WHERE status='open' lets us
--    safely use ON CONFLICT to merge concurrent open-incident writes.
--    Closed/resolved incidents are excluded so historical rows don't
--    interfere with the conflict resolution.
-- 2. A SECURITY DEFINER RPC `record_incident(...)` that does the full
--    insert-or-merge in a single SQL statement, returning the resulting
--    incident id. Single round-trip from the application.
--
-- The application caller goes from 2-3 awaits to 1 RPC call.
-- =============================================================================

-- 1. Partial unique index on open incidents. Distinct rows with the same
--    signature ARE allowed when one is resolved/closed and a new one opens —
--    we WANT a new row for the new incident occurrence, not to revive the
--    closed one.
CREATE UNIQUE INDEX IF NOT EXISTS incidents_open_signature_unique
  ON public.incidents (signature)
  WHERE status = 'open';

-- 2. The merge-or-create RPC. SECURITY DEFINER because the function reads/
--    writes the incidents table which is service-role-only under RLS — the
--    function runs with table-owner privileges regardless of caller, so
--    server-side API routes (which already authenticate as service_role)
--    keep their permissions, and we don't have to expose the table to
--    other roles.
CREATE OR REPLACE FUNCTION public.record_incident(
  p_signature         text,
  p_source            text,
  p_category          text,
  p_title             text,
  p_http_status       integer,
  p_error_msg         text,
  p_raw_sample        text,
  p_booking_id        uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Try to merge into an existing open incident with the same signature.
  -- The partial unique index above guarantees at most one open row per
  -- signature exists at a time, so the conflict target is safe.
  INSERT INTO public.incidents AS i (
    signature,
    source,
    category,
    title,
    http_status,
    error_msg,
    raw_sample,
    affected_booking_ids,
    failure_count,
    status
  )
  VALUES (
    p_signature,
    p_source,
    p_category,
    p_title,
    p_http_status,
    p_error_msg,
    p_raw_sample,
    CASE WHEN p_booking_id IS NOT NULL THEN ARRAY[p_booking_id] ELSE ARRAY[]::uuid[] END,
    1,
    'open'
  )
  ON CONFLICT (signature) WHERE status = 'open'
  DO UPDATE SET
    -- Bump the running counter + freshen the diagnostic fields.
    failure_count = i.failure_count + 1,
    last_seen_at = NOW(),
    error_msg = EXCLUDED.error_msg,
    raw_sample = EXCLUDED.raw_sample,
    http_status = EXCLUDED.http_status,
    -- Append the new booking id to the affected list, deduplicating to keep
    -- the array sane across many retries of the same booking. ARRAY_CAT +
    -- DISTINCT via SELECT.unnest is the standard pattern for "set union" on
    -- a Postgres array column.
    affected_booking_ids = (
      SELECT COALESCE(ARRAY_AGG(DISTINCT x), ARRAY[]::uuid[])
      FROM unnest(
        i.affected_booking_ids ||
        CASE WHEN p_booking_id IS NOT NULL THEN ARRAY[p_booking_id] ELSE ARRAY[]::uuid[] END
      ) AS x
    )
  RETURNING i.id INTO v_id;

  RETURN v_id;
END;
$$;
