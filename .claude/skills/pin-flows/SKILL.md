---
name: PIN & Sensitive Actions
description: Implement or operate PIN authentication and other sensitive flows (PIN reset, account deletion) in the 3rd Party Booking System. Use when building two-step confirmation dialogs, OTP digit inputs, or running the PIN admin scripts. Covers the synthetic-email auth scheme, dual-write to public.users + auth.users, and the maintenance scripts.
---

# PIN & Sensitive Actions

How PINs and other destructive/sensitive operations work in the 3rd Party Booking System — both the UI flows and the backend/admin scripts. PINs are the auth credential, so correctness matters.

## How PIN auth is wired

A user's PIN is the login credential, and it lives in **two places that must stay in sync**:

1. `public.users.pin`
2. `auth.users` — both the **email** and the **password**, because the auth email is synthetic and derived from the PIN: `pin-{pin}@carefirst.local`.

Because the email is derived from the PIN, changing a PIN means changing the auth email *and* password, not just the `public.users.pin` column. Always write the auth side first, then `public.users`; if the auth update fails nothing changes, and if the `public.users` update fails roll the auth side back so the two never drift.

> Current implementation stores PINs as plaintext as a placeholder. In production these must be hashed. Flag plaintext PIN storage in reviews.

## Two-step confirmation UX (sensitive actions)

Sensitive operations — PIN reset, account deletion — use a **two-dialog flow**:

1. **Intent dialog:** "Are you sure?" with action + cancel.
2. **Verification dialog:** enter a code via individual digit inputs, with Continue + cancel.

Chain them: close the first and open the second on confirm.

## OTP / digit-input component

For PIN and verification code entry, use individual single-digit `<input>` elements:

- `maxLength={1}`, `inputMode="numeric"`
- entering a digit auto-advances focus to the next input
- backspace on an empty input moves focus to the previous one
- the Continue button **activates visually the instant all digits are filled** (conditional `className`, not hover, not just `disabled`)

## Admin / maintenance scripts

These live in `booking-app/scripts/`. All use the **service role key**, must be run **locally only**, and are **idempotent**. Run from `booking-app/` with `node --env-file=.env.local scripts/<script>`.

- **`backfill-auth-users.mjs`** — creates a Supabase Auth user for every `public.users` row using the `pin-{pin}@carefirst.local` scheme and stores the new id back on `public.users.auth_user_id`. Skips rows that already have `auth_user_id`. Run this first; the PIN-update script refuses to run on users without an `auth_user_id`.
- **`update-user-pin.mjs <user-id> <new-pin>`** — updates one user's PIN in both `public.users` and `auth.users` (email + password). Refuses if the new PIN is already taken or if the user has no `auth_user_id`. Auth-first with rollback.
- **`migrate-pins-to-6-digits.mjs`** — one-off bulk migration to 6-digit PINs across all users, identifying users by full name. Refuses if any target PIN collides with another user. Stops on first hard error so you can fix and re-run.
- **`delete-user.mjs <id>`** — hard-deletes an app user: `user_units` rows first, then `public.users`, then the linked `auth.users` row. Refuses without an explicit id, prints the user before deleting, and refuses to delete an `Active` user unless `--force` is passed (disable-then-delete is the intended pattern).

## Safety rules for any sensitive script

- Service role key only, run locally, never expose in the browser or commit it.
- Print/sanity-check the target record before mutating or deleting it.
- Keep `public.users` and `auth.users` in sync — dual-write with rollback.
- Prefer disable-then-delete over deleting active records.
