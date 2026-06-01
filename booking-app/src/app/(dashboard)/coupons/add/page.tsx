"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SubNav } from "@/components/ui/sub-nav"
import { FloatingInput } from "@/components/ui/floating-input"
import { FloatingSelect } from "@/components/ui/floating-select"
import { DatePickerField } from "@/components/ui/date-picker-dialog"
import { Banner } from "@/components/ui/banner"
import { useAuth } from "@/lib/auth-store"
import { useClientStore } from "@/lib/client-store"

// =============================================================================
// /coupons/add — create a new coupon (system_admin only)
// =============================================================================

type DiscountType = "percentage" | "fixed"

export default function CouponAddPage() {
  const router = useRouter()
  const { isSystemAdmin, loading: authLoading } = useAuth()
  const { clients } = useClientStore()

  // ----- General -----
  const [code, setCode] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [discountType, setDiscountType] = React.useState<DiscountType>("percentage")
  const [discountValue, setDiscountValue] = React.useState("")
  // "" = "Any client" (NULL on server). Otherwise the selected client id.
  const [clientId, setClientId] = React.useState("")

  // ----- Validity -----
  const [validFrom, setValidFrom] = React.useState("")
  const [validUntil, setValidUntil] = React.useState("")
  const [minSpend, setMinSpend] = React.useState("")
  const [maxSpend, setMaxSpend] = React.useState("")

  // ----- Usage limits -----
  const [usageLimit, setUsageLimit] = React.useState("")
  const [usageLimitPerEmail, setUsageLimitPerEmail] = React.useState("")

  // ----- Allowed emails -----
  const [allowedEmailsText, setAllowedEmailsText] = React.useState("")

  // ----- UI state -----
  const [submitting, setSubmitting] = React.useState(false)
  const [submitError, setSubmitError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({})

  React.useEffect(() => {
    if (!authLoading && !isSystemAdmin) router.replace("/home")
  }, [authLoading, isSystemAdmin, router])

  function validate(): string | null {
    const errs: Record<string, string> = {}
    if (!code.trim()) errs.code = "Code is required"
    else if (code.trim().length > 64) errs.code = "Max 64 characters"
    const valueNum = Number(discountValue)
    if (!discountValue.trim() || !isFinite(valueNum) || valueNum <= 0) {
      errs.discountValue = "Enter a positive number"
    } else if (discountType === "percentage" && valueNum > 100) {
      errs.discountValue = "Percentage can't exceed 100"
    }
    setFieldErrors(errs)
    if (Object.keys(errs).length > 0) return "Please fix the highlighted fields"
    if (validFrom && validUntil && new Date(validFrom) > new Date(validUntil)) {
      return "Valid-from can't be after Valid-until"
    }
    const minN = minSpend.trim() ? Number(minSpend) : null
    const maxN = maxSpend.trim() ? Number(maxSpend) : null
    if (minN !== null && maxN !== null && minN > maxN) {
      return "Min spend can't exceed Max spend"
    }
    return null
  }

  async function handleSubmit() {
    setSubmitError(null)
    const err = validate()
    if (err) {
      setSubmitError(err)
      return
    }
    setSubmitting(true)
    const allowedEmails = allowedEmailsText
      .split(/[,\n;]/)
      .map((e) => e.trim())
      .filter((e) => e.length > 0)
    try {
      const res = await fetch("/api/admin/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim(),
          description: description.trim() || null,
          discount_type: discountType,
          discount_value: Number(discountValue),
          valid_from: validFrom ? new Date(validFrom).toISOString() : null,
          valid_until: validUntil ? new Date(validUntil).toISOString() : null,
          min_spend: minSpend.trim() ? Number(minSpend) : null,
          max_spend: maxSpend.trim() ? Number(maxSpend) : null,
          usage_limit: usageLimit.trim() ? Number(usageLimit) : null,
          usage_limit_per_email: usageLimitPerEmail.trim()
            ? Number(usageLimitPerEmail)
            : null,
          allowed_emails: allowedEmails.length > 0 ? allowedEmails : null,
          client_id: clientId || null,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        data?: { code?: string }
        error?: string
      }
      if (!res.ok) {
        setSubmitError(data.error ?? "Failed to create coupon")
        setSubmitting(false)
        return
      }
      router.push(`/coupons?created=${encodeURIComponent(data.data?.code ?? code.trim())}`)
    } catch (err2) {
      setSubmitError(err2 instanceof Error ? err2.message : "Failed to create coupon")
      setSubmitting(false)
    }
  }

  return (
    <div data-testid="add-coupon-page" className="flex flex-col gap-8">
      {/* Top bar */}
      <SubNav backHref="/coupons" backTestId="back-button" />

      {/* Form card — centred narrow column to match Add User / Add Client */}
      <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-6 pt-4">
        {/* Heading */}
        <div className="flex flex-col items-center gap-2 text-center">
          <h1
            data-testid="page-heading"
            className="text-3xl font-bold text-ink"
          >
            Add new coupon
          </h1>
          <p className="text-base text-ink-muted">
            Discount code patients can enter at the payment step
          </p>
        </div>

        {submitError && (
          <Banner
            kind="danger"
            title="Couldn't create coupon"
            description={submitError}
            onDismiss={() => setSubmitError(null)}
            className="w-full"
          />
        )}

        {/* Fields */}
        <div className="flex w-full flex-col gap-4">
          {/* ----- General ----- */}
          <FloatingInput
            id="code"
            label="Code (e.g. WINTER20)"
            value={code}
            onChange={setCode}
            onClear={() => setCode("")}
            error={fieldErrors.code}
            data-testid="coupon-code-input"
          />
          <FloatingInput
            id="description"
            label="Description (internal — not shown to patient)"
            value={description}
            onChange={setDescription}
            onClear={() => setDescription("")}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FloatingSelect
              id="discount-type"
              label="Discount type"
              value={discountType}
              onChange={(v) => setDiscountType(v as DiscountType)}
              options={[
                { value: "percentage", label: "Percentage (%)" },
                { value: "fixed", label: "Fixed amount (R)" },
              ]}
              data-testid="coupon-discount-type"
            />
            <FloatingInput
              id="discount-value"
              label={discountType === "percentage" ? "Discount %" : "Discount amount (R)"}
              value={discountValue}
              onChange={setDiscountValue}
              onClear={() => setDiscountValue("")}
              type="number"
              error={fieldErrors.discountValue}
              data-testid="coupon-discount-value"
            />
          </div>

          {/* ----- Scope ----- */}
          <FloatingSelect
            id="client-scope"
            label="Restrict to client"
            value={clientId}
            onChange={setClientId}
            options={[
              { value: "", label: "Any client" },
              ...clients
                .slice()
                .sort((a, b) => a.clientName.localeCompare(b.clientName))
                .map((c) => ({ value: c.id, label: c.clientName })),
            ]}
            data-testid="coupon-client-scope"
          />

          {/* ----- Validity ----- */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DatePickerField
              id="valid-from"
              label="Valid from"
              value={validFrom}
              onChange={setValidFrom}
              onClear={() => setValidFrom("")}
            />
            <DatePickerField
              id="valid-until"
              label="Valid until"
              value={validUntil}
              onChange={setValidUntil}
              onClear={() => setValidUntil("")}
            />
            <FloatingInput
              id="min-spend"
              label="Min spend (R)"
              value={minSpend}
              onChange={setMinSpend}
              onClear={() => setMinSpend("")}
              type="number"
            />
            <FloatingInput
              id="max-spend"
              label="Max spend (R)"
              value={maxSpend}
              onChange={setMaxSpend}
              onClear={() => setMaxSpend("")}
              type="number"
            />
          </div>

          {/* ----- Usage limits ----- */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FloatingInput
              id="usage-limit"
              label="Total uses (all patients)"
              value={usageLimit}
              onChange={setUsageLimit}
              onClear={() => setUsageLimit("")}
              type="number"
            />
            <FloatingInput
              id="usage-limit-per-email"
              label="Uses per patient email"
              value={usageLimitPerEmail}
              onChange={setUsageLimitPerEmail}
              onClear={() => setUsageLimitPerEmail("")}
              type="number"
            />
          </div>

          {/* ----- Allowed emails ----- */}
          <div className="flex flex-col gap-2">
            <label
              htmlFor="allowed-emails"
              className="px-1 text-xs font-semibold text-ink-muted"
            >
              Allowed patient emails (optional)
            </label>
            <textarea
              id="allowed-emails"
              value={allowedEmailsText}
              onChange={(e) => setAllowedEmailsText(e.target.value)}
              placeholder="patient1@example.com&#10;patient2@example.com"
              rows={3}
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-ink focus:border-[var(--client-primary)] focus:outline-none"
              data-testid="coupon-allowed-emails"
            />
            <span className="px-1 text-[11px] text-ink-muted">
              One per line or comma-separated. Leave blank for any patient.
            </span>
          </div>
        </div>

        {/* Submit button — matches Add User CTA */}
        <Button
          data-testid="create-coupon-button"
          variant="primary"
          size="cta-lg"
          className="mt-2 w-full"
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <>
              Creating Coupon...
              <svg className="ml-2 size-4 animate-spin" viewBox="0 0 40 40" fill="none">
                <circle cx="20" cy="20" r="15" stroke="#6b7280" strokeWidth="5" strokeLinecap="round" />
                <circle cx="20" cy="20" r="15" stroke="white" strokeWidth="5" strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset="70" />
              </svg>
            </>
          ) : (
            <>
              Add Coupon
              <ArrowRight className="ml-2 size-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
