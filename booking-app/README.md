# CareFirst Third Party Booking System

Web app for clinic operators to capture a patient's details, take payment, and
hand off to the CareFirst Patient app for the actual consultation. This repo
is the intake / payment gateway only — the consultation itself lives in a
separate product.

Live at **http://187.127.135.11:3000** (HTTPS migration pending).

## Stack

- **Next.js 16** (App Router, React Server Components, `output: "standalone"`)
- **Supabase** (Postgres + Auth + Storage, real RLS, numbered migrations under `supabase/migrations/`)
- **Tailwind v4** with `@theme inline` tokens in `src/app/globals.css`
- **PayFast** for card payments (sandbox + production, ITN webhook + pull reconciliation)
- **Docker** multi-stage build, deployed on a Hostinger VPS behind Traefik
- **Nodemailer** + SMTP for transactional email

## Local dev

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Hot-reload on save.

Required env vars (create `.env.local` from the keys in
[`docker-compose.yml`](./docker-compose.yml) — never commit this file):

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (public) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (public) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key — server-side only, never exposed to the browser |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | Outbound email (mail.carefirst.co.za:465) |
| `PAYFAST_MERCHANT_ID` / `PAYFAST_MERCHANT_KEY` / `PAYFAST_PASSPHRASE` / `PAYFAST_TEST_MODE` | PayFast credentials (sandbox or production) |
| `NEXT_PUBLIC_APP_URL` | Used to build outbound links + the PayFast notify URL |

## Useful routes

| Route | Purpose |
|---|---|
| `/home` | Operator dashboard — start a booking, view patient history |
| `/create-booking/…` | The 4-step booking flow (search → patient details → payment → handoff) |
| `/security` | 4-tab security dashboard (failed attempts, sessions, suspicious activity, sign-in history) |
| `/audit-log` | Full audit trail (Admin + Bookings tabs) |
| `/reports` | Architecture diagrams + incident reports (`system_admin` only) |
| `/design-system` | Component primitives catalogue + consolidation outcome |
| `/system-audit.html` | Management-facing audit document with progress tracker |

## Roles

Three roles, server-side enforced on every protected route:

- **`system_admin`** — full access across all units, branding, reports
- **`unit_manager`** — manage their unit's users + bookings
- **`user`** — capture bookings for their assigned unit

RLS policies in Postgres back this up; even a broken auth check on the server
cannot leak another unit's data.

## Deploying

The VPS pulls from `main` and rebuilds the Docker image:

```bash
ssh root@187.127.135.11
cd /opt/3rd-Party-Booking-System/booking-app && git pull && docker compose up -d --build
```

Build takes 5–10 min. Rollback by `git reset --hard <previous-sha>` and
re-running the same one-liner.

## Docs in this repo

- [`OPERATIONS.md`](./OPERATIONS.md) — runbook: backups, refunds, deploys, rollbacks, common incidents
- [`public/system-audit.html`](./public/system-audit.html) — full system audit with completion tracker
- [`supabase/migrations/`](./supabase/migrations) — numbered, forward-only SQL migrations (001 → 029)

## Repo layout

```
booking-app/
├── src/
│   ├── app/                  Next.js App Router pages + API routes
│   │   ├── (auth)/           Sign-in, forgot-pin, reset-pin
│   │   ├── (dashboard)/      Authenticated app (operator + admin pages)
│   │   ├── api/              Server routes (admin/, bookings/, payfast/, …)
│   │   └── pay/[bookingId]/  Public PayFast handoff page
│   ├── components/ui/        Shared primitives (Button, Banner, Dialog, …)
│   └── lib/                  Stores (auth, booking, unit, user, client),
│                             helpers, Supabase clients
├── supabase/migrations/      Numbered SQL migrations
├── docs/                     Source copies of HTML docs
├── public/                   Static assets + the served audit page
├── Dockerfile                Multi-stage build (deps → builder → runner)
└── docker-compose.yml        Single service, Traefik labels
```
