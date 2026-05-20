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
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
            <span className="text-sm font-bold text-gray-900">{name}</span>
            <VerdictPill verdict={verdict} />
          </div>
          <span className="text-xs text-gray-500">{usedIn}</span>
        </div>
      </div>

      <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4">
        {children}
      </div>

      {notes && (
        <p className="text-xs text-gray-600 italic">{notes}</p>
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
          <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
        </div>
        <p className="ml-11 text-sm text-gray-600">{blurb}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{children}</div>
    </section>
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
      | "default"
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
      name: "default",
      variant: "default",
      description: "bg-black text-white",
      when: "Legacy. Avoid in new code — use `primary` instead.",
    },
    {
      name: "primary",
      variant: "primary",
      description: "bg-gray-900 text-white",
      when: "The standard dark CTA. Auth, modals, manage-page saves.",
    },
    {
      name: "primary-outline",
      variant: "primary-outline",
      description: "border border-black bg-white text-gray-900",
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
                <code className="text-xs font-bold text-gray-900">
                  variant=&quot;{row.name}&quot;
                </code>
                <span className="truncate text-[11px] text-gray-500" title={row.description}>
                  {row.description}
                </span>
                <span className="text-[11px] italic text-gray-600">{row.when}</span>
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
                <code className="text-xs font-bold text-gray-900">
                  size=&quot;{row.name}&quot; · {row.height}
                </code>
                <span className="truncate text-[11px] text-gray-500" title={row.description}>
                  {row.description}
                </span>
                <span className="text-[11px] italic text-gray-600">{row.when}</span>
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
            <span className="text-[10px] text-gray-500">default</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <Button variant="primary" size="cta" disabled>Disabled</Button>
            <span className="text-[10px] text-gray-500">disabled</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <Button variant="primary" size="cta" aria-invalid>Invalid</Button>
            <span className="text-[10px] text-gray-500">aria-invalid</span>
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
        notes={'<Button variant="primary" size="lg" className="w-full">Start Consult</Button>'}
      >
        <Button variant="primary" size="lg" className="w-full">
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
        notes={'<Button variant="danger" size="sm">Discard Flow</Button>'}
      >
        <Button variant="danger" size="sm">Discard Flow</Button>
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
              className="peer h-14 w-full rounded-lg border border-gray-300 bg-white px-4 pt-5 pb-1 text-sm text-gray-900 outline-none focus:border-gray-900"
            />
            <label className="pointer-events-none absolute left-4 top-2 text-[10px] font-medium uppercase tracking-wider text-gray-500">
              Full name
            </label>
          </div>
          <div className="relative">
            <input
              placeholder="Empty state"
              className="peer h-14 w-full rounded-lg border border-gray-300 bg-white px-4 text-sm text-gray-900 outline-none focus:border-gray-900"
            />
          </div>
        </div>
      </Entry>

      <Entry
        name="Search input (every list page)"
        verdict="consolidate"
        usedIn="5 list pages — patient-history, audit-log, user-management, unit-management, client-management"
        notes="Same Search icon + Input wrapper duplicated. Should become a <SearchInput placeholder=... /> component."
      >
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
          <Input
            type="search"
            placeholder="Search Patient Name or ID Number"
            className="bg-white py-2 pl-8"
          />
        </div>
      </Entry>

      <Entry
        name="OTP / PIN inputs"
        verdict="review"
        usedIn="5 locations — sign-in, forgot-pin, reset-pin, create-booking (nurse verify), patient-details (booking verify)"
        notes="Uses InputOTP primitive but each call site declares its own slots. Strong candidate for a shared <OtpInput value onChange length /> wrapper."
      >
        <div className="flex justify-between gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex size-10 items-center justify-center rounded-lg border border-gray-300 bg-gray-100 text-base font-medium text-gray-900 sm:size-11"
            >
              {i === 0 ? "•" : ""}
            </div>
          ))}
        </div>
      </Entry>

      <Entry
        name="FloatingSelect"
        verdict="keep"
        usedIn="src/components/ui/floating-select.tsx — dropdown sibling of FloatingInput"
      >
        <div className="relative">
          <button
            type="button"
            className="flex h-14 w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-4 text-sm text-gray-900"
          >
            <span className="flex flex-col items-start">
              <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
                Province
              </span>
              <span>Gauteng</span>
            </span>
            <ChevronDown className="size-4 text-gray-400" />
          </button>
        </div>
      </Entry>

      <Entry
        name="Toggle (Yes / No pill)"
        verdict="review"
        usedIn="~3 places in patient-details form"
        notes="Inline pattern — small pill toggle for boolean fields. No shared primitive."
      >
        <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm">
          <span className="text-gray-900">Self-collect at unit</span>
          <div className="inline-flex rounded-full bg-gray-100 p-0.5">
            <button className="rounded-full px-3 py-1 text-xs font-medium text-gray-500">
              Yes
            </button>
            <button className="rounded-full bg-gray-900 px-3 py-1 text-xs font-medium text-white">
              No
            </button>
          </div>
        </div>
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
        name="Booking status pill"
        verdict="consolidate"
        usedIn="patient-history (6 statuses) + create-booking row indicators"
        notes="Each status maps to a {bg, text} colour pair via inline switch statement. Should be extracted to a <StatusBadge status='Payment Complete' /> component with the mapping built in."
      >
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex h-5 items-center rounded-full bg-yellow-100 px-3 text-xs font-medium text-yellow-800">
            Payment Complete
          </span>
          <span className="inline-flex h-5 items-center rounded-full bg-[#CDE5F2] px-3 text-xs font-medium text-[#3ea3db]">
            In Progress
          </span>
          <span className="inline-flex h-5 items-center rounded-full bg-[#FF3A69] px-3 text-xs font-medium text-white">
            Incomplete Booking
          </span>
          <span className="inline-flex h-5 items-center rounded-full bg-green-100 px-3 text-xs font-medium text-green-600">
            Booking Successful
          </span>
          <span className="inline-flex h-5 items-center rounded-full bg-gray-900 px-3 text-xs font-medium text-white">
            Discarded
          </span>
        </div>
      </Entry>

      <Entry
        name="Filter pill (active / inactive)"
        verdict="consolidate"
        usedIn="patient-history (4 pills) + similar pattern in audit-log"
        notes="White card + colour-coded count badge + label. Currently duplicated 4× in patient-history with hand-rolled className. Becomes <FilterPill active label count /> driven by a config array."
      >
        <div className="flex flex-wrap gap-2">
          <button className="inline-flex items-center gap-1.5 rounded-lg bg-[#FCFAF9] px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-100">
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-[var(--client-primary)] px-1 text-xs font-semibold text-white">
              3
            </span>
            In Progress
          </button>
          <button className="inline-flex items-center gap-1.5 rounded-lg bg-[#FCFAF9] px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-100">
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-gray-200 px-1 text-xs font-semibold text-gray-700">
              1
            </span>
            Completed
          </button>
        </div>
      </Entry>

      <Entry
        name="Step indicator pill (Basic Info / Address / etc.)"
        verdict="consolidate"
        usedIn="patient-details booking flow + client-management Add wizard"
        notes="States: active, completed (green check), inactive. Three colour modes hand-rolled in patient-details — should be <StepPill state='active|completed|inactive' />."
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700">
            <Check className="size-3" />
            Basic Info
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700">
            <Check className="size-3" />
            Address
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--client-primary)] bg-[var(--client-primary-10)] px-3 py-1.5 text-xs font-semibold text-[var(--client-primary)]">
            Payment Type
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-400">
            Verification
          </span>
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
      blurb="The Card primitive is fine but barely used. DataCard handles the mobile/row card duality. Banners and 'empty state' wrappers are inline duplicates."
    >
      <Entry
        name="Card primitive"
        verdict="review"
        usedIn="src/components/ui/card.tsx — rarely used directly"
        notes="Generic Header/Title/Content slots. Most pages bypass it for inline 'rounded-xl bg-white p-6' instead. Consider deleting if usage stays low."
      >
        <Card>
          <CardHeader>
            <CardTitle>Card title</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">Card content body.</p>
          </CardContent>
        </Card>
      </Entry>

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
              <span className="text-gray-500">Patient</span>
              <span className="text-gray-900">M S Junkoon</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Date</span>
              <span className="text-gray-900">2024-03-13 11:44</span>
            </div>
          </div>
        </div>
      </Entry>

      <Entry
        name="Desktop row container"
        verdict="consolidate"
        usedIn="patient-history, user/unit/client-management list views"
        notes="Identical pattern: hidden md:grid grid-cols-[...] items-center gap-X rounded-xl bg-white px-6 py-5. The grid template differs per page; everything else is the same."
      >
        <div className="hidden grid-cols-[1fr_1fr_1fr_120px] items-center gap-6 rounded-xl bg-white px-6 py-5 md:grid">
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-gray-500">Patient</span>
            <span className="text-sm text-gray-900">M S Junkoon</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-gray-500">ID</span>
            <span className="text-sm text-gray-900">97XXX…81</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-gray-500">Date</span>
            <span className="text-sm text-gray-900">2024-03-13</span>
          </div>
          <Button variant="outline">Options</Button>
        </div>
      </Entry>

      <Entry
        name="Success / info / warning banner"
        verdict="consolidate"
        usedIn="~15 places — every page that needs a success/error message at top"
        notes="Same flex w-full items-start justify-between rounded-xl bg-COLOR-100 px-6 py-5 pattern. Colour varies (green/red/amber/blue). Should be <Banner kind='success|warning|info|danger' title body onDismiss />."
      >
        <div className="flex w-full items-start justify-between rounded-xl bg-green-100 px-6 py-5">
          <div className="flex flex-col gap-1">
            <span className="text-base font-bold text-gray-900">
              Patient Profile Created Successfully
            </span>
            <p className="text-sm text-gray-500">
              The patient&apos;s profile has been created.
            </p>
          </div>
          <button className="shrink-0 rounded-full p-1 text-gray-400 hover:text-gray-600">
            <X className="size-4" />
          </button>
        </div>
      </Entry>

      <Entry
        name="Empty state"
        verdict="review"
        usedIn="patient-history, audit-log, security (per-tab)"
        notes="Each page has its own inline empty-state JSX. Single shared <EmptyState icon title description /> would save ~12 lines per occurrence."
      >
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-gray-200 bg-white p-12 text-center">
          <Search className="size-8 text-gray-300" />
          <span className="text-base font-medium text-gray-900">
            No results found
          </span>
          <p className="text-sm text-gray-500">
            Try adjusting your filters or search query.
          </p>
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
          <p className="text-sm text-gray-700">
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
          <h3 className="mb-3 text-center text-xl font-bold text-gray-900">
            Confirm deletion
          </h3>
          <p className="mb-4 text-center text-sm text-gray-500">
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
          <h3 className="mb-2 text-center text-base font-bold text-gray-900">
            How should the consultation be delivered?
          </h3>
          <div className="mt-3 flex flex-col gap-2">
            <button className="flex items-center gap-3 rounded-xl border border-gray-200 p-3 text-left hover:bg-gray-50">
              <span className="flex size-9 items-center justify-center rounded-full bg-[var(--client-primary-10)]">
                <Monitor className="size-4 text-[var(--client-primary-90)]" />
              </span>
              <span className="text-sm font-bold text-gray-900">
                Start on this device
              </span>
            </button>
            <button className="flex items-center gap-3 rounded-xl border border-gray-200 p-3 text-left hover:bg-gray-50">
              <span className="flex size-9 items-center justify-center rounded-full bg-[var(--client-primary-10)]">
                <Mail className="size-4 text-[var(--client-primary-90)]" />
              </span>
              <span className="text-sm font-bold text-gray-900">
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
          <h3 className="mb-3 text-center text-xl font-bold text-gray-900">
            Are you still there?
          </h3>
          <p className="mb-4 text-center text-sm text-gray-500">
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
        name="Confirm dialog (inline)"
        verdict="consolidate"
        usedIn="switch-unit, unit-management/manage, user-management/manage, client-management/manage"
        notes="Same yes/cancel confirmation modal hand-rolled in 4+ places. Should be a single <ConfirmDialog title description confirmLabel onConfirm /> component."
      >
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow">
          <h3 className="mb-3 text-center text-xl font-bold text-gray-900">
            Delete this user?
          </h3>
          <p className="mb-4 text-center text-sm text-gray-500">
            This action cannot be undone.
          </p>
          <div className="flex flex-col gap-2">
            <Button className="h-11 w-full rounded-xl bg-gray-900 text-white">
              Yes, delete
            </Button>
            <button className="text-center text-sm font-medium text-[#FF3A69]">
              Cancel
            </button>
          </div>
        </div>
      </Entry>

      <Entry
        name="Inline 'verification code' modal"
        verdict="consolidate"
        usedIn="create-booking/patient-details — nurse-PIN before saving booking"
        notes="Effectively a re-implementation of PinVerificationModal. Should be migrated to use the shared component."
      >
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow">
          <h3 className="mb-3 text-center text-xl font-bold text-gray-900">
            Enter your nurse verification code
          </h3>
          <div className="mb-4 flex justify-between gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="size-9 rounded-lg border border-gray-300 bg-gray-100"
              />
            ))}
          </div>
          <Button className="h-11 w-full rounded-xl bg-gray-900 text-white">
            Continue
          </Button>
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
          <div className="text-sm text-gray-500">Header</div>
          <div className="flex items-center gap-2">
            <Avatar className="size-9">
              <AvatarImage src="" alt="User" />
              <AvatarFallback>LM</AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium text-gray-900">Lucky M</span>
          </div>
        </div>
      </Entry>

      <Entry
        name="SubNav (Back button row)"
        verdict="consolidate"
        usedIn="~17 dashboard pages — every page that has a Back button at the top"
        notes="Same outer wrapper + Back button + optional right-side action button. The deleted sub-nav.tsx component captured this — recommended to rebuild it."
      >
        <div className="flex items-center justify-between rounded-xl bg-white px-6 py-4">
          <button className="inline-flex items-center gap-3 rounded-lg border border-black bg-white px-6 py-2 text-sm font-medium">
            <ArrowLeft className="size-4" />
            Back
          </button>
          <button
            className="rounded-lg px-6 py-2 text-sm font-medium text-white"
            style={{ backgroundColor: "#FF3A69" }}
          >
            Discard Flow
          </button>
        </div>
      </Entry>

      <Entry
        name="Tabs (Security page)"
        verdict="review"
        usedIn="security/page.tsx (4 tabs), client-management/manage (4 tabs)"
        notes="Underlined tab strip. Each implementation rebuilds the active-border logic. Worth promoting to a shared <Tabs /> component (the primitive exists in tabs.tsx but isn't used)."
      >
        <div className="flex flex-wrap gap-2 border-b border-gray-200">
          <button className="-mb-px border-b-2 border-[var(--client-primary)] px-4 py-2 text-sm font-medium text-[var(--client-primary)]">
            Failed Attempts
          </button>
          <button className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-900">
            Active Sessions
          </button>
          <button className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-900">
            Suspicious
          </button>
          <button className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-900">
            History
          </button>
        </div>
      </Entry>

      <Entry
        name="Pagination"
        verdict="keep"
        usedIn="src/components/list-pagination.tsx — every list page"
      >
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">Showing 1–10 of 32</span>
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
      blurb="Headings are mostly consistent (font-heading text-2xl/4xl text-[#242424]) but body text colours drift between text-gray-500/600/700/900. Worth standardising."
    >
      <Entry
        name="Page H1 (canonical)"
        verdict="keep"
        usedIn="~12 dashboard pages"
        notes="font-heading text-2xl font-black leading-none text-[#242424] sm:text-4xl"
      >
        <h1 className="font-heading text-2xl font-black leading-none text-[#242424] sm:text-4xl">
          Patient History
        </h1>
      </Entry>

      <Entry
        name="Subtitle (canonical)"
        verdict="keep"
        usedIn="paired with every H1"
        notes="text-base text-gray-500"
      >
        <p className="text-base text-gray-500">
          Please provide the patient&apos;s identification details
        </p>
      </Entry>

      <Entry
        name="Modal H4"
        verdict="review"
        usedIn="every modal title"
        notes="Currently text-xl font-bold text-gray-900. Figma spec is Mulish 28px font-black leading-none — worth aligning across all modals."
      >
        <h3 className="font-heading text-xl font-bold text-gray-900">
          Confirm deletion
        </h3>
      </Entry>

      <Entry
        name="Body text colour drift"
        verdict="consolidate"
        usedIn="entire app"
        notes="text-gray-500 (labels), text-gray-600 (descriptions), text-gray-700 (light body), text-gray-900 (primary body), text-[#242424] (Figma spec). Pick two — primary text + muted — and migrate."
      >
        <div className="flex flex-col gap-1 text-sm">
          <span className="text-gray-900">text-gray-900 — primary body</span>
          <span className="text-[#242424]">text-[#242424] — Figma spec</span>
          <span className="text-gray-700">text-gray-700 — light body</span>
          <span className="text-gray-600">text-gray-600 — descriptions</span>
          <span className="text-gray-500">text-gray-500 — labels / subtitles</span>
          <span className="text-gray-400">text-gray-400 — placeholders</span>
        </div>
      </Entry>
    </Section>
  )

  // -------------------------------------------------------------------------
  // 8. Recommended consolidation roadmap
  // -------------------------------------------------------------------------
  const roadmapSection = (
    <section className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-6">
      <h2 className="text-2xl font-bold text-gray-900">
        Recommended consolidation roadmap
      </h2>
      <p className="text-sm text-gray-600">
        Once you decide which patterns to keep, the work breaks down roughly
        like this. Each numbered group above maps to one of these steps.
      </p>

      <ol className="ml-5 list-decimal space-y-2 text-sm text-gray-800">
        <li className="line-through opacity-70">
          <strong>Buttons</strong> — added{" "}
          <code className="rounded bg-gray-100 px-1">primary</code>,{" "}
          <code className="rounded bg-gray-100 px-1">primary-outline</code>,{" "}
          <code className="rounded bg-gray-100 px-1">accent</code>,{" "}
          <code className="rounded bg-gray-100 px-1">danger</code>{" "}
          variants and{" "}
          <code className="rounded bg-gray-100 px-1">cta</code>,{" "}
          <code className="rounded bg-gray-100 px-1">cta-lg</code>,{" "}
          <code className="rounded bg-gray-100 px-1">cta-xl</code>,{" "}
          <code className="rounded bg-gray-100 px-1">row</code>,{" "}
          <code className="rounded bg-gray-100 px-1">nav</code>{" "}
          sizes to button.tsx. Migrated all 41+ inline CTAs. <strong>Done.</strong>
        </li>
        <li>
          <strong>Form Inputs</strong> — keep FloatingInput / FloatingSelect.
          Extract <code className="rounded bg-gray-100 px-1">&lt;SearchInput&gt;</code>{" "}
          and <code className="rounded bg-gray-100 px-1">&lt;OtpInput&gt;</code> (~2 hrs).
        </li>
        <li>
          <strong>Status pills</strong> — build{" "}
          <code className="rounded bg-gray-100 px-1">&lt;StatusBadge status=... /&gt;</code>{" "}
          with the colour mapping baked in. Migrate 6+ call sites (~1 hr).
        </li>
        <li>
          <strong>Filter / step pills</strong> — extract{" "}
          <code className="rounded bg-gray-100 px-1">&lt;FilterPill&gt;</code>{" "}
          and <code className="rounded bg-gray-100 px-1">&lt;StepPill&gt;</code>
          {" "}driven by config arrays (~2 hrs).
        </li>
        <li>
          <strong>Banners</strong> —{" "}
          <code className="rounded bg-gray-100 px-1">&lt;Banner kind=&quot;success|warning|info|danger&quot;&gt;</code>{" "}
          replaces ~15 inline copies (~1.5 hrs).
        </li>
        <li>
          <strong>Modals</strong> — align every bespoke modal on one shell
          (max width, padding, Mulish H4 title). Migrate the inline nurse-PIN
          modal to use PinVerificationModal directly (~2 hrs).
        </li>
        <li>
          <strong>SubNav</strong> — rebuild the deleted{" "}
          <code className="rounded bg-gray-100 px-1">&lt;SubNav backHref onBack&gt;&#123;actions&#125;&lt;/SubNav&gt;</code>{" "}
          and migrate 17 dashboard pages (~3 hrs).
        </li>
        <li>
          <strong>Typography</strong> — pick two greys (primary + muted),
          codify in CSS variables, sweep with a single replace_all (~1 hr).
        </li>
      </ol>

      <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
        <strong>Total estimated effort:</strong> ~16.5 hours of focused work
        to bring the entire dashboard onto a consistent design system. The
        biggest single win is the Buttons consolidation — it touches more files
        than any other category.
      </p>
    </section>
  )

  return (
    <div className="flex flex-col gap-8">
      {/* Page header */}
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-2xl font-black leading-none text-[#242424] sm:text-4xl">
          Design System Audit
        </h1>
        <p className="text-base text-gray-500">
          Every UI primitive and inline pattern variant the codebase currently
          uses. Choose which patterns become canonical, and which get
          consolidated.
        </p>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 text-xs">
        <span className="font-semibold text-gray-700">Legend:</span>
        <div className="flex items-center gap-2">
          <VerdictPill verdict="done" />
          <span className="text-gray-600">Consolidation complete — canonical pattern in use.</span>
        </div>
        <div className="flex items-center gap-2">
          <VerdictPill verdict="keep" />
          <span className="text-gray-600">Canonical — use this going forward.</span>
        </div>
        <div className="flex items-center gap-2">
          <VerdictPill verdict="review" />
          <span className="text-gray-600">Decide whether to keep or extract.</span>
        </div>
        <div className="flex items-center gap-2">
          <VerdictPill verdict="consolidate" />
          <span className="text-gray-600">Inline duplicate — replace with a shared component.</span>
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
