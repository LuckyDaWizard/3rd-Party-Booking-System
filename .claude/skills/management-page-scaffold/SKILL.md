---
name: Management Page Scaffold
description: Build a new entity management section (clients, units, users, etc.) in the 3rd Party Booking System. Use when creating or modifying list/add/manage pages, entity stores, status toggles, delete flows, or notification banners. Enforces the shared 3-page template so every entity looks and behaves identically.
---

# Management Page Scaffold

Every manageable entity (clients, units, users, …) follows the **same 3-page structure**: list / add / manage. When building a new entity, copy the `client-management` equivalent and adapt the field names and labels — do not invent a new layout.

## Before you start

- **Read the reference first.** Open the existing `client-management` list/add/manage pages and the matching store before writing anything. Match structure and styling exactly — never reproduce a component pattern from memory.
- **Check `Project Files/`** for the design reference images for the feature you're building.

## The 3 pages

### List page (`page.tsx`)
- Top bar: white `rounded-xl` row, Back button left, "New {Entity}" button right.
- Filter tabs: All / Active / Disabled, each with a live count.
- A dropdown filter + a search input.
- Row cards: status badge + key fields + a "Manage" button.
- Notification banners read from URL search params (see below).

### Add page (`add/page.tsx`)
- Top bar with Back.
- Centered heading + subtitle.
- `FloatingInput` form fields (floating label + clear button).
- Single submit button.

### Manage page (`manage/page.tsx`)
- Top bar with Back + red "Delete {Entity}" button (`#FF3A69`).
- Centered heading "Manage {name}".
- Editable floating inputs pre-filled from the DB.
- "Update Information" + "Disable/Activate" buttons.
- Delete confirmation dialog with a **"disable instead"** fallback option.
- Status-toggle confirmation dialog.

## Stores and state

- Shared state lives in a React context provider in `src/lib/` (mirror `client-store.tsx`).
- The store maps DB `snake_case` ↔ frontend `camelCase`.
- All list fetches use `.order("created_at", { ascending: false })`.
- Register the provider in `(dashboard)/layout.tsx`.

## Persist ALL form fields (real bug)

When saving, **every** field captured in the form must be in the Supabase insert/update payload. A real bug shipped where a unit form captured email + province but only saved `unit_name`. Verify the payload includes contact person, email, province, and all other captured fields.

## Notification banners

After a delete or status change, pass info via URL search params, e.g. `?deleted=Name` or `?statusChanged=disabled&unitName=Name`. On the list page:

1. Read them with `useSearchParams()` (never `window.location.search`).
2. Show the green dismissible banner (bold title + subtitle + X).
3. Clean the URL with `window.history.replaceState()`.

## Multi-select assignments (many-to-many)

For assigning multiple entities (e.g. units to a user), use a searchable dropdown that adds selections as removable blue chips below the input (`bg-[#3ea3db]/10 border-[#3ea3db]/30 text-[#3ea3db]`). Already-selected items are filtered out of the dropdown. On save, create/delete the junction rows (see the Supabase Migrations skill for the table rules).

## Checklist for a new entity

1. Supabase table + grants (+ junction table if needed) — see Supabase Migrations skill.
2. Store in `src/lib/` mirroring `client-store.tsx`, registered in the dashboard layout.
3. List page with filter tabs, search, row cards, URL-param banners.
4. Add page with floating inputs; all fields persisted.
5. Manage page with pre-filled inputs, update, disable/activate, delete-with-disable-fallback.
6. Confirm styling matches `client-management` exactly.
