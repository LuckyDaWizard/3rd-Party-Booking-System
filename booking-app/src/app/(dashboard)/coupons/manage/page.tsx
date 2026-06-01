"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowRight, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SubNav } from "@/components/ui/sub-nav"
import { FloatingInput } from "@/components/ui/floating-input"
import { FloatingSelect } from "@/components/ui/floating-select"
import { Banner } from "@/components/ui/banner"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useAuth } from "@/lib/auth-store"

// =============================================================================
// /coupons/manage?id=… — edit / disable / delete a coupon (system_admin only)
// =============================================================================

type DiscountType = "percentage" | "fixed"
type Status = "active" | "disabled"

interface Coupon {
  id: string
  code: string
  description: string | null
  discount_type: DiscountType
  discount_value: number
  valid_from: string | null
  valid_until: string | null
  min_spend: number | null
  max_spend: number | null
  usage_limit: number | null
  usage_limit_per_email: number | null
  allowed_emails: string[] | null
  status: Status
}

interface CouponUse {
  id: string
  booking_id: string
  patient_email: string
  original_amount: number
  discount_amount: number
  final_amount: number
  applied_at: string
}

// ISO timestamp → 'YYYY-MM-DD' for a <input type="date">.
function toDateInput(iso: string | null): string {
  if (!iso) return ""
  return iso.slice(0, 10)
}

export default function CouponManagePage() {
  const router = useRouter()
  const search = useSearchParams()
  const id = search.get("id")
  const { isSystemAdmin, loading: authLoading } = useAuth()

  const [coupon, setCoupon] = React.useState<Coupon | null>(null)
  const [uses, setUses] = React.useState<CouponUse[]>([])
  const [usedCount, setUsedCount] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<string | null>(null)

  // Form state (mirrors Add page)
  const [code, setCode] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [discountType, setDiscountType] = React.useState<DiscountType>("percentage")
  const [discountValue, setDiscountValue] = React.useState("")
  const [validFrom, setValidFrom] = React.useState("")
  const [validUntil, setValidUntil] = React.useState("")
  const [minSpend, setMinSpend] = React.useState("")
  const [maxSpend, setMaxSpend] = React.useState("")
  const [usageLimit, setUsageLimit] = React.useState("")
  const [usageLimitPerEmail, setUsageLimitPerEmail] = React.useState("")
  const [allowedEmailsText, setAllowedEmailsText] = React.useState("")
  const [status, setStatus] = React.useState<Status>("active")

  const [saving, setSaving] = React.useState(false)
  const [saveError, setSaveError] = React.useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({})

  React.useEffect(() => {
    if (!authLoading && !isSystemAdmin) router.replace("/home")
  }, [authLoading, isSystemAdmin, router])

  React.useEffect(() => {
    if (!id) return
    let cancelled = false
    async function load() {
      setLoading(true)
      setLoadError(null)
      try {
        const res = await fetch(`/api/admin/coupons/${id}`, { cache: "no-store" })
        const data = (await res.json().catch(() => ({}))) as {
          data?: Coupon
          uses?: CouponUse[]
          usedCount?: number
          error?: string
        }
        if (cancelled) return
        if (!res.ok || !data.data) throw new Error(data.error ?? "Coupon not found")
        const c = data.data
        setCoupon(c)
        setUses(data.uses ?? [])
        setUsedCount(data.usedCount ?? 0)
        setCode(c.code)
        setDescription(c.description ?? "")
        setDiscountType(c.discount_type)
        setDiscountValue(String(c.discount_value))
        setValidFrom(toDateInput(c.valid_from))
        setValidUntil(toDateInput(c.valid_until))
        setMinSpend(c.min_spend !== null ? String(c.min_spend) : "")
        setMaxSpend(c.max_spend !== null ? String(c.max_spend) : "")
        setUsageLimit(c.usage_limit !== null ? String(c.usage_limit) : "")
        setUsageLimitPerEmail(
          c.usage_limit_per_email !== null ? String(c.usage_limit_per_email) : ""
        )
        setAllowedEmailsText((c.allowed_emails ?? []).join("\n"))
        setStatus(c.status)
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Couldn't load coupon")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [id])

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

  async function handleSave() {
    if (!id) return
    setSaveError(null)
    const err = validate()
    if (err) { setSaveError(err); return }
    setSaving(true)
    const allowedEmails = allowedEmailsText
      .split(/[,\n;]/)
      .map((e) => e.trim())
      .filter((e) => e.length > 0)
    try {
      const res = await fetch(`/api/admin/coupons/${id}`, {
        method: "PATCH",
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
          status,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        data?: Coupon
        error?: string
      }
      if (!res.ok) {
        setSaveError(data.error ?? "Failed to save")
        setSaving(false)
        return
      }
      router.push("/coupons")
    } catch (err2) {
      setSaveError(err2 instanceof Error ? err2.message : "Failed to save")
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!id || !coupon) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/coupons/${id}`, { method: "DELETE" })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setSaveError(data.error ?? "Failed to delete")
        setDeleting(false)
        setDeleteOpen(false)
        return
      }
      router.push(`/coupons?deleted=${encodeURIComponent(coupon.code)}`)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to delete")
      setDeleting(false)
      setDeleteOpen(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <SubNav backHref="/coupons" />
        <div className="flex h-24 items-center justify-center rounded-xl bg-white text-gray-400">
          Loading…
        </div>
      </div>
    )
  }

  if (loadError || !coupon) {
    return (
      <div className="flex flex-col gap-6">
        <SubNav backHref="/coupons" />
        <Banner
          kind="danger"
          title="Couldn't load coupon"
          description={loadError ?? "Coupon not found"}
        />
      </div>
    )
  }

  const canHardDelete = usedCount === 0

  return (
    <div className="flex flex-col gap-8">
      <SubNav backHref="/coupons" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink sm:text-3xl">
            Manage <span className="font-mono">{coupon.code}</span>
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            Used <strong>{usedCount}</strong> {usedCount === 1 ? "time" : "times"}.
            {coupon.usage_limit !== null && (
              <> Overall limit: <strong>{coupon.usage_limit}</strong>.</>
            )}
          </p>
        </div>
        <FloatingSelect
          id="coupon-status"
          label="Status"
          value={status}
          onChange={(v) => setStatus(v as Status)}
          options={[
            { value: "active", label: "Active" },
            { value: "disabled", label: "Disabled" },
          ]}
          className="w-48"
        />
      </div>

      {saveError && (
        <Banner
          kind="danger"
          title="Couldn't save"
          description={saveError}
          onDismiss={() => setSaveError(null)}
        />
      )}

      <section className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5">
        <div>
          <h2 className="text-sm font-bold text-ink">General</h2>
        </div>
        <FloatingInput
          id="code"
          label="Code"
          value={code}
          onChange={setCode}
          onClear={() => setCode("")}
          error={fieldErrors.code}
        />
        <FloatingInput
          id="description"
          label="Description (internal)"
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
          />
          <FloatingInput
            id="discount-value"
            label={discountType === "percentage" ? "Discount %" : "Discount amount (R)"}
            value={discountValue}
            onChange={setDiscountValue}
            onClear={() => setDiscountValue("")}
            type="number"
            error={fieldErrors.discountValue}
          />
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-bold text-ink">Validity &amp; spend</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FloatingInput id="valid-from" label="Valid from" value={validFrom} onChange={setValidFrom} onClear={() => setValidFrom("")} type="date" />
          <FloatingInput id="valid-until" label="Valid until" value={validUntil} onChange={setValidUntil} onClear={() => setValidUntil("")} type="date" />
          <FloatingInput id="min-spend" label="Min spend (R)" value={minSpend} onChange={setMinSpend} onClear={() => setMinSpend("")} type="number" />
          <FloatingInput id="max-spend" label="Max spend (R)" value={maxSpend} onChange={setMaxSpend} onClear={() => setMaxSpend("")} type="number" />
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-bold text-ink">Usage limits</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FloatingInput id="usage-limit" label="Total uses" value={usageLimit} onChange={setUsageLimit} onClear={() => setUsageLimit("")} type="number" />
          <FloatingInput id="usage-limit-per-email" label="Uses per patient email" value={usageLimitPerEmail} onChange={setUsageLimitPerEmail} onClear={() => setUsageLimitPerEmail("")} type="number" />
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-bold text-ink">Allowed emails</h2>
        <textarea
          value={allowedEmailsText}
          onChange={(e) => setAllowedEmailsText(e.target.value)}
          placeholder="patient1@example.com&#10;patient2@example.com"
          rows={4}
          className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-ink focus:border-[var(--client-primary)] focus:outline-none"
        />
      </section>

      {uses.length > 0 && (
        <section className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-5">
          <div>
            <h2 className="text-sm font-bold text-ink">Recent uses</h2>
            <p className="text-xs text-ink-muted">Latest 50 applications of this coupon.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="py-2 pr-3 text-left">Applied</th>
                  <th className="py-2 pr-3 text-left">Patient email</th>
                  <th className="py-2 pr-3 text-right">Original</th>
                  <th className="py-2 pr-3 text-right">Discount</th>
                  <th className="py-2 pr-3 text-right">Final</th>
                </tr>
              </thead>
              <tbody>
                {uses.map((u) => (
                  <tr key={u.id} className="border-t border-gray-100">
                    <td className="py-2 pr-3 text-ink-muted">
                      {new Date(u.applied_at).toLocaleString("en-ZA")}
                    </td>
                    <td className="py-2 pr-3 text-ink">{u.patient_email}</td>
                    <td className="py-2 pr-3 text-right text-ink-muted">
                      R{Number(u.original_amount).toFixed(2)}
                    </td>
                    <td className="py-2 pr-3 text-right text-emerald-700">
                      -R{Number(u.discount_amount).toFixed(2)}
                    </td>
                    <td className="py-2 pr-3 text-right font-semibold text-ink">
                      R{Number(u.final_amount).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="flex flex-col gap-3">
        <Button
          variant="primary"
          size="cta-lg"
          onClick={handleSave}
          disabled={saving}
          data-testid="save-coupon-button"
        >
          {saving ? "Saving…" : "Save changes"}
          <ArrowRight className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={() => setDeleteOpen(true)}
          className="border border-red-300 text-red-700 hover:bg-red-50"
        >
          <Trash2 className="mr-2 size-4" />
          {canHardDelete ? "Delete coupon" : "Delete coupon (unavailable)"}
        </Button>
        {!canHardDelete && (
          <p className="text-center text-xs text-ink-muted">
            This coupon has been used. Toggle status to <em>Disabled</em> above instead
            &mdash; deleting would break the audit trail.
          </p>
        )}
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this coupon?"
        description={
          canHardDelete
            ? `"${coupon.code}" will be permanently removed. This cannot be undone.`
            : "This coupon has been used and can't be deleted. Set status to Disabled instead."
        }
        confirmLabel={canHardDelete ? "Delete coupon" : "OK"}
        confirmLoadingLabel={canHardDelete ? "Deleting…" : undefined}
        confirmPending={deleting}
        onConfirm={canHardDelete ? handleDelete : () => setDeleteOpen(false)}
      />
    </div>
  )
}
