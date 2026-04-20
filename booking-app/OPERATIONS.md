# Operations Runbook

Short operational procedures for the CareFirst Third Party Booking System.
This file is committed to the repo so anyone with production access can find
it quickly.

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

## Getting Support

For operational emergencies or escalation beyond this runbook:

- **Email:** lehlohonolom@firstcare.solutions
- **Also hardcoded in:** the "Contact Support" button in the sidebar,
  which opens a mailto with user context pre-filled.
