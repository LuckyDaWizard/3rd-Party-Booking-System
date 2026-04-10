// =============================================================================
// payfast.ts
//
// Server-side PayFast utilities: signature generation, ITN validation, URLs.
//
// IMPORTANT: server-only. Never import from "use client" components.
// The passphrase and merchant key must never reach the browser.
// =============================================================================

import crypto from "crypto"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SANDBOX_PROCESS_URL = "https://sandbox.payfast.co.za/eng/process"
const PRODUCTION_PROCESS_URL = "https://www.payfast.co.za/eng/process"

const SANDBOX_VALIDATE_URL = "https://sandbox.payfast.co.za/eng/query/validate"
const PRODUCTION_VALIDATE_URL = "https://www.payfast.co.za/eng/query/validate"

/** PayFast hostnames whose IPs are valid ITN sources. */
const PAYFAST_HOSTS = [
  "www.payfast.co.za",
  "sandbox.payfast.co.za",
  "w1w.payfast.co.za",
  "w2w.payfast.co.za",
]

/** Fixed booking consultation fee. */
export const PAYMENT_AMOUNT = "325.00"

export const PAYMENT_ITEM_NAME = "CareFirst Consultation Booking"

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

export interface PayfastConfig {
  merchantId: string
  merchantKey: string
  passphrase: string
  testMode: boolean
  appUrl: string
}

export function getPayfastConfig(): PayfastConfig {
  const merchantId = process.env.PAYFAST_MERCHANT_ID
  const merchantKey = process.env.PAYFAST_MERCHANT_KEY
  const passphrase = process.env.PAYFAST_PASSPHRASE
  const testMode = process.env.PAYFAST_TEST_MODE === "true"
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://187.127.135.11:3000"

  if (!merchantId || !merchantKey || !passphrase) {
    throw new Error(
      "Missing PayFast env vars. Set PAYFAST_MERCHANT_ID, PAYFAST_MERCHANT_KEY, PAYFAST_PASSPHRASE."
    )
  }

  return { merchantId, merchantKey, passphrase, testMode, appUrl }
}

export function getProcessUrl(testMode: boolean): string {
  return testMode ? SANDBOX_PROCESS_URL : PRODUCTION_PROCESS_URL
}

export function getValidateUrl(testMode: boolean): string {
  return testMode ? SANDBOX_VALIDATE_URL : PRODUCTION_VALIDATE_URL
}

// ---------------------------------------------------------------------------
// Signature generation
// ---------------------------------------------------------------------------

/**
 * Generate an MD5 signature for PayFast form data.
 * Fields must be passed in the correct PayFast-specified order.
 * Empty values are excluded from the signature string.
 */
export function generateSignature(
  data: Record<string, string>,
  passphrase?: string
): string {
  const params = Object.entries(data)
    .filter(([, v]) => v !== "")
    .map(
      ([k, v]) =>
        `${k}=${encodeURIComponent(v.trim()).replace(/%20/g, "+")}`
    )
    .join("&")

  const signatureString = passphrase
    ? `${params}&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, "+")}`
    : params

  return crypto.createHash("md5").update(signatureString).digest("hex")
}

// ---------------------------------------------------------------------------
// Build payment form data
// ---------------------------------------------------------------------------

export interface PaymentInitData {
  bookingId: string
  amount: string
  itemName: string
  buyerFirstName?: string
  buyerLastName?: string
  buyerEmail?: string
}

/**
 * Build the ordered PayFast form field object ready for signature + submission.
 */
export function buildPaymentData(
  config: PayfastConfig,
  payment: PaymentInitData
): Record<string, string> {
  const { merchantId, merchantKey, appUrl } = config

  // Fields MUST be in PayFast's required order.
  const data: Record<string, string> = {}

  // Merchant details
  data.merchant_id = merchantId
  data.merchant_key = merchantKey

  // URLs
  data.return_url = `${appUrl}/create-booking/payment/success?bookingId=${payment.bookingId}`
  data.cancel_url = `${appUrl}/create-booking/payment/failed?bookingId=${payment.bookingId}`
  data.notify_url = `${appUrl}/api/payfast/notify`

  // Buyer info (optional but helpful)
  if (payment.buyerFirstName) data.name_first = payment.buyerFirstName
  if (payment.buyerLastName) data.name_last = payment.buyerLastName
  if (payment.buyerEmail) data.email_address = payment.buyerEmail

  // Transaction details
  data.m_payment_id = payment.bookingId
  data.amount = payment.amount
  data.item_name = payment.itemName

  return data
}

// ---------------------------------------------------------------------------
// ITN (Instant Transaction Notification) validation
// ---------------------------------------------------------------------------

/**
 * Step 1: Validate the ITN signature.
 * Recompute the signature from the POST fields (excluding 'signature')
 * and compare with the received signature.
 */
export function validateItnSignature(
  postData: Record<string, string>,
  passphrase?: string
): boolean {
  const receivedSignature = postData.signature
  if (!receivedSignature) return false

  // Build data without the signature field, preserving order
  const dataWithoutSig: Record<string, string> = {}
  for (const [key, value] of Object.entries(postData)) {
    if (key !== "signature") {
      dataWithoutSig[key] = value
    }
  }

  const computed = generateSignature(dataWithoutSig, passphrase)
  return computed === receivedSignature
}

/**
 * Step 2: Validate the source IP against known PayFast IPs.
 * Resolves PayFast hostnames and checks if the request IP matches.
 */
export async function validateItnSourceIp(ip: string): Promise<boolean> {
  // In sandbox/dev, skip IP validation if the IP is localhost or private
  if (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.startsWith("10.") ||
    ip.startsWith("172.") ||
    ip.startsWith("192.168.")
  ) {
    return true
  }

  try {
    const dns = await import("dns")
    const { promisify } = await import("util")
    const resolve4 = promisify(dns.resolve4)

    const validIps = new Set<string>()
    for (const host of PAYFAST_HOSTS) {
      try {
        const ips = await resolve4(host)
        for (const resolvedIp of ips) {
          validIps.add(resolvedIp)
        }
      } catch {
        // DNS resolution can fail — continue with other hosts
      }
    }

    return validIps.has(ip)
  } catch {
    // If DNS module is unavailable, allow (log warning)
    console.warn("Could not validate ITN source IP — DNS unavailable")
    return true
  }
}

/**
 * Step 3: Validate the payment amount matches what we expect.
 */
export function validateItnAmount(
  receivedAmount: string,
  expectedAmount: string
): boolean {
  const received = parseFloat(receivedAmount)
  const expected = parseFloat(expectedAmount)
  return Math.abs(received - expected) < 0.01
}

/**
 * Step 4: Server confirmation — POST back to PayFast to verify the ITN.
 */
export async function validateItnServerConfirmation(
  postData: Record<string, string>,
  testMode: boolean
): Promise<boolean> {
  const validateUrl = getValidateUrl(testMode)

  // Build the parameter string (excluding signature)
  const params = Object.entries(postData)
    .filter(([key]) => key !== "signature")
    .map(
      ([k, v]) =>
        `${k}=${encodeURIComponent(v.trim()).replace(/%20/g, "+")}`
    )
    .join("&")

  try {
    const res = await fetch(validateUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    })

    const text = await res.text()
    return text.trim() === "VALID"
  } catch (err) {
    console.error("PayFast server confirmation failed:", err)
    return false
  }
}
