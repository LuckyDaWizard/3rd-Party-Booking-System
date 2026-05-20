"use client"

import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px disabled:pointer-events-none disabled:opacity-100 disabled:bg-gray-300 disabled:text-ink-muted disabled:border-transparent aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
        // ---- Design system canonical variants ----------------------------
        // Replaces 30+ inline copies of `bg-gray-900 text-white hover:bg-gray-800`
        // across the dashboard. Use this for the dark filled CTA on auth
        // pages, modal confirms, manage-page saves, etc.
        primary:
          "bg-gray-900 text-white hover:bg-gray-800 disabled:bg-gray-300 disabled:text-ink-muted",
        // Outline twin of `primary` — used for the "Back" button at the top
        // of every dashboard SubNav, and for the secondary action in
        // Save / Cancel pairs.
        "primary-outline":
          "border border-black bg-white text-ink hover:bg-gray-50",
        // Painted in the client's brand colour (--client-primary). Use for
        // the "New X" action buttons on management pages.
        accent:
          "bg-[var(--client-primary)] text-white hover:opacity-90",
        // Brand pink (#FF3A69). Used for the Discard Flow button in Sub Nav
        // while a booking is mid-flight. Reserve for in-flow destructive
        // actions — for confirmation modals use `destructive` instead.
        danger: "bg-[#FF3A69] text-white hover:opacity-90",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
        // ---- Design system canonical sizes -------------------------------
        // 44px CTA — auth pages, modal confirms, manage-page saves.
        // Matches the original h-11 w-full rounded-xl text-base font-medium
        // inline pattern.
        cta: "h-11 gap-2 rounded-xl px-6 text-base font-medium has-data-[icon=inline-end]:pr-5 has-data-[icon=inline-start]:pl-5",
        // 48px CTA — landing pages (error, not-found, payment results,
        // terms acceptance) and long-form Save actions (Add Unit, Add User).
        // Slightly bigger and bolder than `cta`.
        "cta-lg":
          "h-12 gap-2 rounded-xl px-6 text-base font-semibold has-data-[icon=inline-end]:pr-5 has-data-[icon=inline-start]:pl-5",
        // 36px Back-button size — used in every SubNav. Slim, content
        // driven width, generous horizontal padding for the icon + label.
        nav: "h-9 gap-3 rounded-lg px-6 text-sm font-medium",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "primary",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
