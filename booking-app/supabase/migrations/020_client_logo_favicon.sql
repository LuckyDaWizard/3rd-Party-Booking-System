-- =============================================================================
-- 020_client_logo_favicon.sql
--
-- Per-client branding assets — logo + square favicon. This migration only
-- adds the data layer; the corresponding theming work (which surfaces use
-- these, accessibility, sign-in branding, etc.) ships as separate features.
--
-- Both columns are nullable — clients without uploads keep using the
-- system defaults.
--
-- Storage bucket `client-logos` holds both kinds keyed by:
--   <clientId>/logo.<ext>
--   <clientId>/favicon.<ext>
-- Public-read so the URLs work in <img>; writes are restricted to
-- service_role (the API routes are the only writers).
-- =============================================================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS logo_url    TEXT,
  ADD COLUMN IF NOT EXISTS favicon_url TEXT;

COMMENT ON COLUMN public.clients.logo_url IS
  'Public URL of the client logo (Supabase Storage, bucket=client-logos).';
COMMENT ON COLUMN public.clients.favicon_url IS
  'Public URL of the square favicon variant. Same bucket as logo_url.';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'client-logos',
  'client-logos',
  true,
  2097152,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon']
)
ON CONFLICT (id) DO UPDATE
  SET public            = EXCLUDED.public,
      file_size_limit   = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'client-logos public read'
  ) THEN
    CREATE POLICY "client-logos public read"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'client-logos');
  END IF;
END
$$;
