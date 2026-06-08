---
name: Design System
description: Apply the 3rd Party Booking System visual and interaction conventions. Use when building or reviewing any UI — colors, buttons, modals, dialogs, top bars, inputs, or Next.js URL state. Enforces the fixed palette, button active-state rules, and the useSearchParams requirement.
---

# Design System

Fixed conventions for the 3rd Party Booking System UI. Consistency across pages is a hard requirement — mismatches are a "Request Changes" issue in review.

## Color palette (use these exact values)

- Brand / primary: `#3ea3db`
- Danger / delete: `#FF3A69` (never `bg-red-500`)
- Content background: `#f4f4f4`
- Dark buttons: `bg-gray-900`
- Form inputs: white background with `border-gray-300`

Flag any hardcoded color that deviates from this palette.

## Buttons

- **Active states are immediate, not hover-only.** A button that depends on a form condition (e.g. "Continue" enabled when all digits are filled) must switch appearance the instant the condition is met — use a conditional `className` (e.g. `bg-gray-300` → `bg-gray-900`), not `bg-gray-300 hover:bg-gray-900`.
- **Top-bar button proportions.** Back button and any action button in the same top-bar row both use `size="sm"` with matching `px-6 py-2 rounded-lg` so their heights match. Flag mismatched sizes in the same row.
- Disabled = gray; enabled = dark. The transition should be obvious.

## Top bar

White `rounded-xl` row: Back button on the left (`size="sm"`, `border-black`), optional action button on the right (same `size="sm"`).

## Inputs and dropdowns

- Use the `FloatingInput` pattern (floating label moves to the border on focus/fill, X clear button) for forms.
- Use custom dropdowns (not native `<select>`) with click-outside handling, a `rounded-xl` container, and light-blue hover (`bg-[#3ea3db]/15`).

## Modal / dialog consistency

Before building any modal, popup, or dialog, read the existing reference implementation (e.g. the home-page popup) and match it exactly: padding, heading styles, text alignment, border radius, button styles. Never ship a visually different version of the same pattern on a different page.

## Next.js URL state (real bug)

- **Always use `useSearchParams()` and `usePathname()` from `next/navigation`** to read URL state in components. Never `window.location.search` / `window.location.pathname` — they don't trigger re-renders, which caused sidebar active states to not update when filter tabs changed.
- `window.history.replaceState()` is fine for *clearing* notification params after display.

## Sidebar dropdown behavior

Collapsible nav items with sub-pages (e.g. Patient History → All / In Progress / Completed) must:

- open on click from any page;
- auto-close when navigating to a non-matching section — track the **previous** pathname with a `prevPathnameRef` and only close on an actual pathname change (closing on every render makes the dropdown snap shut the moment it's opened from another page);
- close on click-outside when in collapsed popout mode.

## Accessibility

Target WCAG 2.1 AA: keyboard navigation, screen-reader labels, sufficient color contrast, and managed focus. Use semantic elements (`button`, `nav`, `main`) and associate every input with a label.
