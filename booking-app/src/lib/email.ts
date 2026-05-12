// =============================================================================
// email.ts
//
// Server-only nodemailer transport for sending transactional emails (e.g. PIN
// reset notifications). Reads SMTP_* env vars at runtime.
//
// IMPORTANT: never import this from client components — nodemailer is a
// Node.js-only library and will break the browser bundle.
// =============================================================================

import nodemailer from "nodemailer"
import { getAppUrl } from "./app-url"

const SMTP_HOST = process.env.SMTP_HOST
const SMTP_PORT = parseInt(process.env.SMTP_PORT ?? "465", 10)
const SMTP_USER = process.env.SMTP_USER
const SMTP_PASS = process.env.SMTP_PASS

/**
 * Escape a user-controlled value for safe inclusion in HTML content.
 * Prevents cross-site scripting in rendered emails — an attacker who
 * controls their own first_names (via patient intake) or email_address
 * could otherwise inject `<script>`, event handlers, or iframes into
 * a nurse's inbox.
 *
 * Always use this for ANY value interpolated into email HTML. Static
 * copy doesn't need it.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/**
 * Escape a value for use inside an HTML attribute (like `href="..."`).
 * Same as escapeHtml but also blocks `javascript:` / `data:` URI schemes
 * that could run script when the recipient clicks the link. Unknown
 * schemes fall back to "#" so nothing executes.
 */
function escapeUrlAttribute(value: string): string {
  const trimmed = value.trim()
  if (!/^https?:\/\//i.test(trimmed) && !/^mailto:/i.test(trimmed)) {
    return "#"
  }
  return escapeHtml(trimmed)
}

let transporter: nodemailer.Transporter | null = null

function getTransporter(): nodemailer.Transporter {
  if (transporter) return transporter

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    throw new Error(
      "Missing SMTP_HOST, SMTP_USER, or SMTP_PASS env vars. " +
        "Add them to .env.local locally and to the Hostinger Environment panel for production."
    )
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // true for 465 (SSL), false for 587 (STARTTLS)
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  })

  return transporter
}

/**
 * Send a PIN reset notification email to a user.
 *
 * Returns `{ sent: true }` on success, `{ sent: false, error: string }` on
 * failure. The caller decides whether to surface the error or fall back to
 * showing the PIN in the admin UI.
 */
export async function sendPinResetEmail({
  to,
  firstName,
  newPin,
  appUrl,
}: {
  to: string
  firstName: string
  newPin: string
  appUrl?: string
}): Promise<{ sent: boolean; error?: string }> {
  // Caller can pass an explicit appUrl, otherwise derive from the
  // app's configured base URL. The old fallback chain tried to use
  // NEXT_PUBLIC_SUPABASE_URL which generated a broken Supabase URL —
  // remove that bad path.
  const url = appUrl || getAppUrl()

  const safeFirstName = escapeHtml(firstName)
  const safePin = escapeHtml(newPin)
  const safeUrlHref = escapeUrlAttribute(url)
  const safeUrlText = escapeHtml(url)

  try {
    const transport = getTransporter()

    await transport.sendMail({
      from: `"CareFirst Booking" <${SMTP_USER}>`,
      to,
      subject: "Your CareFirst access PIN has been reset",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #1a1a1a; margin-bottom: 16px;">Access PIN Reset</h2>
          <p style="color: #4a4a4a; font-size: 15px;">
            Hi ${safeFirstName},
          </p>
          <p style="color: #4a4a4a; font-size: 15px;">
            Your access PIN for the CareFirst Third Party Booking System has been reset by an administrator.
          </p>
          <div style="background: #f4f4f4; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0;">
            <p style="color: #666; font-size: 13px; margin: 0 0 8px 0;">Your new PIN</p>
            <p style="color: #1a1a1a; font-size: 28px; font-weight: bold; letter-spacing: 6px; margin: 0;">
              ${safePin}
            </p>
          </div>
          <p style="color: #4a4a4a; font-size: 15px;">
            Please sign in at <a href="${safeUrlHref}" style="color: #3ea3db;">${safeUrlText}</a> using this PIN.
          </p>
          <p style="color: #999; font-size: 13px; margin-top: 24px;">
            If you did not request this change, please contact your administrator immediately.
          </p>
        </div>
      `,
    })

    return { sent: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("Failed to send PIN reset email:", message)
    return { sent: false, error: message }
  }
}

/**
 * Send a 6-digit PIN reset code to a user who requested self-service
 * PIN reset via /forgot-pin. The code expires in 15 minutes and is
 * single-use — see the /api/auth/reset-pin route for the consumer.
 *
 * The code itself is shown prominently; the email deliberately does NOT
 * contain a clickable link back to the app because the user has to type
 * the code into the same sign-in device for it to work.
 */
export async function sendPinResetCodeEmail({
  to,
  firstName,
  code,
  expiresMinutes,
}: {
  to: string
  firstName: string
  code: string
  expiresMinutes: number
}): Promise<{ sent: boolean; error?: string }> {
  const safeFirstName = escapeHtml(firstName)
  const safeCode = escapeHtml(code)
  const safeMinutes = escapeHtml(String(expiresMinutes))

  try {
    const transport = getTransporter()

    await transport.sendMail({
      from: `"CareFirst Booking" <${SMTP_USER}>`,
      to,
      subject: "Your CareFirst PIN reset code",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #1a1a1a; margin-bottom: 16px;">PIN Reset Code</h2>
          <p style="color: #4a4a4a; font-size: 15px;">
            Hi ${safeFirstName},
          </p>
          <p style="color: #4a4a4a; font-size: 15px;">
            You asked to reset your CareFirst access PIN. Enter the code below on the reset page to choose a new PIN.
          </p>
          <div style="background: #f4f4f4; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
            <p style="color: #666; font-size: 13px; margin: 0 0 8px 0;">Your reset code</p>
            <p style="color: #1a1a1a; font-size: 32px; font-weight: bold; letter-spacing: 8px; margin: 0;">
              ${safeCode}
            </p>
          </div>
          <p style="color: #4a4a4a; font-size: 14px;">
            This code expires in <strong>${safeMinutes} minutes</strong> and can only be used once.
          </p>
          <p style="color: #999; font-size: 13px; margin-top: 24px; border-top: 1px solid #eee; padding-top: 16px;">
            If you didn't request this reset, ignore this email — your existing PIN is unchanged. Contact an administrator if you're concerned someone else is trying to access your account.
          </p>
        </div>
      `,
    })

    return { sent: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("Failed to send PIN reset code email:", message)
    return { sent: false, error: message }
  }
}

/**
 * Send a consultation link email to a patient. Used when the operator
 * chooses "Send link via email" on the Start Consult delivery picker —
 * the CareFirst SSO URL is emailed to the patient so they can join the
 * consultation from a personal device.
 *
 * Returns `{ sent: true }` on success, `{ sent: false, error: string }`
 * on failure. The handoff to CareFirst has already happened by the time
 * this is called; the email is the delivery step only, so a send failure
 * doesn't invalidate the booking — surface it so the operator can fall
 * back to the device-handoff option or copy the link manually.
 */
export async function sendConsultLinkEmail({
  to,
  firstName,
  consultUrl,
}: {
  to: string
  firstName: string
  consultUrl: string
}): Promise<{ sent: boolean; error?: string }> {
  const safeFirstName = escapeHtml(firstName)
  const safeUrlHref = escapeUrlAttribute(consultUrl)
  const safeUrlText = escapeHtml(consultUrl)

  try {
    const transport = getTransporter()

    await transport.sendMail({
      from: `"CareFirst Booking" <${SMTP_USER}>`,
      to,
      subject: "Your CareFirst consultation is ready",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #1a1a1a; margin-bottom: 16px;">Your consultation is ready</h2>
          <p style="color: #4a4a4a; font-size: 15px;">
            Hi ${safeFirstName},
          </p>
          <p style="color: #4a4a4a; font-size: 15px;">
            Your CareFirst consultation has been scheduled and is ready to start.
            Tap the button below from your phone or computer to join.
          </p>
          <div style="text-align: center; margin: 28px 0;">
            <a href="${safeUrlHref}"
               style="display: inline-block; background: #3ea3db; color: white; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 15px;">
              Start Consultation
            </a>
          </div>
          <p style="color: #666; font-size: 13px;">
            Or copy this link into your browser:<br>
            <a href="${safeUrlHref}" style="color: #3ea3db; word-break: break-all;">${safeUrlText}</a>
          </p>
          <p style="color: #4a4a4a; font-size: 14px; margin-top: 24px;">
            Please join as soon as you're able. If you have any questions,
            contact the clinic where you registered.
          </p>
          <p style="color: #999; font-size: 12px; margin-top: 24px; border-top: 1px solid #eee; padding-top: 16px;">
            If you didn&apos;t expect this email, please ignore it — your link won't be used unless you click it.
          </p>
        </div>
      `,
    })

    return { sent: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("Failed to send consult link email:", message)
    return { sent: false, error: message }
  }
}

/**
 * Send a payment link email to a patient. Used when the booking flow's
 * payment-type step selects "Send a payment link" — the patient receives
 * the PayFast checkout URL by email and pays later from any device.
 *
 * Returns `{ sent: true }` on success, `{ sent: false, error: string }` on
 * failure. Caller decides whether to surface errors or retry.
 */
export async function sendPaymentLinkEmail({
  to,
  firstName,
  paymentUrl,
  amount,
  itemName,
}: {
  to: string
  firstName: string
  paymentUrl: string
  amount: string
  itemName: string
}): Promise<{ sent: boolean; error?: string }> {
  const safeFirstName = escapeHtml(firstName)
  const safeItemName = escapeHtml(itemName)
  const safeAmount = escapeHtml(amount)
  const safePaymentUrlHref = escapeUrlAttribute(paymentUrl)
  const safePaymentUrlText = escapeHtml(paymentUrl)

  try {
    const transport = getTransporter()

    await transport.sendMail({
      from: `"CareFirst Booking" <${SMTP_USER}>`,
      to,
      subject: "Your CareFirst booking — payment required",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #1a1a1a; margin-bottom: 16px;">Complete your booking payment</h2>
          <p style="color: #4a4a4a; font-size: 15px;">
            Hi ${safeFirstName},
          </p>
          <p style="color: #4a4a4a; font-size: 15px;">
            Your consultation booking has been created. To confirm it, please complete payment using the secure link below.
          </p>
          <div style="background: #f4f4f4; border-radius: 12px; padding: 20px; margin: 24px 0;">
            <div style="display: flex; justify-content: space-between; font-size: 14px; color: #666; margin-bottom: 8px;">
              <span>${safeItemName}</span>
              <span>R${safeAmount}</span>
            </div>
            <div style="border-top: 1px solid #ddd; padding-top: 8px; display: flex; justify-content: space-between; font-size: 15px; color: #1a1a1a; font-weight: 600;">
              <span>Total</span>
              <span>R${safeAmount}</span>
            </div>
          </div>
          <div style="text-align: center; margin: 28px 0;">
            <a href="${safePaymentUrlHref}"
               style="display: inline-block; background: #3ea3db; color: white; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 15px;">
              Pay now via PayFast
            </a>
          </div>
          <p style="color: #666; font-size: 13px;">
            Or copy this link into your browser:<br>
            <a href="${safePaymentUrlHref}" style="color: #3ea3db; word-break: break-all;">${safePaymentUrlText}</a>
          </p>
          <p style="color: #4a4a4a; font-size: 14px; margin-top: 24px;">
            Your payment is processed securely by PayFast. CareFirst never sees or stores your card details.
          </p>
          <p style="color: #999; font-size: 12px; margin-top: 24px; border-top: 1px solid #eee; padding-top: 16px;">
            If you didn&apos;t request this booking, please ignore this email — no payment will be taken.
          </p>
        </div>
      `,
    })

    return { sent: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("Failed to send payment link email:", message)
    return { sent: false, error: message }
  }
}
