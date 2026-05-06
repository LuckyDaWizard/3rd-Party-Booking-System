# CareFirst Third Party Booking System — User Manual

**Version 1.0** · Last updated 2026-04-14

Welcome to the CareFirst booking platform. This manual walks you through every feature of the system based on your role.

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Signing In](#2-signing-in)
3. [Understanding Your Role](#3-understanding-your-role)
4. [The Home Dashboard](#4-the-home-dashboard)
5. [Creating a Booking](#5-creating-a-booking)
6. [Processing Payment](#6-processing-payment)
7. [Patient History](#7-patient-history)
8. [User Management](#8-user-management)
9. [Client Management](#9-client-management) *(system admin only)*
10. [Unit Management](#10-unit-management)
11. [Audit Log](#11-audit-log) *(system admin only)*
12. [Switching Units](#12-switching-units)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. Getting Started

### What is the booking system?

The CareFirst Third Party Booking System lets authorised medical staff at partner clinics (called **units**) create patient consultation bookings, collect payments, and track patient history.

### How to access

1. Open your web browser (Chrome, Edge, Firefox, or Safari — mobile or desktop).
2. Go to: **http://187.127.135.11:3000**
3. You'll be greeted with the sign-in screen.

### Device support

The system works on:
- 💻 Desktop computers
- 📱 Mobile phones
- 🖥️ Tablets

The layout adapts automatically to your screen size.

---

## 2. Signing In

### Your PIN

Every user has a unique **6-digit PIN**. This is your password.

- You receive your PIN via email when your account is created (or when it's reset).
- **Keep it private** — do not share it with anyone.
- The system hides each digit as you type it (shows ● instead of numbers).

### How to sign in

1. On the sign-in screen, enter your **6-digit PIN** using the on-screen input.
2. Click **Sign In**.
3. The system will verify your code. If correct, you'll be taken to the Home dashboard.

### If your PIN doesn't work

- Double-check each digit. The most common issue is mistyping.
- If you see "**Invalid Code – Please Retry**", try again.
- If you see "**Account is disabled**", contact your unit manager or system administrator.
- **Too many failed attempts?** Ask your administrator to reset your PIN.

### Forgot your PIN?

Contact your unit manager or system administrator. They will reset your PIN and email you a new one.

---

## 3. Understanding Your Role

The system has three roles. Your role determines what you can see and do.

| Role | Who | What they can do |
|---|---|---|
| **User** (Nurse/Staff) | Front-line clinic staff | Create bookings, view patient history for their active unit |
| **Unit Manager** | Supervisor of one or more units | All user actions + manage users within their unit(s) + manage their assigned units |
| **System Administrator** | Head office / IT | Full access to everything — all clients, units, users, audit log |

Your role is shown at the top of the sidebar next to your name.

---

## 4. The Home Dashboard

After signing in, you land on the **Home** page. From here you can access every feature via the **sidebar menu** on the left (or via the hamburger ☰ button on mobile).

### Sidebar menu items

- 🏠 **Home** — Dashboard overview
- ➕ **Create Booking** — Start a new patient booking
- 📋 **Patient History** — View past and in-progress bookings
- 👥 **User Management** *(managers/admins)* — Add or edit staff accounts
- 🏥 **Unit Management** *(managers/admins)* — Manage clinic units
- 🏢 **Client Management** *(admins only)* — Manage client organisations
- 📊 **Audit Log** *(admins only)* — Review all system changes
- 🔄 **Switch Unit** — Change your active unit (if you're assigned to more than one)
- 🚪 **Sign Out** — Log out securely

---

## 5. Creating a Booking

Creating a booking is a step-by-step process. The system saves your progress as you go, so you won't lose data if something goes wrong.

### Step 1: Start the booking

1. Click **Create Booking** from the sidebar.
2. You'll be asked to search for the patient.

### Step 2: Search for the patient

Choose how you want to look them up:
- **SA ID Number** — South African 13-digit ID
- **Passport Number** — For international patients
- **Date of Birth + Name** — If no ID/passport is available

Enter the details and click **Search**.

### Step 3: Nurse verification

Before the booking is created, a nurse must verify their identity:

1. A pop-up asks for the **nurse verification code** (the nurse's 6-digit PIN).
2. The nurse enters their PIN.
3. Digits are masked with ● for security.
4. Click **Continue**.

This is called **two-person sign-off** — it ensures two people are accountable for every booking.

### Step 4: Select or create the patient

- If the patient is found, select them from the list.
- If not found, you'll be prompted to enter their details.

### Step 5: Enter patient details

A 4-step form collects:
1. **Basic info** — title, name, gender, date of birth, nationality
2. **Address** — street, suburb, city, province, postal code
3. **Contact** — phone number and email
4. **Payment type** — Cash reservation or other options

Each step saves automatically when you click **Next**.

### Step 6: Payment

(See the next section for details.)

### Step 7: Patient vitals

After payment, enter the patient's vitals:
- Blood pressure
- Glucose level
- Temperature
- Oxygen saturation
- Urine dipstick (optional)
- Heart rate

Add any additional comments, then click **Next**.

### Step 8: Accept Terms & Conditions

Review the T&Cs at [carefirst.co.za/terms-and-conditions](https://carefirst.co.za/terms-and-conditions) and accept them to finalise the booking.

### Can I cancel a booking mid-way?

Yes. At any point you can:
- Click the **red "Discard Flow"** button at the top — this cancels the booking and saves whatever data was entered up to that point (marked as "Discarded").
- Close the browser tab — this marks the booking as "Abandoned".

---

## 6. Processing Payment

CareFirst uses **PayFast**, a secure South African payment gateway.

### How much does a booking cost?

**R325.00** per consultation booking.

### What payment methods are supported?

PayFast accepts:
- Credit cards (Visa, Mastercard)
- Debit cards
- Instant EFT
- Mobicred
- SnapScan (mobile)

### How to pay

1. On the payment page, click **Pay with PayFast**.
2. You'll be **redirected to PayFast's secure payment page**.
3. Enter your payment details on PayFast's site.
4. Complete the payment.
5. PayFast redirects you back to CareFirst.
6. You'll see a **"Confirming Payment…"** message, then **"Payment Successful"**.
7. The system continues to the next step automatically.

### Is my card safe?

Yes. **CareFirst never sees or stores your card details** — everything happens on PayFast's PCI-DSS compliant server. PayFast is a trusted South African gateway.

### What if payment fails?

You'll see a **"Payment Unsuccessful"** page with two options:
- **Try Again** — retry the payment
- **Send Payment Link** *(coming soon)* — email a payment link to the patient

You can also click **Back Home** to cancel the booking.

### What if my Client uses "Collect at Unit" billing?

Some Clients have a billing arrangement where the Unit collects the
consultation fee directly from the patient (cash, card terminal, or
their own EFT process) instead of using PayFast. If your Client is
set up this way, the booking flow will look slightly different:

- **Step 6 (Payment)** shows an amber **"Confirm payment collected at unit"**
  panel instead of the "Pay with PayFast" button.
- Clicking **Next** records the booking as paid (no PayFast redirect)
  and moves you to the next step. **Make sure the patient has actually
  paid** before clicking — there's no auto-reversal.
- In Patient History, these bookings show an amber **"Self-Collect"**
  pill instead of the green "Payment Complete" pill.
- If you're a Unit Manager or System Admin, accepting the T&Cs at the
  end of the flow will prompt for your PIN and then **automatically
  open the consultation in CareFirst Patient** (skipping the manual
  "Start Consult" step). Regular users get the standard finish-flow
  behaviour and the manager handles Start Consult later.

The "Collect at Unit" toggle is set per-Client by a System Admin in
Client Management → Manage Client → Client Details. It's not
something operators can flip themselves.

---

## 7. Patient History

View all bookings made at your active unit (or across all units if you're an admin).

### Filter tabs

- **All** — every booking
- **In Progress** — bookings being created but not yet paid
- **Incomplete** — bookings that were abandoned or discarded
- **Completed** — bookings with payment complete

### Search

Use the search box to find a patient by name or ID number.

### Options menu

Click **Options** on any row for:
- **Process Payment on Device** — continue a pending payment
- **Reshare Link** *(coming soon)* — resend the payment link to the patient

### Status badges

| Badge | Meaning |
|---|---|
| 🟡 Payment Complete | Payment received, consultation ready |
| 🔵 In Progress | Booking being created |
| 🟣 Abandoned | User left mid-flow |
| ⚫ Discarded | User explicitly cancelled |
| 🟢 Successful | Consultation fully completed |

---

## 8. User Management

*Available to: Unit Managers, System Administrators*

Manage staff accounts for your unit (or all units, if you're an admin).

### Viewing users

- Click **User Management** in the sidebar.
- Filter by **All / Active / Disabled** using the tabs at the top.
- Filter by client using the **Select Client** dropdown.
- Search by name or email.

### Adding a new user

1. Click **New User** (top right, or below filters on mobile).
2. Fill in the form:
   - **First Names** and **Surname**
   - **Email Address** — a unique, working email (their PIN will be sent here)
   - **Contact Number** — with country code
   - **Role** — User / Unit Manager / System Admin (admins only)
   - **Units** — select which unit(s) the user will work at
3. Click **Add User**.
4. A random 6-digit PIN is generated and emailed to the user automatically.
5. You'll see a confirmation banner with the new PIN — **share this securely** if the email doesn't arrive.

### Editing a user

1. Click **Manage** next to the user's name.
2. Update any field (name, email, units, role).
3. Click **Update Information**.

### Resetting a user's PIN

1. Open the user's profile via **Manage**.
2. Click **Reset Pin**.
3. A **nurse verification code** is required (a different manager or admin enters their PIN) — this is two-person sign-off.
4. A new random PIN is generated and emailed to the user.
5. If email fails, the new PIN is shown on screen once — note it and share securely.

### Disabling or deleting a user

- **Disable** — removes access but keeps history. Reversible.
- **Delete** — permanently removes the user and their auth record. Irreversible.

When you click **Delete User**, the system suggests **Disable instead** to preserve history.

### Unit Manager restrictions

If you're a Unit Manager, you can only:
- Create users with the **"User"** role (not managers or admins)
- Assign users to your own units
- Manage users in your own units

You **cannot**:
- Change user roles
- Manage users outside your units

---

## 9. Client Management

*Available to: System Administrators only*

Clients are the partner organisations whose patients you serve.

### Viewing clients

Click **Client Management** in the sidebar. Filter by Active/Disabled, search by name.

### Adding a new client

The Add Client flow is a 4-step wizard:

1. **Client Details** — name, contact person (name + surname), email, contact number.
2. **Branding** *(optional)* — logo (recommended ~360×96 px, transparent background), favicon (square, ~128×128 px), and a brand accent colour. The accent is used on filter pills, primary buttons, and the active sidebar item; a live WCAG verdict warns if your colour fails contrast for white text. The client is created when you advance from this step.
3. **Unit Details** *(optional — Skip available)* — add the first unit while you're at it.
4. **Users** *(optional — Skip available)* — add a first user assigned to a unit you just created. Their PIN is auto-generated and shown once on the User Management page after the wizard finishes.

You can always come back later and add more units / users / branding via Manage Client and the regular Unit / User Management pages.

### Editing a client

Click **Manage** on the client row. The page is split into 4 tabs:

- **Client Details** — contact info. System Admins also see the **Collect payment at unit** toggle here (see [What if my Client uses "Collect at Unit" billing?](#what-if-my-client-uses-collect-at-unit-billing) above).
- **Branding** — replace logo / favicon / accent colour. Uploads save immediately on file pick; the accent colour saves with **Update Information**.
- **Units** — read-only list of all units under this client with status badges. Click a row to manage that unit.
- **Users** — read-only list of users assigned to any of this client's units. Each row shows the user's avatar, contact info, role, status, and a coloured pill for each unit (in this client's accent colour). Click a row to manage that user.

Click **Update Information** to save changes from the **Client Details** or **Branding** tab. The button is hidden on the read-only Units / Users tabs. **Disable Client** stays visible across all tabs.

### Disabling vs deleting

- **Disable** — hides from active lists; keeps all associated data.
- **Delete** — permanently removes the client AND all its units, user-unit assignments, and bookings (the cascade is shown in the audit log). PIN re-verification is required. **Irreversible.** If the delete fails part-way (e.g. a database constraint), you'll see a red error banner with the reason and nothing is partially deleted.

---

## 10. Unit Management

*Available to: Unit Managers, System Administrators*

Units are physical clinic locations under a client organisation.

### Viewing units

Click **Unit Management**. Filter by Active/Disabled, search by name.

### Adding a new unit

1. Click **New Unit**.
2. Enter:
   - **Unit Name**
   - **Parent Client** (dropdown)
   - **Contact Person**, **Email**
   - **Province** (South African provinces only)
3. Click **Add Unit**.

### Editing or disabling units

Click **Manage** to edit, disable, or delete — same pattern as other management pages.

---

## 11. Audit Log

*Available to: System Administrators only*

Every administrative action is logged: who did what, when, to which entity.

### Viewing the log

Click **Audit Log** in the sidebar.

### Filters

- **Entity type:** All / Users / Clients / Units
- **Action:** Create, Update, Delete, Reset PIN, Toggle Status
- **Search:** by actor name or entity name

### Expandable details

Click **Details** on any row to see the **exact field changes** — old value → new value. Sensitive fields like PINs show ✱✱✱.

### Exporting

Click **Export CSV** (top right) to download the filtered list as a spreadsheet. Useful for audits, compliance reports, or record-keeping.

### Pagination

Shows 10 entries per page. For large logs, pagination shows: `1 … 4 5 6 … 50`.

---

## 12. Switching Units

If you're assigned to **more than one unit**, you can switch between them.

1. Click **Switch Unit** in the sidebar.
2. Select the unit you want to work in.
3. Confirm the change.

The system will now show bookings and patients for that unit only.

**System administrators** can view all units without switching.

---

## 13. Troubleshooting

### "Page not loading"
- Check your internet connection.
- Refresh the page (F5 or pull-to-refresh on mobile).
- Try a different browser.

### "Invalid Code" on sign-in
- Double-check each digit.
- Make sure Caps Lock is off (shouldn't matter — digits only).
- Try again — if it fails 3+ times, contact your admin.

### Payment failed
- Check your card details are correct.
- Ensure you have sufficient funds.
- Try a different payment method on PayFast.
- If it keeps failing, contact PayFast support or your admin.

### Form fields won't submit
- Make sure every required field is filled in.
- Fields with errors show a red outline — correct them first.
- The submit button is disabled until all required fields are valid.

### I can't see the management pages
- Your role determines what you can see.
- Nurses/users don't see management pages — this is by design.
- If you believe you should have access, contact your admin.

### Reset PIN email didn't arrive
- Check the Spam/Junk folder.
- Ask the admin to check if the email address on file is correct.
- If email keeps failing, the admin can share the new PIN directly (shown on screen).

### I was kicked out of the app
- Sessions are tied to cookies. Clear your cookies or close the browser and sign in again.
- If it keeps happening on the same device, contact your admin.

---

## Need more help?

Contact your unit manager or system administrator. They have full access to help you resolve any issues.

For technical issues beyond day-to-day use, they can escalate to IT support.

---

**CareFirst Solutions** · Third Party Booking System
Confidential — for authorised staff use only.
