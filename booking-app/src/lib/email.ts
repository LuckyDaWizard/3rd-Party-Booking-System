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

const SMTP_HOST = process.env.SMTP_HOST
const SMTP_PORT = parseInt(process.env.SMTP_PORT ?? "465", 10)
const SMTP_USER = process.env.SMTP_USER
const SMTP_PASS = process.env.SMTP_PASS

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
  const url = appUrl || process.env.NEXT_PUBLIC_SUPABASE_URL?.replace("supabase.co", "") || "http://187.127.135.11:3000"

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
            Hi ${firstName},
          </p>
          <p style="color: #4a4a4a; font-size: 15px;">
            Your access PIN for the CareFirst Third Party Booking System has been reset by an administrator.
          </p>
          <div style="background: #f4f4f4; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0;">
            <p style="color: #666; font-size: 13px; margin: 0 0 8px 0;">Your new PIN</p>
            <p style="color: #1a1a1a; font-size: 28px; font-weight: bold; letter-spacing: 6px; margin: 0;">
              ${newPin}
            </p>
          </div>
          <p style="color: #4a4a4a; font-size: 15px;">
            Please sign in at <a href="${url}" style="color: #3ea3db;">${url}</a> using this PIN.
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
