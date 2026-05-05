-- =============================================================================
-- 019_user_avatars_bucket.sql
--
-- Adds the Storage bucket used for user profile pictures. The
-- `users.avatar_url` column already exists from a much earlier migration
-- (003 era) — only the bucket + read policy are new.
--
-- Public-read so the URL works directly in <img>; writes are restricted
-- to service_role (the API route is the only writer).
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'user-avatars',
  'user-avatars',
  true,
  2097152,                                                  -- 2 MiB hard cap
  ARRAY['image/png', 'image/jpeg', 'image/webp']
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
      AND policyname = 'user-avatars public read'
  ) THEN
    CREATE POLICY "user-avatars public read"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'user-avatars');
  END IF;
END
$$;
