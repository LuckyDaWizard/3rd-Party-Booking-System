# Operations Runbook

Short operational procedures for the CareFirst Third Party Booking System.
This file is committed to the repo so anyone with production access can find
it quickly.

---

## Terminology

Use these terms consistently in code, copy, and support conversations.
Mixing "clinic", "practice", "facility", etc. confuses staff and leaks
into patient-facing UI. Keep them pinned to what the data model calls
them.

| Term | Means | Examples |
|---|---|---|
| **Client** | The parent organisation that uses our system. Maps to the `public.clients` table. One Client can have many Units. | "ACME Health Group", "Provincial Hospitals NPC" |
| **Unit** | A specific location, department, or clinic belonging to a Client. Maps to `public.units`. All bookings, staff, and patient records are scoped to a Unit via `unit_id`. | "ACME Health — Sandton Branch", "Provincial Hospitals — Oncology" |
| **User** | A staff member who signs in to the system. Three roles: `system_admin`, `unit_manager`, `user`. Non-admins are scoped to specific Units via `user_units`. | The nurse capturing a booking |
| **Patient** | A person a User creates a booking for. Not a signed-in user of our system. Their data lives on the `bookings` row. | Walk-in from a clinic |
| **Booking** | One consultation attempt. Has a status lifecycle: In Progress → Payment Complete → Successful (or Discarded / Abandoned). | Each row in `public.bookings` |
| **Consultation** | The clinical session that happens in the CareFirst Patient app AFTER handoff. We don't own this concept — it lives downstream. | Triggered by "Start Consult" |

### Don't use

- ❌ **Clinic** — use "Unit" instead (unless the unit's display name genuinely contains the word)
- ❌ **Practice** — same reason
- ❌ **Facility** — same reason
- ❌ **Customer** — patients aren't our customers; the Client is
- ❌ **Account** — too vague; use User, Client, or Unit

---

## Manual Refund Process

**Why this is manual:** The booking system does not have a refund flow. The
built-in PayFast API integration only covers charging — all refunds are
issued from the PayFast merchant dashboard by a supervisor, then reconciled
into our system by an admin.

### When a refund is needed

Typical scenarios:
- Patient paid but the consultation cannot happen (e.g. no practitioner
  available, CareFirst Patient handoff failure, technical error)
- Duplicate payment from retried checkout
- Patient dispute / goodwill refund

### Step-by-step

**Step 1 — Verify the payment on PayFast**
1. Sign in to the PayFast merchant dashboard
   (sandbox: https://sandbox.payfast.co.za — production URL will differ).
2. Go to **Transactions** → find the transaction by:
   - `pf_payment_id` (visible in the booking's audit log on our side), OR
   - patient email / card last-4 / amount / date
3. Confirm the transaction is **COMPLETE** and within the refund window
   (PayFast's own policy applies — typically 30–180 days depending on
   the payment method).

**Step 2 — Issue the refund on PayFast**
1. Open the transaction in PayFast.
2. Click **Refund** → enter the amount (full refund for R325.00 unless
   partial is agreed).
3. Add a note in PayFast's refund reason field for your own audit trail
   (e.g. "Consultation cancelled — practitioner unavailable 2026-04-20").
4. Confirm.
5. Wait for PayFast to confirm the refund was initiated. It may take
   several business days to reflect on the patient's statement — PayFast's
   own timelines apply.

**Step 3 — Record the refund in our system**
The booking system doesn't have a "Refunded" status. To keep the audit
trail honest, do one of the following depending on where the booking is
in the flow:

- **Booking at "Payment Complete" (not yet handed off to CareFirst Patient):**
  Leave the status at "Payment Complete" — the nurse will not click Start
  Consult. Add an audit-log note via a manual DB statement (see below).

- **Booking already "Successful" (handed off to CareFirst Patient):**
  Leave the status at "Successful". Contact CareFirst Patient to cancel
  the consultation on their side as well. Add an audit-log note.

**Example audit-log SQL** (system_admin, via Supabase SQL editor):

```sql
-- Adapt actor_* to your own user. entity_id is the booking UUID.
INSERT INTO public.audit_log (
  actor_id, actor_name, actor_role,
  action, entity_type, entity_id, entity_name,
  changes, ip_address
) VALUES (
  '<your users.id>', '<Your Name>', 'system_admin',
  'refund', 'user', '<booking uuid>',
  'Booking refund: <patient name>',
  jsonb_build_object(
    'Refund Reason', jsonb_build_object('new', 'Consultation cancelled'),
    'Refund Amount', jsonb_build_object('new', 'R325.00'),
    'PayFast Payment ID', jsonb_build_object('new', '<pf_payment_id>'),
    'Refund Date', jsonb_build_object('new', '<YYYY-MM-DD>')
  ),
  'manual'
);
```

**Step 4 — Notify the patient**
Send the patient a plain email confirming:
- The refund has been issued
- Expected timeline (per PayFast's stated policy)
- Who to contact if they don't see the refund within that window

---

## Verify Supabase Backups

Point-in-Time Recovery (PITR) and daily backups are our only protection
against accidental data loss (admin mistake, bad migration, rogue SQL).
Don't assume they're on — verify it, and re-verify whenever the plan
changes.

### Check what plan we're on

1. Sign in to the Supabase dashboard → Project **Third Party Booking System**
2. Go to **Settings** → **General** → look at the project's **Compute**
   / **Plan** section.

### What each plan gives us

| Plan | Backups |
|---|---|
| **Free** | No scheduled backups. No PITR. If the DB is wiped, the data is gone. |
| **Pro** | 7 days of daily backups, downloadable as `.sql`. PITR can be enabled as a paid add-on. |
| **Team / Enterprise** | 14–35 day daily backups + PITR (granular recovery to any point). |

### Verify backups exist (Pro and above)

1. Supabase dashboard → **Database** → **Backups**
2. Confirm at least 2 recent daily backups are listed with "Success" status.
3. Download the most recent one to local disk once a month and keep it
   alongside the repo backup. Filename convention: `supabase-backup-YYYY-MM-DD.sql`.

### If we're on Free tier

Run a manual `pg_dump` on a schedule. Two realistic options:

**Option A — from the VPS (simplest)**

SSH to the VPS, add a cron entry that dumps to an offsite-mounted folder:

```bash
# 02:00 SAST daily
0 2 * * * PGPASSWORD='<db-password>' pg_dump \
  -h db.<project-ref>.supabase.co \
  -p 5432 -U postgres -d postgres \
  -F c -f /backups/supabase-$(date +\%Y-\%m-\%d).dump \
  && find /backups -name 'supabase-*.dump' -mtime +30 -delete
```

The `-F c` format is compressed + parallel-restorable.

**Option B — upgrade to Pro**

At current scale, Pro is usually cheaper in labour than maintaining the
pg_dump pipeline. Recommended once we have a production customer.

### Test a restore (do this once, then yearly)

A backup you've never restored is not a backup. Do this in a scratch
project:

1. Create a new Supabase project called `restore-test`.
2. Run the downloaded `.sql` or `pg_restore` the `.dump` into it.
3. Spot-check: `SELECT count(*) FROM bookings`, `users`, `audit_log`.
4. Destroy the scratch project.

Document the test date + result in your operational log.

---

## Incident: PayFast ITN Not Arriving

If bookings are stuck at "In Progress" after payment:

1. Check Docker logs: `docker logs booking-app --tail 200 | grep -iE "itn|payfast"`
2. If no ITN received at all → delivery problem. Check PayFast IP → our IP
   routing, or switch to the pull-based reconciler (it runs automatically
   on the payment-success page and as a batch job in Patient History).
3. If ITN arrived but was rejected → check the signature / IP / amount
   validation log lines. Sandbox has a known signature quirk (passphrase
   fallback is already handled in code).
4. **Last resort:** admin manually confirms via Patient History → Options
   → "Mark Payment as Confirmed" → PIN. Audit-logged.

---

## Incident: CareFirst Patient Handoff Fails

If "Start Consult" returns a failure banner:

1. The booking stays at "Payment Complete" so the nurse can retry.
2. The failure reason is in `handoff_error_reason` on the bookings row
   and in the audit log.
3. Common causes:
   - CareFirst API unreachable (check their status)
   - Invalid field mapping (unusual name / country / ID type) — the error
     banner will carry CareFirst's exact complaint
   - API key revoked / expired
4. Retries are unlimited; `handoff_attempt_count` tracks them.

---

## POPIA Procedures

South African POPIA (Protection of Personal Information Act) compliance
procedures. These are the operational pieces that sit alongside the code
routes — the code handles the mechanical part, this runbook handles the
human verification and regulator-facing steps.

### Privacy policy / Terms

The booking system links to the canonical CareFirst T&Cs at
<https://carefirst.co.za/terms-and-conditions/>. Consent is captured at
Step 1 of the booking flow (checkbox that stores `consent_accepted_at`
on the booking row) BEFORE any personal information is collected. Do not
bypass this — POPIA §18(1) requires informed consent before processing.

### Handling a data subject access request (POPIA §23)

1. Patient emails <support@care-first.co.za> requesting their data.
2. Verify the requester's identity out of band (email match + any other
   identifier on file — never accept the request on the strength of the
   email alone, a compromised inbox would bypass everything).
3. As a system admin, call the access endpoint with the patient's ID
   number:
   ```bash
   curl -X POST https://<app-host>/api/admin/privacy/access \
     -H "Content-Type: application/json" \
     -H "Cookie: sb-access-token=<your-session>" \
     -H "x-csrf-token: <your-csrf-token>" \
     -d '{"idNumber":"8710115715084","reason":"Access request via support email 2026-04-20"}'
   ```
4. The response contains every booking row (including any erased
   tombstones). Package as JSON or PDF and email to the verified
   address on file.
5. SLA: 15 business days per the CareFirst T&Cs.
6. The endpoint writes to `audit_log` automatically — check that entry
   exists before closing the ticket.

### Handling a data subject erasure request (POPIA §24)

1. Same identity verification as above.
2. Call the erase endpoint:
   ```bash
   curl -X POST https://<app-host>/api/admin/privacy/erase \
     -H "Content-Type: application/json" \
     -H "Cookie: sb-access-token=<your-session>" \
     -H "x-csrf-token: <your-csrf-token>" \
     -d '{"idNumber":"8710115715084","reason":"POPIA §24 erasure request 2026-04-20"}'
   ```
3. The endpoint anonymises all PII columns on every matching booking,
   keeps the row (so financial + medical records retention obligations
   aren't violated), and writes `erased_at` + `erased_reason` tombstones.
4. Email the patient confirming the erasure and advising that some
   information (payment records, audit log entries) is retained for
   legally-required periods but is no longer linked to them.
5. Idempotent: re-running the command does nothing on the second call.

### Retention sweep

Abandoned bookings older than 30 days are automatically anonymised to
limit our PII retention footprint. Trigger manually when needed:

```bash
curl -X POST https://<app-host>/api/admin/privacy/retention-sweep \
  -H "Content-Type: application/json" \
  -H "Cookie: sb-access-token=<your-session>" \
  -H "x-csrf-token: <your-csrf-token>" \
  -d '{}'
```

Processes up to 500 rows per call. Run multiple times if the first
response indicates it hit the limit. Recommended schedule: daily,
either via pg_cron (Supabase extension), an external cron hitting the
endpoint, or manually by an admin.

Completed bookings ("Payment Complete" / "Successful") are NOT touched
by this sweep — their retention is governed by HPCSA medical-records
rules, not the short abandoned-booking policy.

---

## Incident: Data Breach (POPIA §22)

If we discover unauthorised access, disclosure, or loss of personal
information, POPIA §22 requires notification to the Information
Regulator AND to affected data subjects "as soon as reasonably
possible." Don't wait for legal sign-off on the notification wording —
the clock starts when we know.

### Severity triage (first 1 hour)

1. **Scope:** How many data subjects are affected? What categories of
   information (special personal information = higher severity)?
2. **Vector:** Was this external (attacker, vendor breach) or internal
   (misconfiguration, rogue user)? Is the vector still active?
3. **Data state:** Was data exfiltrated, or just exposed? Is there
   evidence of actual access?

### Containment (first 4 hours)

1. If the vector is still active, kill it first:
   - Rogue user → force sign-out via Security dashboard; disable
     account.
   - External attacker → rotate `SUPABASE_SERVICE_ROLE_KEY`, rotate
     `PAYFAST_PASSPHRASE`, rotate `CAREFIRST_API_KEY`, invalidate all
     Supabase sessions, force a redeploy.
   - Third-party breach → pull our access to the affected vendor,
     prepare to migrate.
2. Preserve evidence: snapshot the Supabase DB + download `audit_log`
   before making any other changes.
3. Document timeline: who discovered it, when, what's been done.

### Notification to the Information Regulator

- **Who:** The Information Regulator (South Africa)
- **Where:** <https://inforegulator.org.za/security-compromises/>
- **How:** There's a web form + email route. Submit the security
  compromise notification form.
- **What to include:** Nature of the compromise, data categories
  affected, number of subjects, containment actions taken, planned
  remediation, Information Officer contact details.

### Notification to affected data subjects

Template (adapt for each incident):

```
Subject: Important notice about your CareFirst information

Dear <first name>,

On <date>, CareFirst discovered <brief description of what happened
in plain language>. Your personal information held by the CareFirst
Third Party Booking System may have been affected.

What information was involved:
  <specific categories, e.g. "your name, ID number, contact details,
  and the vitals recorded at your last consultation booking">

What we've done:
  <containment actions in plain language>

What you should do:
  <specific advice: change your passwords on other services if you
  reused them, watch for suspicious emails, etc.>

How to contact us:
  Email support@care-first.co.za or phone <support line>. For more
  information about your rights under POPIA, visit
  https://inforegulator.org.za.

Regards,
<Information Officer name>
<CareFirst>
```

Send via the email address on file. Log every send in an incident ledger.

### Post-incident

1. Write up a root cause document within 72 hours.
2. Update this runbook with any lessons.
3. If the vector was a code bug, open an audit item for a regression
   test.
4. Brief the team + any affected stakeholders.

---

## Deploy and Rollback

### Deploy (VPS)

Always build with `IMAGE_TAG=<short-sha>` so we can roll back to the
previous image if the new one is broken. `docker compose` tags the built
image with whatever `image:` resolves to, and keeps older images around
until you prune.

```bash
cd /opt/3rd-Party-Booking-System && \
git pull origin main && \
export IMAGE_TAG=$(git rev-parse --short HEAD) && \
cd booking-app && \
docker compose build && \
docker compose up -d
```

What this does:
1. Pulls the latest code and reads the commit SHA (e.g. `ac5f529`).
2. Builds a new image tagged `booking-app:ac5f529`.
3. Starts the container using that tag.
4. The previous `booking-app:<old-sha>` stays in `docker images` until
   pruned — that's our rollback target.

### Verify the deploy

```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Image}}"
curl -sf http://127.0.0.1:3000/api/health
```

You want `(healthy)` next to `booking-app` and a `{"status":"ok",...}`
payload from the health check. If not, roll back.

### Rollback

If the deploy breaks production, drop back to the previous image
without touching git:

```bash
# 1. See what images you have
docker images booking-app --format "table {{.Tag}}\t{{.CreatedAt}}"

# 2. Pick the previous SHA tag (the one before the bad deploy)
export IMAGE_TAG=<previous-short-sha>

# 3. Recreate the container using that tag, no rebuild
cd /opt/3rd-Party-Booking-System/booking-app
docker compose up -d --no-build

# 4. Verify
docker ps --format "table {{.Names}}\t{{.Status}}"
curl -sf http://127.0.0.1:3000/api/health
```

The rollback takes ~10 seconds because no build runs. Only the
container restart.

Once the bad commit is reverted or fixed on main, do a normal deploy
to move forward again.

### Image hygiene

Docker doesn't auto-prune old tags. Keep at least the last 3 images
around (current + two fallback candidates) and clean the rest monthly:

```bash
# List images, keep the 3 most recent, delete older ones
docker images booking-app --format "{{.Tag}}" | tail -n +4 | while read -r tag; do
  [ "$tag" = "latest" ] && continue
  [ "$tag" = "<none>" ] && continue
  docker image rm "booking-app:$tag"
done
```

---

## Getting Support

For operational emergencies or escalation beyond this runbook:

- **Email:** lehlohonolom@firstcare.solutions
- **Also hardcoded in:** the "Contact Support" button in the sidebar,
  which opens a mailto with user context pre-filled.
