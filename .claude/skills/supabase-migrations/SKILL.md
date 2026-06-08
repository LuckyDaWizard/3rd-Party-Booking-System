---
name: Supabase Migrations
description: Create and modify Supabase database schema for the 3rd Party Booking System. Use whenever adding or changing tables, columns, RLS policies, junction tables, or writing migration SQL. Covers the GRANT/permission rules, snake_case naming, junction-table constraints, and the correct anon key format.
---

# Supabase Migrations

Procedure and hard rules for changing the database in the 3rd Party Booking System. These come from real bugs — follow them exactly.

## Golden rules

- **Migrations only.** Never modify the database directly through the dashboard. Every schema change is a migration file so it is reproducible and reviewable.
- **Always read before editing.** Read the target migration/table definition and any related store file before changing schema. Do not assume column names or shapes from memory.
- **RLS on every table.** Row Level Security is mandatory on every table — patients must only ever see their own data. No table ships without policies.

## Required permission grants (the 401 trap)

After creating any table you **must** grant access to the `anon` and `authenticated` roles, or the frontend gets `401 "permission denied"` errors (Postgres code `42501`):

```sql
GRANT ALL ON TABLE <table> TO anon;
GRANT ALL ON TABLE <table> TO authenticated;
```

Reviewers must block any migration that creates a table without these grants.

## Naming and column conventions

- All tables and columns use **`snake_case`** (e.g. `client_name`, `contact_person_name`, `created_at`).
- Frontend stores map `snake_case` ↔ `camelCase`; keep DB side snake_case only.
- When adding columns to an existing table, use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` and provide sensible defaults so existing rows stay valid.

## Query ordering

All list queries must order newest-first so the most recent record appears at the top of the UI:

```ts
.order("created_at", { ascending: false })
```

Flag any store using `ascending: true`.

## Junction tables (many-to-many)

For many-to-many relationships (e.g. `user_units` for users ↔ units), every junction table needs all of:

- `ON DELETE CASCADE` on **both** foreign keys
- a `UNIQUE` constraint on the pair (prevents duplicate assignments)
- `GRANT ALL ... TO anon, authenticated`

The matching frontend store must handle insert **and** delete of junction rows alongside the main entity (e.g. an `updateUserUnits` method), not just the parent record.

## Anon key format (connection trap)

Use the **legacy JWT anon key**, which starts with:

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

The newer publishable key format (`sb_publishable_...`) does **not** work with `@supabase/supabase-js`. Get the correct key from Settings → API → "Legacy anon, service_role API keys".

## Secrets

Store all secrets in Supabase environment variables — never commit them to code.

## Checklist for a new table

1. `CREATE TABLE` with snake_case columns, defaults, constraints.
2. Enable RLS and add policies scoping rows to the owning patient/user.
3. `GRANT ALL ... TO anon, authenticated`.
4. If many-to-many: add junction table with CASCADE + UNIQUE + grants.
5. Create/adjust the frontend store (context provider, CRUD, snake↔camel mapping, `created_at desc`).
6. Register the provider in `(dashboard)/layout.tsx` if it is shared state.
