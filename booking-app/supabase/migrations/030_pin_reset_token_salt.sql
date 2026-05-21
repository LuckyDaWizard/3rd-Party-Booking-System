-- =============================================================================
-- 030_pin_reset_token_salt.sql
--
-- Add a per-token random salt to pin_reset_tokens (audit #16).
--
-- Background: the original schema (migration 017) hashed the 6-digit reset
-- code as sha256(code || ':' || user_id). Using user_id as the salt is weak
-- because the user_id sits in the same row — a token-table dump gives an
-- attacker everything they need to brute-force all 10^6 possible codes for
-- every row in seconds.
--
-- Fix: store a random salt per token; the application hashes with it on
-- insert and looks it up on verify.
--
-- The salt column is NULLABLE so this migration doesn't have to invent
-- values for historical rows. Any UNUSED token in the table at deploy time
-- is dropped because it has no salt and would fail verification under the
-- new code anyway — reset tokens are 15-minute-lived, so the worst case is
-- that a user mid-reset has to request a fresh code.
--
-- Idempotent.
-- =============================================================================

-- Drop in-flight tokens — they can't verify under the new code path.
DELETE FROM public.pin_reset_tokens WHERE used_at IS NULL;

ALTER TABLE public.pin_reset_tokens
  ADD COLUMN IF NOT EXISTS token_salt TEXT;

COMMENT ON COLUMN public.pin_reset_tokens.token_salt IS
  'Random per-token salt (32 hex chars / 128 bits). Combined with the 6-digit code in the application hash. NULL only for historical used rows from before migration 030 — new inserts must always provide a salt.';
