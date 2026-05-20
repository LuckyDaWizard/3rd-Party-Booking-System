"use client"

import * as React from "react"
import {
  ArrowRight,
  ArrowLeft,
  Plus,
  Search,
  X,
  Check,
  MoreVertical,
  Download,
  ChevronDown,
  Mail,
  Monitor,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { YesNoToggle } from "@/components/ui/yes-no-toggle"
import { SearchInput } from "@/components/ui/search-input"
import { OtpInput } from "@/components/ui/otp-input"
import { StatusBadge } from "@/components/ui/status-badge"
import { StepPill } from "@/components/ui/step-pill"
import { FilterPill } from "@/components/ui/filter-pill"
import { DesktopRow } from "@/components/ui/desktop-row"
import { EmptyState } from "@/components/ui/empty-state"
import { Banner } from "@/components/ui/banner"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { TabStrip } from "@/components/ui/tab-strip"
import { SubNav } from "@/components/ui/sub-nav"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"

// =============================================================================
// Design System Audit Page
//
// Renders every UI primitive and inline pattern variant the codebase currently
// uses, side-by-side. Each entry lists:
//   - Where the pattern lives today (count + sample file paths)
//   - Whether the entry is the canonical primitive ("KEEP") or an inline
//     duplicate that should be consolidated ("REVIEW")
//
// Use this page to choose which patterns become the single source of truth
// for the design system, and which get removed / replaced when we do the
// next consolidation pass.
//
// Route: /design-system
// =============================================================================

type Verdict = "keep" | "review" | "consolidate" | "done"

function VerdictPill({ verdict }: { verdict: Verdict }) {
  const styles: Record<Verdict, string> = {
    keep: "bg-green-100 text-green-700",
    review: "bg-amber-100 text-amber-700",
    consolidate: "bg-rose-100 text-rose-700",
    done: "bg-emerald-100 text-emerald-700",
  }
  const label: Record<Verdict, string> = {
    keep: "KEEP",
    review: "REVIEW",
    consolidate: "CONSOLIDATE",
    done: "DONE ✔",
  }
  return (
    <span
      className={`inline-flex h-5 items-center rounded-md px-2 text-[10px] font-bold tracking-wide ${styles[verdict]}`}
    >
      {label[verdict]}
    </span>
  )
}

// Single entry card used throughout the page.
function Entry({
  name,
  verdict,
  usedIn,
  notes,
  children,
}: {
  name: string
  verdict: Verdict
  usedIn: string
  notes?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-ink">{name}</span>
            <VerdictPill verdict={verdict} />
          </div>
          <span className="text-xs text-ink-muted">{usedIn}</span>
        </div>
      </div>

      <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4">
        {children}
      </div>

      {notes && (
        <p className="text-xs text-ink-muted italic">{notes}</p>
      )}
    </div>
  )
}

function Section({
  number,
  title,
  blurb,
  children,
}: {
  number: number
  title: string
  blurb: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <span className="flex size-8 items-center justify-center rounded-lg bg-gray-900 text-sm font-bold text-white">
            {number}
          </span>
          <h2 className="text-2xl font-bold text-ink">{title}</h2>
        </div>
        <p className="ml-11 text-sm text-ink-muted">{blurb}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{children}</div>
    </section>
  )
}

// Live interactive demo for the TabStrip in both variants.
function TabStripDemo() {
  const [under, setUnder] = React.useState<"attempts" | "sessions" | "suspicious" | "history">(
    "attempts"
  )
  const [pill, setPill] = React.useState<"details" | "units" | "users">("details")
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
          variant=&quot;underline&quot;
        </span>
        <TabStrip
          variant="underline"
          value={under}
          onChange={setUnder}
          tabs={[
            { value: "attempts", label: "Failed Attempts" },
            { value: "sessions", label: "Active Sessions" },
            { value: "suspicious", label: "Suspicious" },
            { value: "history", label: "History" },
          ]}
        />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
          variant=&quot;pill&quot; (with count badges)
        </span>
        <TabStrip
          variant="pill"
          value={pill}
          onChange={setPill}
          tabs={[
            { value: "details", label: "Client Details" },
            { value: "units", label: "Units", count: 4 },
            { value: "users", label: "Users", count: 12 },
          ]}
        />
      </div>
    </div>
  )
}

// Live interactive demo for the ConfirmDialog. Shows both layouts:
// a 2-button (yes/cancel) and a 3-button (primary/secondary/cancel)
// variant — click either trigger to open them.
function ConfirmDialogDemo() {
  const [yesNo, setYesNo] = React.useState(false)
  const [threeBtn, setThreeBtn] = React.useState(false)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="primary-outline" size="default" onClick={() => setYesNo(true)}>
          Open 2-button
        </Button>
        <Button variant="primary-outline" size="default" onClick={() => setThreeBtn(true)}>
          Open 3-button
        </Button>
      </div>

      <ConfirmDialog
        open={yesNo}
        onOpenChange={setYesNo}
        title="Switch to Sandton?"
        description="You'll see Sandton's bookings after switching."
        confirmLabel="Yes, Switch Units"
        onConfirm={() => setYesNo(false)}
      />

      <ConfirmDialog
        open={threeBtn}
        onOpenChange={setThreeBtn}
        title="Are you sure you want to delete this user?"
        description="Deleting this user will permanently remove all associated records."
        confirmLabel="Yes, delete user"
        onConfirm={() => setThreeBtn(false)}
        secondaryLabel="Disable user instead"
        onSecondary={() => setThreeBtn(false)}
      />
    </div>
  )
}

// Live interactive demo for the FilterPill.
function FilterPillDemo() {
  const [active, setActive] = React.useState<"all" | "in-progress" | "completed">(
    "in-progress"
  )
  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterPill
        active={active === "all"}
        label="All"
        count={4}
        onClick={() => setActive("all")}
      />
      <FilterPill
        active={active === "in-progress"}
        label="In Progress"
        count={3}
        onClick={() => setActive("in-progress")}
      />
      <FilterPill
        active={active === "completed"}
        label="Completed"
        count={1}
        onClick={() => setActive("completed")}
      />
    </div>
  )
}

// Live interactive demo for the OtpInput. Type a few digits to confirm
// the focus auto-advance + masked rendering both work.
function OtpInputDemo() {
  const [code, setCode] = React.useState("")
  return <OtpInput value={code} onChange={setCode} ariaLabel="Demo OTP" />
}

// Live interactive demo for the SearchInput.
function SearchInputDemo() {
  const [q, setQ] = React.useState("")
  return (
    <SearchInput
      value={q}
      onChange={setQ}
      placeholder="Search Patient Name or ID Number"
    />
  )
}

// Small interactive demo for the YesNoToggle so the design-system page
// shows a working sample, not a static screenshot.
function YesNoToggleDemo() {
  const [value, setValue] = React.useState(true)
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl bg-[#CDE5F2] px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-ink">
        Would you like to script this to another email address
      </p>
      <YesNoToggle value={value} onChange={setValue} />
    </div>
  )
}

export default function DesignSystemPage() {
  // -------------------------------------------------------------------------
  // 1. Buttons
  // -------------------------------------------------------------------------
  // Single source of truth for every variant the Button primitive supports.
  // Used by the "All variants" grid below.
  const variantRows: {
    name: string
    variant:
      | "primary"
      | "primary-outline"
      | "accent"
      | "danger"
      | "outline"
      | "secondary"
      | "ghost"
      | "destructive"
      | "link"
    description: string
    when: string
  }[] = [
    {
      name: "primary",
      variant: "primary",
      description: "bg-gray-900 text-white",
      when: "The standard dark CTA. Auth, modals, manage-page saves.",
    },
    {
      name: "primary-outline",
      variant: "primary-outline",
      description: "border border-black bg-white text-ink",
      when: "Secondary action next to a `primary`. Also SubNav Back buttons.",
    },
    {
      name: "accent",
      variant: "accent",
      description: "bg-[var(--client-primary)] text-white",
      when: "Brand-coloured affordances — 'New X', Export, Refresh.",
    },
    {
      name: "danger",
      variant: "danger",
      description: "bg-[#FF3A69] text-white",
      when: "In-flow destructive (Discard Flow). Not for modal confirms.",
    },
    {
      name: "outline",
      variant: "outline",
      description: "border-input bg-background",
      when: "Soft outline. Used by select-style triggers.",
    },
    {
      name: "secondary",
      variant: "secondary",
      description: "bg-secondary text-secondary-foreground",
      when: "Legacy. Reserved for low-priority alt actions.",
    },
    {
      name: "ghost",
      variant: "ghost",
      description: "transparent, hover: bg-muted",
      when: "Tertiary action / icon-only chrome (sidebar toggles).",
    },
    {
      name: "destructive",
      variant: "destructive",
      description: "bg-destructive/10 text-destructive (soft red)",
      when: "Confirmation modal 'Yes, delete' action. Soft red on tint.",
    },
    {
      name: "link",
      variant: "link",
      description: "text-primary underline-offset-4 hover:underline",
      when: "Inline anchor masquerading as a button.",
    },
  ]

  // Single source of truth for every size the Button primitive supports.
  const sizeRows: {
    name: string
    size:
      | "xs"
      | "sm"
      | "default"
      | "lg"
      | "cta"
      | "cta-lg"
      | "nav"
    height: string
    description: string
    when: string
  }[] = [
    { name: "xs", size: "xs", height: "24px", description: "h-6 px-2 text-xs", when: "Tiny inline actions, table-row chips." },
    { name: "sm", size: "sm", height: "28px", description: "h-7 px-2.5 text-[0.8rem]", when: "Compact actions — currently used by Discard Flow." },
    { name: "default", size: "default", height: "32px", description: "h-8 px-2.5 text-sm", when: "Generic small button. Fine when CTA doesn't need to dominate." },
    { name: "lg", size: "lg", height: "36px", description: "h-9 px-2.5 text-sm", when: "List-row action pills (Manage, Start Consult, Options)." },
    { name: "cta", size: "cta", height: "44px", description: "h-11 rounded-xl px-6 text-base font-medium", when: "Standard CTA — auth, modals, manage-page Save." },
    { name: "cta-lg", size: "cta-lg", height: "48px", description: "h-12 rounded-xl px-6 text-base font-semibold", when: "Landing-page CTA — error, not-found, payment results, accent New-X, long-form Save (Add Unit, Add User)." },
    { name: "nav", size: "nav", height: "36px", description: "h-9 gap-3 rounded-lg px-6 text-sm font-medium", when: "SubNav Back buttons — paired with `primary-outline`." },
  ]

  const buttonsSection = (
    <Section
      number={1}
      title="Buttons"
      blurb="Consolidation complete — every CTA, row action, Back button, Discard Flow and New-X button resolves through the Button primitive's variant + size combos. The matrices below list every variant and size the primitive supports; the canonical combinations show the exact configurations in use today."
    >
      <Entry
        name="All variants — at a glance"
        verdict="keep"
        usedIn={`${variantRows.length} variants total. New design-system variants on top, primitive legacy variants below.`}
        notes="Hover and disabled states are baked into each variant; you don't override them in className."
      >
        <div className="flex flex-col gap-2">
          {variantRows.map((row) => (
            <div
              key={row.name}
              className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <code className="text-xs font-bold text-ink">
                  variant=&quot;{row.name}&quot;
                </code>
                <span className="truncate text-[11px] text-ink-muted" title={row.description}>
                  {row.description}
                </span>
                <span className="text-[11px] italic text-ink-muted">{row.when}</span>
              </div>
              <div className="shrink-0">
                <Button variant={row.variant} size="cta">
                  {row.name}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Entry>

      <Entry
        name="All sizes — at a glance"
        verdict="keep"
        usedIn={`${sizeRows.length} sizes total. Rendered with variant='primary' so you can compare height + padding cleanly.`}
        notes="Sizes 'cta', 'cta-lg', 'cta-xl', 'row' and 'nav' were added during the design-system pass. The primitive's xs/sm/default/lg remain available."
      >
        <div className="flex flex-col gap-2">
          {sizeRows.map((row) => (
            <div
              key={row.name}
              className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <code className="text-xs font-bold text-ink">
                  size=&quot;{row.name}&quot; · {row.height}
                </code>
                <span className="truncate text-[11px] text-ink-muted" title={row.description}>
                  {row.description}
                </span>
                <span className="text-[11px] italic text-ink-muted">{row.when}</span>
              </div>
              <div className="shrink-0">
                <Button variant="primary" size={row.size}>
                  Sample
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Entry>

      <Entry
        name="Icon-only sizes"
        verdict="keep"
        usedIn="Used by Sidebar toggle, modal close X, table-row icon controls."
        notes="Square buttons sized identically to their non-icon siblings."
      >
        <div className="flex flex-wrap items-end gap-3">
          <Button variant="ghost" size="icon-xs"><X className="size-3" /></Button>
          <Button variant="ghost" size="icon-sm"><X className="size-3.5" /></Button>
          <Button variant="ghost" size="icon"><X className="size-4" /></Button>
          <Button variant="ghost" size="icon-lg"><X className="size-4" /></Button>
        </div>
      </Entry>

      <Entry
        name="Interactive states"
        verdict="keep"
        usedIn="Disabled, focus-visible and aria-invalid states are baked into every variant."
        notes="aria-invalid={true} produces a destructive ring; disabled drops the fill to gray-300 + gray-500 text on `primary` variants."
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col items-center gap-1">
            <Button variant="primary" size="cta">Default</Button>
            <span className="text-[10px] text-ink-muted">default</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <Button variant="primary" size="cta" disabled>Disabled</Button>
            <span className="text-[10px] text-ink-muted">disabled</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <Button variant="primary" size="cta" aria-invalid>Invalid</Button>
            <span className="text-[10px] text-ink-muted">aria-invalid</span>
          </div>
        </div>
      </Entry>

      <Entry
        name="Canonical combination — Standard CTA"
        verdict="done"
        usedIn="22+ sites — auth pages, modal confirms, manage-page Save / Reset PIN / Delete, switch-unit Continue, security Sign-out"
        notes={'<Button variant="primary" size="cta" className="w-full">Save changes</Button>'}
      >
        <div className="flex flex-col gap-2">
          <Button variant="primary" size="cta" className="w-full">Save changes</Button>
          <Button variant="primary" size="cta" disabled className="w-full">Disabled</Button>
        </div>
      </Entry>

      <Entry
        name="Canonical combination — Standard outline CTA"
        verdict="done"
        usedIn="~10 sites — Cancel / Reset PIN / Disable Client / Try Payment Again, paired with primary above"
        notes={'<Button variant="primary-outline" size="cta" className="w-full">Disable instead</Button>'}
      >
        <Button variant="primary-outline" size="cta" className="w-full">
          Disable instead
        </Button>
      </Entry>

      <Entry
        name="Canonical combination — Landing-page CTA"
        verdict="done"
        usedIn="8 sites — error.tsx, not-found.tsx, terms acceptance, payment results (success/failed), time-picker, payment Continue"
        notes={'<Button variant="primary" size="cta-lg" className="w-full">Continue</Button>'}
      >
        <Button variant="primary" size="cta-lg" className="w-full">
          Continue <ArrowRight className="size-4" />
        </Button>
      </Entry>

      <Entry
        name="Canonical combination — List-row action"
        verdict="done"
        usedIn="8 sites — patient-history rows (Start Consult / Options / Continue) and Manage buttons on user/unit/client management lists."
        notes={'<Button variant="primary" size="cta" className="w-full">Start Consult</Button>'}
      >
        <Button variant="primary" size="cta" className="w-full">
          Start Consult
        </Button>
      </Entry>

      <Entry
        name="Canonical combination — Brand-coloured 'New X'"
        verdict="done"
        usedIn="11+ sites — New Client / New User / New Unit / New Patient (desktop + mobile each), audit-log Export, security Refresh"
        notes={'<Button variant="accent" size="cta-lg">New Client <Plus /></Button>'}
      >
        <Button variant="accent" size="cta-lg">
          New Client
          <Plus className="size-4" />
        </Button>
      </Entry>

      <Entry
        name="Canonical combination — Discard Flow"
        verdict="done"
        usedIn="3 sites — create-booking/{patient-details, patient-metrics, payment} SubNav"
        notes={'<Button variant="danger" size="cta">Discard Flow</Button>'}
      >
        <Button variant="danger" size="cta">Discard Flow</Button>
      </Entry>

      <Entry
        name="Canonical combination — Back button"
        verdict="done"
        usedIn="17 sites — every dashboard SubNav Back button"
        notes={'<Button variant="primary-outline" size="nav"><ArrowLeft /> Back</Button>'}
      >
        <Button variant="primary-outline" size="nav">
          <ArrowLeft className="size-4" />
          Back
        </Button>
      </Entry>
    </Section>
  )

  // -------------------------------------------------------------------------
  // 2. Form Inputs
  // -------------------------------------------------------------------------
  const inputsSection = (
    <Section
      number={2}
      title="Form Inputs"
      blurb="Input primitive, the FloatingInput composition (8-page consolidation), and the search input pattern that appears on every list page."
    >
      <Entry
        name="Input primitive"
        verdict="keep"
        usedIn="src/components/ui/input.tsx — used directly in search bars and a few simple forms"
      >
        <Input placeholder="Type here..." />
      </Entry>

      <Entry
        name="FloatingInput (composition)"
        verdict="keep"
        usedIn="src/components/ui/floating-input.tsx — every multi-step form"
        notes="Already consolidated 8 copy-pasted variants. Animated label, clear button, error state."
      >
        <div className="flex flex-col gap-3">
          <div className="relative">
            <input
              defaultValue="John Doe"
              className="peer h-14 w-full rounded-lg border border-gray-300 bg-white px-4 pt-5 pb-1 text-sm text-ink outline-none focus:border-gray-900"
            />
            <label className="pointer-events-none absolute left-4 top-2 text-[10px] font-medium uppercase tracking-wider text-ink-muted">
              Full name
            </label>
          </div>
          <div className="relative">
            <input
              placeholder="Empty state"
              className="peer h-14 w-full rounded-lg border border-gray-300 bg-white px-4 text-sm text-ink outline-none focus:border-gray-900"
            />
          </div>
        </div>
      </Entry>

      <Entry
        name="SearchInput"
        verdict="done"
        usedIn="6 sites — patient-history, audit-log, user-management, unit-management, client-management, security (sign-in history tab)"
        notes={'<SearchInput value={q} onChange={setQ} placeholder="Search…" />'}
      >
        <SearchInputDemo />
      </Entry>

      <Entry
        name="OtpInput"
        verdict="done"
        usedIn="6 sites — sign-in PIN, reset-pin (code + new + confirm), create-booking nurse verify, patient-details booking verify"
        notes={'<OtpInput value={code} onChange={setCode} error={hasError} whiteFill={inDialog} />'}
      >
        <OtpInputDemo />
      </Entry>

      <Entry
        name="FloatingSelect"
        verdict="keep"
        usedIn="src/components/ui/floating-select.tsx — dropdown sibling of FloatingInput"
      >
        <div className="relative">
          <button
            type="button"
            className="flex h-14 w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-4 text-sm text-ink"
          >
            <span className="flex flex-col items-start">
              <span className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">
                Province
              </span>
              <span>Gauteng</span>
            </span>
            <ChevronDown className="size-4 text-gray-400" />
          </button>
        </div>
      </Entry>

      <Entry
        name="YesNoToggle"
        verdict="done"
        usedIn="2 sites — patient-details Step 3 (Contact Details) + Step 4 (Verify Details), 'script to another email' question"
        notes={"<YesNoToggle value={state} onChange={setState} /> — wraps the question's own bg-[#CDE5F2] container at the call site."}
      >
        <YesNoToggleDemo />
      </Entry>
    </Section>
  )

  // -------------------------------------------------------------------------
  // 3. Badges & Status pills
  // -------------------------------------------------------------------------
  const badgesSection = (
    <Section
      number={3}
      title="Badges & Status pills"
      blurb="The Badge primitive is fine; the inline status-style mapping in patient-history is the canonical pattern but is hard-coded per page. Filter pills are also their own inline pattern."
    >
      <Entry
        name="Badge primitive"
        verdict="keep"
        usedIn="src/components/ui/badge.tsx — used by Unit Management, Client Management, Security, etc."
      >
        <div className="flex flex-wrap gap-2">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="destructive">Destructive</Badge>
        </div>
      </Entry>

      <Entry
        name="StatusBadge"
        verdict="done"
        usedIn="4 sites — patient-history (booking statuses + self-collect/monthly-invoice overrides), user/unit/client-management list rows (Active/Disabled)"
        notes={'<StatusBadge status={user.status} testId={`status-badge-${user.id}`} />'}
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div className="flex flex-col items-center gap-1">
            <StatusBadge status="Payment Complete" />
            <span className="text-[10px] text-ink-muted">Payment Complete</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <StatusBadge status="Payment Complete" selfCollect />
            <span className="text-[10px] text-ink-muted">+ selfCollect</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <StatusBadge status="Payment Complete" monthlyInvoice />
            <span className="text-[10px] text-ink-muted">+ monthlyInvoice</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <StatusBadge status="In Progress" />
            <span className="text-[10px] text-ink-muted">In Progress</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <StatusBadge status="Abandoned" />
            <span className="text-[10px] text-ink-muted">Abandoned</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <StatusBadge status="Successful" />
            <span className="text-[10px] text-ink-muted">Successful</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <StatusBadge status="Discarded" />
            <span className="text-[10px] text-ink-muted">Discarded</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <StatusBadge status="Active" />
            <span className="text-[10px] text-ink-muted">Active</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <StatusBadge status="Disabled" />
            <span className="text-[10px] text-ink-muted">Disabled</span>
          </div>
        </div>
      </Entry>

      <Entry
        name="FilterPill"
        verdict="done"
        usedIn="4 sites — patient-history (4 status pills) + user/unit/client-management list filters (3 each). Management pages also brought onto the unified visual at the same time."
        notes={'<FilterPill active={...} label="..." count={n} onClick={...} testId="filter-..." />'}
      >
        <FilterPillDemo />
      </Entry>

      <Entry
        name="StepPill"
        verdict="done"
        usedIn="2 sites — patient-details booking flow (.map over STEP_LABELS) + client-management Add wizard (4 hand-rolled divs collapsed to a .map)"
        notes={'<StepPill state="active|completed|inactive">Label</StepPill>'}
      >
        <div className="flex flex-wrap items-center gap-2">
          <StepPill state="completed">Basic Info</StepPill>
          <StepPill state="completed">Address</StepPill>
          <StepPill state="active">Payment Type</StepPill>
          <StepPill state="inactive">Verification</StepPill>
        </div>
      </Entry>
    </Section>
  )

  // -------------------------------------------------------------------------
  // 4. Cards & Surfaces
  // -------------------------------------------------------------------------
  const cardsSection = (
    <Section
      number={4}
      title="Cards & Surfaces"
      blurb="The Card primitive has been deleted (zero production usage). DataCard handles the mobile/row card duality. Banners and 'empty state' wrappers are inline duplicates."
    >
      <Entry
        name="DataCard (mobile row composition)"
        verdict="keep"
        usedIn="src/components/data-card.tsx — patient-history, user/unit/client management mobile views"
        notes="Status badge + label/value rows + action button. The canonical mobile-row primitive."
      >
        <div className="rounded-xl bg-white p-4">
          <div className="mb-3">
            <span className="inline-flex h-5 items-center rounded-full bg-yellow-100 px-3 text-xs font-medium text-yellow-800">
              Payment Complete
            </span>
          </div>
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-muted">Patient</span>
              <span className="text-ink">M S Junkoon</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-muted">Date</span>
              <span className="text-ink">2024-03-13 11:44</span>
            </div>
          </div>
        </div>
      </Entry>

      <Entry
        name="DesktopRow"
        verdict="done"
        usedIn="4 sites — patient-history, user/unit/client-management list views"
        notes={'<DesktopRow gridTemplate="160px 1fr 1fr 1fr 1fr 140px" testId="..."> ... </DesktopRow>'}
      >
        <DesktopRow gridTemplate="1fr 1fr 1fr 120px" gap="gap-6" className="md:!grid">
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-ink-muted">Patient</span>
            <span className="text-sm text-ink">M S Junkoon</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-ink-muted">ID</span>
            <span className="text-sm text-ink">97XXX…81</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-ink-muted">Date</span>
            <span className="text-sm text-ink">2024-03-13</span>
          </div>
          <Button variant="primary-outline" size="sm">Options</Button>
        </DesktopRow>
      </Entry>

      <Entry
        name="Banner"
        verdict="done"
        usedIn="7 sites migrated so far — user/unit/client-management Add/Delete/Status banners. ~8 more inline copies remain in patient-history, security and create-booking flows."
        notes={'<Banner kind="success|warning|info|danger" title="..." description="..." onDismiss={...} />'}
      >
        <div className="flex flex-col gap-3">
          <Banner
            kind="success"
            title="Patient Profile Created Successfully"
            description="The patient's profile has been created."
            onDismiss={() => {}}
          />
          <Banner
            kind="warning"
            title="Awaiting Confirmation"
            description="Payment may have been received but PayFast hasn't confirmed yet."
          />
          <Banner
            kind="info"
            title="Monthly Invoice client"
            description="This client is billed monthly — no payment needed."
          />
          <Banner
            kind="danger"
            title="Payment Failed"
            description="The payment was unsuccessful. Please try again."
            onDismiss={() => {}}
          />
        </div>
      </Entry>

      <Entry
        name="EmptyState"
        verdict="done"
        usedIn="5 sites — patient-history, audit-log, user/unit/client-management list views"
        notes={'Minimal: <EmptyState>No patients found</EmptyState>. Rich: <EmptyState icon={Search} title="..." description="..." />.'}
      >
        <div className="flex flex-col gap-3">
          <EmptyState>No patients found</EmptyState>
          <EmptyState
            icon={Search}
            title="No results found"
            description="Try adjusting your filters or search query."
          />
        </div>
      </Entry>
    </Section>
  )

  // -------------------------------------------------------------------------
  // 5. Modals & Dialogs
  // -------------------------------------------------------------------------
  const modalsSection = (
    <Section
      number={5}
      title="Modals & Dialogs"
      blurb="The Dialog primitive is fine. The bespoke modals each layer their own width/padding/heading style — they should share a base modal shell (max-w-xx, rounded-2xl, p-6, Mulish H4 title) to avoid drift."
    >
      <Entry
        name="Dialog primitive"
        verdict="keep"
        usedIn="src/components/ui/dialog.tsx — base for every modal in the app"
      >
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow">
          <p className="text-sm text-ink">
            Base shadcn Dialog with Header, Title, Description, Content, Close.
          </p>
        </div>
      </Entry>

      <Entry
        name="PinVerificationModal"
        verdict="keep"
        usedIn="src/components/ui/pin-verification-modal.tsx — Start Consult, user deletion, sensitive ops"
        notes="Already shared. Worth aligning its title to the new Figma H4 spec."
      >
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow">
          <h3 className="mb-3 text-center text-xl font-bold text-ink">
            Confirm deletion
          </h3>
          <p className="mb-4 text-center text-sm text-ink-muted">
            Enter your access PIN to delete this user.
          </p>
          <div className="mb-4 flex justify-between gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="size-9 rounded-lg border border-gray-300 bg-gray-100"
              />
            ))}
          </div>
          <Button className="h-11 w-full rounded-xl bg-gray-900 text-white">
            Continue <ArrowRight className="size-4" />
          </Button>
        </div>
      </Entry>

      <Entry
        name="ConsultDeliveryModal"
        verdict="keep"
        usedIn="src/components/ui/consult-delivery-modal.tsx — Start Consult flow"
        notes="Two-option picker. Shares structure with PinVerification but currently has its own wider max-w."
      >
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow">
          <h3 className="mb-2 text-center text-base font-bold text-ink">
            How should the consultation be delivered?
          </h3>
          <div className="mt-3 flex flex-col gap-2">
            <button className="flex items-center gap-3 rounded-xl border border-gray-200 p-3 text-left hover:bg-gray-50">
              <span className="flex size-9 items-center justify-center rounded-full bg-[var(--client-primary-10)]">
                <Monitor className="size-4 text-[var(--client-primary-90)]" />
              </span>
              <span className="text-sm font-bold text-ink">
                Start on this device
              </span>
            </button>
            <button className="flex items-center gap-3 rounded-xl border border-gray-200 p-3 text-left hover:bg-gray-50">
              <span className="flex size-9 items-center justify-center rounded-full bg-[var(--client-primary-10)]">
                <Mail className="size-4 text-[var(--client-primary-90)]" />
              </span>
              <span className="text-sm font-bold text-ink">
                Send link via email
              </span>
            </button>
          </div>
        </div>
      </Entry>

      <Entry
        name="SessionIdleWarningModal"
        verdict="keep"
        usedIn="src/components/ui/session-idle-warning-modal.tsx"
      >
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow">
          <h3 className="mb-3 text-center text-xl font-bold text-ink">
            Are you still there?
          </h3>
          <p className="mb-4 text-center text-sm text-ink-muted">
            You&apos;ll be signed out in 2 minutes.
          </p>
          <div className="flex flex-col gap-2">
            <Button className="h-11 w-full rounded-xl">Stay signed in</Button>
            <Button variant="outline" className="h-11 w-full rounded-xl border-black">
              Sign out
            </Button>
          </div>
        </div>
      </Entry>

      <Entry
        name="ConfirmDialog"
        verdict="done"
        usedIn="7 sites — switch-unit, plus delete + status confirmations in user/unit/client-management/manage"
        notes={'<ConfirmDialog open onOpenChange title description confirmLabel onConfirm secondaryLabel? onSecondary? />'}
      >
        <ConfirmDialogDemo />
      </Entry>

      <Entry
        name="Inline 'verification code' modal — now using PinVerificationModal"
        verdict="done"
        usedIn="create-booking/patient-details — migrated to <PinVerificationModal />"
        notes={'<PinVerificationModal open onOpenChange activeUnitId heading onVerified />. The shared modal handles the fetch to /api/verify/manager-pin, error / pending state, and OTP slot rendering internally.'}
      >
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-ink-muted">
          Migrated to the existing <code className="rounded bg-gray-200 px-1">PinVerificationModal</code> primitive — see the Modals &amp; Dialogs section for its live demo.
        </div>
      </Entry>
    </Section>
  )

  // -------------------------------------------------------------------------
  // 6. Navigation
  // -------------------------------------------------------------------------
  const navSection = (
    <Section
      number={6}
      title="Navigation"
      blurb="Sidebar and Header are shared. SubNav (Back + page actions row) is inline-duplicated on every dashboard page. Tabs and pagination are duplicated too."
    >
      <Entry
        name="Sidebar"
        verdict="keep"
        usedIn="src/components/layout/sidebar.tsx"
      >
        <div className="flex h-32 w-full items-center justify-center rounded-xl bg-gray-900 text-sm text-white">
          Sidebar primitive
        </div>
      </Entry>

      <Entry
        name="Header"
        verdict="keep"
        usedIn="src/components/layout/header.tsx"
      >
        <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-sm text-ink-muted">Header</div>
          <div className="flex items-center gap-2">
            <Avatar className="size-9">
              <AvatarImage src="" alt="User" />
              <AvatarFallback>LM</AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium text-ink">Lucky M</span>
          </div>
        </div>
      </Entry>

      <Entry
        name="SubNav"
        verdict="done"
        usedIn="17 dashboard pages — every page with a Back button at the top. Each uses backHref for static links or onBack for dynamic handlers; pass children for the optional right-side action (typically Discard Flow)."
        notes={'<SubNav backHref="/home" /> or <SubNav onBack={handleBack}>{rightAction}</SubNav>'}
      >
        <div className="flex flex-col gap-3">
          <SubNav backHref="/home" />
          <SubNav onBack={() => {}}>
            <Button variant="danger" size="cta">Discard Flow</Button>
          </SubNav>
        </div>
      </Entry>

      <Entry
        name="TabStrip"
        verdict="done"
        usedIn="2 sites — security/page.tsx (4 underline tabs) + client-management/manage (5 pill tabs with count badges)"
        notes={'<TabStrip variant="underline|pill" tabs={[{value, label, icon, count?, testId?}]} value={tab} onChange={setTab} />'}
      >
        <TabStripDemo />
      </Entry>

      <Entry
        name="Pagination"
        verdict="keep"
        usedIn="src/components/list-pagination.tsx — every list page"
      >
        <div className="flex items-center justify-between">
          <span className="text-sm text-ink-muted">Showing 1–10 of 32</span>
          <div className="flex gap-2">
            <button className="flex size-9 items-center justify-center rounded-lg border border-gray-300">
              <ArrowLeft className="size-4" />
            </button>
            <button className="flex size-9 items-center justify-center rounded-lg bg-gray-900 text-sm font-medium text-white">
              1
            </button>
            <button className="flex size-9 items-center justify-center rounded-lg border border-gray-300 text-sm">
              2
            </button>
            <button className="flex size-9 items-center justify-center rounded-lg border border-gray-300">
              <ArrowRight className="size-4" />
            </button>
          </div>
        </div>
      </Entry>
    </Section>
  )

  // -------------------------------------------------------------------------
  // 7. Typography
  // -------------------------------------------------------------------------
  const typoSection = (
    <Section
      number={7}
      title="Typography"
      blurb="Headings are mostly consistent (font-heading text-2xl/4xl text-ink) but body text colours drift between text-ink-muted/600/700/900. Worth standardising."
    >
      <Entry
        name="Page H1 (canonical)"
        verdict="keep"
        usedIn="~12 dashboard pages"
        notes="font-heading text-2xl font-black leading-none text-ink sm:text-4xl"
      >
        <h1 className="font-heading text-2xl font-black leading-none text-ink sm:text-4xl">
          Patient History
        </h1>
      </Entry>

      <Entry
        name="Subtitle (canonical)"
        verdict="keep"
        usedIn="paired with every H1"
        notes="text-base text-ink-muted"
      >
        <p className="text-base text-ink-muted">
          Please provide the patient&apos;s identification details
        </p>
      </Entry>

      <Entry
        name="Modal H4 (DialogTitle)"
        verdict="done"
        usedIn="Every Dialog modal in the app — base style now lives in the DialogTitle primitive in components/ui/dialog.tsx. Consumers no longer override size/weight/colour, only positioning (mx-4) when needed."
        notes={'<DialogTitle>{heading}</DialogTitle> — renders Mulish 28px font-black leading-none text-ink, centered. Date / Time pickers (which use a hand-rolled overlay instead of Dialog) inherit the same className verbatim.'}
      >
        <h3 className="text-center font-heading text-[28px] font-black leading-none tracking-normal text-ink">
          Confirm deletion
        </h3>
      </Entry>

      <Entry
        name="Body text tokens (text-ink / text-ink-muted)"
        verdict="done"
        usedIn="Entire app — ~573 occurrences of text-gray-900/700/600/500 and text-[#242424] swept to text-ink + text-ink-muted."
        notes={'Defined as CSS variables (--text-ink, --text-ink-muted) in globals.css, exposed via @theme inline as --color-ink / --color-ink-muted so Tailwind generates the utilities. Future palette tweaks are a single-line edit in globals.css.'}
      >
        <div className="flex flex-col gap-1 text-sm">
          <span className="text-ink">
            text-ink — primary body (#242424). Replaces gray-900, gray-700 and the Figma #242424 literal.
          </span>
          <span className="text-ink-muted">
            text-ink-muted — labels, descriptions, secondary text (gray-500). Replaces gray-600 + gray-500.
          </span>
          <span className="text-gray-400">
            text-gray-400 — placeholders / hints / inactive (unchanged — semantically distinct).
          </span>
        </div>
      </Entry>
    </Section>
  )

  // -------------------------------------------------------------------------
  // 8. Consolidation outcome
  // -------------------------------------------------------------------------
  const roadmapSection = (
    <section className="flex flex-col gap-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 items-center rounded-md bg-emerald-100 px-2 text-xs font-bold tracking-wide text-emerald-700">
            COMPLETE
          </span>
          <h2 className="text-2xl font-bold text-ink">
            Consolidation outcome
          </h2>
        </div>
        <p className="text-sm text-ink-muted">
          The original audit listed eight workstreams. All eight shipped in
          this session — every list page, manage page, booking-flow page and
          modal in the dashboard now resolves through shared primitives. The
          full file-by-file breakdown is documented in the sections above.
        </p>
      </div>

      <ol className="ml-5 list-decimal space-y-2 text-sm text-ink">
        <li>
          <strong>Buttons</strong> ✓ — added{" "}
          <code className="rounded bg-white px-1">primary</code>,{" "}
          <code className="rounded bg-white px-1">primary-outline</code>,{" "}
          <code className="rounded bg-white px-1">accent</code>,{" "}
          <code className="rounded bg-white px-1">danger</code>{" "}
          variants and{" "}
          <code className="rounded bg-white px-1">cta</code>,{" "}
          <code className="rounded bg-white px-1">cta-lg</code>,{" "}
          <code className="rounded bg-white px-1">nav</code>{" "}
          sizes to button.tsx. Migrated all 41+ inline CTAs. Deleted unused{" "}
          <code className="rounded bg-white px-1">default</code> variant +{" "}
          <code className="rounded bg-white px-1">cta-xl</code> /{" "}
          <code className="rounded bg-white px-1">row</code> sizes once
          downstream call sites moved off them.
        </li>
        <li>
          <strong>Form Inputs</strong> ✓ — kept FloatingInput / FloatingSelect.
          Built <code className="rounded bg-white px-1">&lt;SearchInput&gt;</code>{" "}
          (6 sites), <code className="rounded bg-white px-1">&lt;OtpInput&gt;</code>{" "}
          (7 sites — including the raw-input nurse-verification dialog in
          user-management/manage, which moved from{" "}
          <code className="rounded bg-white px-1">string[]</code>{" "}
          state to a single masked string), and{" "}
          <code className="rounded bg-white px-1">&lt;YesNoToggle&gt;</code>{" "}
          (2 sites).
        </li>
        <li>
          <strong>Status pills</strong> ✓ —{" "}
          <code className="rounded bg-white px-1">&lt;StatusBadge&gt;</code>{" "}
          with the colour mapping baked in. Migrated 4 list pages and deleted
          4 copies of <code className="rounded bg-white px-1">getStatusStyle()</code>.
          Self-collect / monthly-invoice overrides supported via props.
        </li>
        <li>
          <strong>Filter / step pills</strong> ✓ — built{" "}
          <code className="rounded bg-white px-1">&lt;FilterPill&gt;</code>{" "}
          (4 sites, ~180 lines saved) and{" "}
          <code className="rounded bg-white px-1">&lt;StepPill&gt;</code>{" "}
          (2 sites, ~90 lines saved). Management filter pills also flipped
          onto the patient-history visual for consistency.
        </li>
        <li>
          <strong>Banners</strong> ✓ —{" "}
          <code className="rounded bg-white px-1">&lt;Banner kind=&quot;success|warning|info|danger&quot;&gt;</code>{" "}
          built. 18 sites migrated across user / unit / client management,
          the create-booking flow (patient-details success, select-patient
          warning) and all 5 security-dashboard load-error states. Local
          one-off banner helpers (e.g. add-client&apos;s SuccessBanner) deleted.
          Action-button banners use the children slot.
        </li>
        <li>
          <strong>Modals</strong> ✓ —{" "}
          <code className="rounded bg-white px-1">&lt;ConfirmDialog&gt;</code>{" "}
          built with 2- and 3-button layouts + loading states. 7 inline
          modals migrated (switch-unit + delete/status across the 3 manage
          pages). Inline nurse-PIN modal in patient-details migrated to
          PinVerificationModal. DialogTitle primitive now ships the canonical
          Mulish 28px H4 by default — every consumer dropped its override.
        </li>
        <li>
          <strong>SubNav</strong> ✓ — built{" "}
          <code className="rounded bg-white px-1">&lt;SubNav backHref|onBack&gt;&#123;actions&#125;&lt;/SubNav&gt;</code>.
          16 dashboard pages migrated. Discard Flow / Delete-X / "+ New" actions
          fit naturally in the children slot.
        </li>
        <li>
          <strong>Typography</strong> ✓ — codified{" "}
          <code className="rounded bg-white px-1">--text-ink</code> +{" "}
          <code className="rounded bg-white px-1">--text-ink-muted</code>{" "}
          in globals.css as Tailwind tokens. Swept 573 occurrences of the
          six legacy greys (gray-900 / gray-700 / gray-600 / gray-500 /
          #242424) into two semantic levels. Placeholder gray-400 kept as the
          third semantic shade.
        </li>
      </ol>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-white p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
            Components added
          </div>
          <div className="mt-1 text-2xl font-bold text-emerald-700">11</div>
          <div className="mt-1 text-[11px] text-ink-muted">
            Banner, ConfirmDialog, DesktopRow, EmptyState, FilterPill,
            OtpInput, SearchInput, StatusBadge, StepPill, SubNav, TabStrip,
            YesNoToggle
          </div>
        </div>
        <div className="rounded-lg bg-white p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
            Inline patterns removed
          </div>
          <div className="mt-1 text-2xl font-bold text-emerald-700">1,300+</div>
          <div className="mt-1 text-[11px] text-ink-muted">
            lines of duplicated JSX across the dashboard, plus 573 grey-text
            occurrences collapsed to two tokens
          </div>
        </div>
        <div className="rounded-lg bg-white p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
            Dead code deleted
          </div>
          <div className="mt-1 text-2xl font-bold text-emerald-700">2</div>
          <div className="mt-1 text-[11px] text-ink-muted">
            Card primitive (zero production usage), Tabs primitive
            (replaced by TabStrip)
          </div>
        </div>
      </div>

      <p className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-900">
        <strong>Follow-up tail — cleared.</strong> The remaining ~8 inline
        banners (create-booking flow + security tabs) and the
        user-management/manage raw-input PIN dialog were migrated in a
        follow-up pass: 11 banner sites moved to{" "}
        <code className="rounded bg-white px-1">&lt;Banner&gt;</code> and the
        PIN dialog dropped its <code className="rounded bg-white px-1">string[]</code>{" "}
        state + manual focus refs to use{" "}
        <code className="rounded bg-white px-1">&lt;OtpInput&gt;</code>. The
        only deferred item is a handful of one-off section headings where
        layout constraints differ per screen — better picked up per-file
        when next touched.
      </p>
    </section>
  )

  return (
    <div className="flex flex-col gap-8">
      {/* Page header */}
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-2xl font-black leading-none text-ink sm:text-4xl">
          Design System Audit
        </h1>
        <p className="text-base text-ink-muted">
          Every UI primitive and inline pattern variant the codebase currently
          uses. Choose which patterns become canonical, and which get
          consolidated.
        </p>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 text-xs">
        <span className="font-semibold text-ink">Legend:</span>
        <div className="flex items-center gap-2">
          <VerdictPill verdict="done" />
          <span className="text-ink-muted">Consolidation complete — canonical pattern in use.</span>
        </div>
        <div className="flex items-center gap-2">
          <VerdictPill verdict="keep" />
          <span className="text-ink-muted">Canonical — use this going forward.</span>
        </div>
        <div className="flex items-center gap-2">
          <VerdictPill verdict="review" />
          <span className="text-ink-muted">Decide whether to keep or extract.</span>
        </div>
        <div className="flex items-center gap-2">
          <VerdictPill verdict="consolidate" />
          <span className="text-ink-muted">Inline duplicate — replace with a shared component.</span>
        </div>
      </div>

      {buttonsSection}
      <Separator />
      {inputsSection}
      <Separator />
      {badgesSection}
      <Separator />
      {cardsSection}
      <Separator />
      {modalsSection}
      <Separator />
      {navSection}
      <Separator />
      {typoSection}

      <Separator />
      {roadmapSection}
    </div>
  )
}
