"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SubNav } from "@/components/ui/sub-nav"
import { FloatingInput } from "@/components/ui/floating-input"
import { FloatingSelect } from "@/components/ui/floating-select"
import { Banner } from "@/components/ui/banner"
import { useAuth } from "@/lib/auth-store"

// =============================================================================
// /coupons/add — create a new coupon (system_admin only)
// =============================================================================

type DiscountType = "percentage" | "fixed"

export default function CouponAddPage() {
  const router = useRouter()
  const { isSystemAdmin, loading: authLoading } = useAuth()

  // ----- General -----
  const [code, setCode] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [discountType, setDiscountType] = React.useState<DiscountType>("percentage")
  const [discountValue, setDiscountValue] = React.useState("")

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
    <div className="flex flex-col gap-8">
      <SubNav backHref="/coupons" />

      <div>
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">Add Coupon</h1>
        <p className="mt-2 text-base text-ink-muted">
          All fields except code, type and value are optional. Empty means
          &ldquo;no limit&rdquo;.
        </p>
      </div>

      {submitError && (
        <Banner
          kind="danger"
          title="Couldn't create coupon"
          description={submitError}
          onDismiss={() => setSubmitError(null)}
        />
      )}

      {/* ===== General ===== */}
      <section className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5">
        <div>
          <h2 className="text-sm font-bold text-ink">General</h2>
          <p className="text-xs text-ink-muted">The code patients will type + the discount applied.</p>
        </div>
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
      </section>

      {/* ===== Validity ===== */}
      <section className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5">
        <div>
          <h2 className="text-sm font-bold text-ink">Validity &amp; spend</h2>
          <p className="text-xs text-ink-muted">
            When the coupon is active + the booking-amount range it covers. Leave blank for no limit.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FloatingInput
            id="valid-from"
            label="Valid from"
            value={validFrom}
            onChange={setValidFrom}
            onClear={() => setValidFrom("")}
            type="date"
          />
          <FloatingInput
            id="valid-until"
            label="Valid until"
            value={validUntil}
            onChange={setValidUntil}
            onClear={() => setValidUntil("")}
            type="date"
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
      </section>

      {/* ===== Usage limits ===== */}
      <section className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5">
        <div>
          <h2 className="text-sm font-bold text-ink">Usage limits</h2>
          <p className="text-xs text-ink-muted">
            How many times the code can be redeemed overall and per patient email.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FloatingInput
            id="usage-limit"
            label="Total uses (across all patients)"
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
      </section>

      {/* ===== Allowed emails ===== */}
      <section className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5">
        <div>
          <h2 className="text-sm font-bold text-ink">Allowed emails (optional)</h2>
          <p className="text-xs text-ink-muted">
            Restrict the coupon to specific patient emails. One per line or
            comma-separated. Leave blank for any patient.
          </p>
        </div>
        <textarea
          value={allowedEmailsText}
          onChange={(e) => setAllowedEmailsText(e.target.value)}
          placeholder="patient1@example.com&#10;patient2@example.com"
          rows={4}
          className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-ink focus:border-[var(--client-primary)] focus:outline-none"
          data-testid="coupon-allowed-emails"
        />
      </section>

      <div className="flex flex-col gap-3">
        <Button
          variant="primary"
          size="cta-lg"
          onClick={handleSubmit}
          disabled={submitting}
          data-testid="create-coupon-button"
        >
          {submitting ? "Creating…" : "Create coupon"}
          <ArrowRight className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={() => router.push("/coupons")}
          className="border border-black"
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}
