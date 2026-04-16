import { notFound } from "next/navigation"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import {
  getPayfastConfig,
  getProcessUrl,
  buildPaymentData,
  generateSignature,
  PAYMENT_AMOUNT,
  PAYMENT_ITEM_NAME,
} from "@/lib/payfast"

// =============================================================================
// /pay/[bookingId]
//
// Public redirect page. When a patient clicks the "Pay now via PayFast" link
// in their emailed payment link, this page:
//   1. Looks up the booking via service-role (no auth required — the bookingId
//      itself is the access token; it's UUID-v4 so effectively unguessable)
//   2. Builds the signed PayFast form data server-side (keeps passphrase secret)
//   3. Renders an auto-submitting form targeting PayFast
//
// The form cannot be built client-side because that would leak the PayFast
// passphrase. PayFast's /eng/process endpoint only accepts POST (not GET),
// so we can't ship a plain <a href> link — we need a form.
//
// Auth: NONE. The bookingId is the bearer token. No PII is displayed on the
// page (just "Redirecting..."), and the passphrase never leaves the server.
// =============================================================================

interface PageProps {
  params: Promise<{ bookingId: string }>
}

export default async function PayPage({ params }: PageProps) {
  const { bookingId } = await params

  if (!bookingId || !/^[0-9a-f-]{36}$/i.test(bookingId)) {
    notFound()
  }

  let config
  try {
    config = getPayfastConfig()
  } catch (err) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white p-4 text-center">
        <h1 className="text-xl font-bold text-gray-900">Payment unavailable</h1>
        <p className="mt-2 text-sm text-gray-500">
          {err instanceof Error ? err.message : "Server misconfigured"}
        </p>
      </div>
    )
  }

  const admin = getSupabaseAdmin()
  const { data: booking, error } = await admin
    .from("bookings")
    .select("id, status, first_names, surname, email_address")
    .eq("id", bookingId)
    .single()

  if (error || !booking) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white p-4 text-center">
        <h1 className="text-xl font-bold text-gray-900">Booking not found</h1>
        <p className="mt-2 text-sm text-gray-500">
          This payment link may be invalid or expired.
        </p>
      </div>
    )
  }

  if (booking.status === "Payment Complete" || booking.status === "Successful") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white p-4 text-center">
        <h1 className="text-xl font-bold text-gray-900">Already paid</h1>
        <p className="mt-2 text-sm text-gray-500">
          This booking has already been paid for.
          {" "}Thank you!
        </p>
      </div>
    )
  }

  if (booking.status !== "In Progress") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white p-4 text-center">
        <h1 className="text-xl font-bold text-gray-900">Booking unavailable</h1>
        <p className="mt-2 text-sm text-gray-500">
          This booking&apos;s status is &ldquo;{booking.status}&rdquo; and cannot be paid online.
        </p>
      </div>
    )
  }

  // Build the signed PayFast form data.
  const formData = buildPaymentData(config, {
    bookingId,
    amount: PAYMENT_AMOUNT,
    itemName: PAYMENT_ITEM_NAME,
    buyerFirstName: booking.first_names ?? undefined,
    buyerLastName: booking.surname ?? undefined,
    buyerEmail: booking.email_address ?? undefined,
  })
  const signature = generateSignature(formData, config.passphrase)
  formData.signature = signature

  const paymentUrl = getProcessUrl(config.testMode)

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white p-4 text-center">
      <div className="flex flex-col items-center gap-4">
        <svg className="size-10 animate-spin" viewBox="0 0 40 40" fill="none">
          <circle cx="20" cy="20" r="15" stroke="#d1d5db" strokeWidth="5" strokeLinecap="round" />
          <circle cx="20" cy="20" r="15" stroke="#3ea3db" strokeWidth="5" strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset="70" />
        </svg>
        <h1 className="text-xl font-bold text-gray-900">Redirecting to PayFast...</h1>
        <p className="text-sm text-gray-500">
          If nothing happens in a few seconds, click the button below.
        </p>

        <form
          id="payfast-redirect"
          action={paymentUrl}
          method="POST"
        >
          {Object.entries(formData).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <button
            type="submit"
            className="mt-4 inline-flex h-12 items-center justify-center rounded-xl bg-[#3ea3db] px-8 text-sm font-semibold text-white hover:bg-[#3ea3db]/90"
          >
            Continue to PayFast
          </button>
        </form>
      </div>

      {/* Auto-submit the form on page load. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `setTimeout(function(){document.getElementById('payfast-redirect').submit();}, 300);`,
        }}
      />
    </div>
  )
}
