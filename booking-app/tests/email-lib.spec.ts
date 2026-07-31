// =============================================================================
// email-lib.spec.ts — end-to-end coverage for src/lib/email.ts over a real
// in-process SMTP server.
//
// WHY THIS EXISTS (H9 / nodemailer 8 -> 9):
//   The nodemailer major bump to 9.0.3 cleared GHSA-p6gq-j5cr-w38f (message-
//   level `raw` option bypasses disableFileAccess/disableUrlAccess -> arbitrary
//   file read + SSRF). That advisory was never reachable here — all four
//   senders pass only from/to/subject/html — but nothing enforced that, so a
//   future edit could quietly introduce `raw`, `attachments`, or a `list`
//   option and re-open it. These tests pin the message shape.
//
// WHY A PLAYWRIGHT SPEC (not Vitest/Jest):
//   Same rationale as phone-lib.spec.ts — this repo is Playwright-only and we
//   don't introduce a second framework. src/lib/email.ts imports only
//   nodemailer + ./app-url (no React / next/server / Supabase), so it loads
//   unchanged under Playwright's TS loader. Imported via a RELATIVE path
//   because the test context has no Next.js path-alias resolver.
//
//   Unlike phone-lib these aren't pure functions — they open a real SMTP
//   connection. We boot a minimal SMTP server on an ephemeral port and point
//   the module at it, so the assertions cover nodemailer 9's actual client
//   (connect -> EHLO -> AUTH LOGIN -> MAIL/RCPT/DATA), not a mock of it.
//
// WHY beforeAll + require (not a static or dynamic import):
//   email.ts reads SMTP_* into module-level consts at import time and caches a
//   single transporter. The env must therefore be set BEFORE the first load,
//   which rules out a static top-level `import`. It also rules out
//   `await import(...)`: that resolves at runtime through Node's native ESM
//   loader, which cannot parse .ts and fails with "Cannot use import statement
//   outside a module". Playwright's transform hooks `require`, so a deferred
//   require inside beforeAll gets TS compilation AND the load-order control.
//   Serial mode keeps the shared server + captured-message buffer coherent.
//
// HOW TO RUN:
//     cd booking-app
//     npx playwright test email-lib --project=chromium --workers=1
// =============================================================================

import { test, expect } from "@playwright/test"
import net from "node:net"

test.describe.configure({ mode: "serial" })

// -----------------------------------------------------------------------------
// Minimal SMTP server. Speaks just enough of RFC 5321 for nodemailer's client:
// greeting, EHLO, AUTH LOGIN, MAIL FROM, RCPT TO, DATA, QUIT.
//
// STARTTLS is deliberately NOT advertised — the transport is created with
// secure:false (port != 465) and we want the plaintext path so the test needs
// no certificate. That is a test-harness choice only; production runs 465/SSL.
// -----------------------------------------------------------------------------

type Captured = { from: string; rcpt: string[]; data: string }

const received: Captured[] = []

/**
 * Decode a quoted-printable payload back to readable UTF-8.
 *
 * nodemailer QP-encodes the HTML body, which rewrites every "=" as "=3D" and
 * inserts "=\r\n" soft breaks to keep lines under 76 chars. Asserting on the
 * raw wire bytes would therefore mean matching "token=3Dabc123" and guessing
 * where the wrapper landed — brittle against any copy edit. Decode first, then
 * assert on the text the recipient actually sees.
 *
 * Hex escapes are collected as bytes before the UTF-8 decode so multi-byte
 * sequences (e.g. "=E2=80=94" for an em dash) round-trip instead of turning
 * into three mojibake characters.
 */
function decodeQuotedPrintable(input: string): string {
  const withoutSoftBreaks = input.replace(/=\r\n/g, "")
  const bytes: number[] = []
  for (let i = 0; i < withoutSoftBreaks.length; i++) {
    const ch = withoutSoftBreaks[i]
    if (ch === "=" && /^[0-9A-Fa-f]{2}$/.test(withoutSoftBreaks.slice(i + 1, i + 3))) {
      bytes.push(parseInt(withoutSoftBreaks.slice(i + 1, i + 3), 16))
      i += 2
    } else {
      bytes.push(ch.charCodeAt(0))
    }
  }
  return Buffer.from(bytes).toString("utf8")
}

/**
 * Decode RFC 2047 encoded-words in a header, e.g.
 *   =?UTF-8?B?WW91ciBDYXJlRmlyc3QgYm9va2luZyDigJQgcGF5bWVudA==?=
 *   =?UTF-8?Q?Your_CareFirst_booking_=E2=80=94_payment?=
 *
 * Both forms are handled because nodemailer picks B or Q per subject based on
 * how much of it is non-ASCII — the payment subject's em dash lands on B while
 * others stay plain, so assuming one form silently breaks on the other.
 *
 * Long headers get folded into several encoded-words joined by CRLF + space;
 * that separator is stitched back up first so the decoded text is contiguous.
 */
function decodeEncodedWords(input: string): string {
  const unfolded = input.replace(/\?=(?:\r\n)?[ \t]+=\?/g, "?==?")
  return unfolded.replace(
    /=\?[A-Za-z0-9-]+\?([QqBb])\?([\s\S]*?)\?=/g,
    (_, encoding: string, payload: string) =>
      encoding.toUpperCase() === "B"
        ? Buffer.from(payload, "base64").toString("utf8")
        : decodeQuotedPrintable(payload.replace(/_/g, " "))
  )
}

function startSmtpServer(): Promise<{ port: number; close: () => Promise<void> }> {
  const server = net.createServer((socket) => {
    let buffer = ""
    let inData = false
    let dataLines: string[] = []
    let expecting: "none" | "auth-user" | "auth-pass" = "none"
    let mailFrom = ""
    let rcptTo: string[] = []

    const send = (line: string) => socket.write(line + "\r\n")
    send("220 localhost ESMTP test")

    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8")

      let idx: number
      while ((idx = buffer.indexOf("\r\n")) !== -1) {
        const line = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)

        if (inData) {
          if (line === ".") {
            inData = false
            received.push({
              from: mailFrom,
              rcpt: [...rcptTo],
              data: dataLines.join("\r\n"),
            })
            dataLines = []
            mailFrom = ""
            rcptTo = []
            send("250 2.0.0 Ok: queued")
          } else {
            // Undo dot-stuffing so assertions see the original body.
            dataLines.push(line.startsWith("..") ? line.slice(1) : line)
          }
          continue
        }

        if (expecting === "auth-user") {
          expecting = "auth-pass"
          send("334 UGFzc3dvcmQ6")
          continue
        }
        if (expecting === "auth-pass") {
          expecting = "none"
          send("235 2.7.0 Accepted")
          continue
        }

        const upper = line.toUpperCase()
        if (upper.startsWith("EHLO") || upper.startsWith("HELO")) {
          send("250-localhost")
          send("250 AUTH LOGIN PLAIN")
        } else if (upper.startsWith("AUTH LOGIN")) {
          expecting = "auth-user"
          send("334 VXNlcm5hbWU6")
        } else if (upper.startsWith("AUTH PLAIN")) {
          send("235 2.7.0 Accepted")
        } else if (upper.startsWith("MAIL FROM")) {
          mailFrom = line.slice(line.indexOf(":") + 1).trim()
          send("250 2.1.0 Ok")
        } else if (upper.startsWith("RCPT TO")) {
          rcptTo.push(line.slice(line.indexOf(":") + 1).trim())
          send("250 2.1.5 Ok")
        } else if (upper.startsWith("DATA")) {
          inData = true
          send("354 End data with <CR><LF>.<CR><LF>")
        } else if (upper.startsWith("QUIT")) {
          send("221 2.0.0 Bye")
          socket.end()
        } else {
          send("250 2.0.0 Ok")
        }
      }
    })

    // A client that hangs up mid-session is normal here; don't crash the run.
    socket.on("error", () => undefined)
  })

  return new Promise((resolve, reject) => {
    server.once("error", reject)
    // Port 0 = let the OS pick a free one, so the suite never collides with
    // the fixed-port CareFirst (4747) / PayFast (4748) mocks or a stray daemon.
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address()
      if (addr === null || typeof addr === "string") {
        reject(new Error("SMTP server did not bind to a TCP port"))
        return
      }
      resolve({
        port: addr.port,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done())
          }),
      })
    })
  })
}

// Module namespace of src/lib/email.ts, imported after env is in place.
type EmailModule = typeof import("../src/lib/email")

let smtp: { port: number; close: () => Promise<void> }
let email: EmailModule

const SENDER = "bookings-test@carefirst.co.za"

test.beforeAll(async () => {
  smtp = await startSmtpServer()

  process.env.SMTP_HOST = "127.0.0.1"
  process.env.SMTP_PORT = String(smtp.port)
  process.env.SMTP_USER = SENDER
  process.env.SMTP_PASS = "test-password"
  process.env.NEXT_PUBLIC_APP_URL = "https://bookings.carefirst.co.za"

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  email = require("../src/lib/email") as EmailModule
})

test.afterAll(async () => {
  await smtp?.close()
})

test.beforeEach(() => {
  received.length = 0
})

/**
 * The single message captured by the SMTP server, or a clear failure.
 *
 * `data` is the untouched wire form — use it for header-shape assertions
 * (Content-Type, absence of attachments or List- headers). `text` is decoded
 * — use it for anything about content the recipient actually reads.
 */
function onlyMessage(): Captured & { text: string } {
  expect(received).toHaveLength(1)
  const msg = received[0]

  // Headers and body use different encodings (RFC 2047 encoded-words vs
  // quoted-printable), so split at the blank line and decode each with the
  // right one rather than running both over the whole message.
  const split = msg.data.indexOf("\r\n\r\n")
  const headers = split === -1 ? msg.data : msg.data.slice(0, split)
  const body = split === -1 ? "" : msg.data.slice(split + 4)

  return {
    ...msg,
    text: `${decodeEncodedWords(headers)}\r\n\r\n${decodeQuotedPrintable(body)}`,
  }
}

// =============================================================================
// Delivery — each sender reaches a real SMTP dialogue under nodemailer 9.
// =============================================================================

test("sendPinResetEmail delivers over SMTP and reports sent:true", async () => {
  // ----- Act ----------------------------------------------------------------
  const result = await email.sendPinResetEmail({
    to: "nurse@example.com",
    firstName: "Thandi",
    newPin: "482913",
  })

  // ----- Assert -------------------------------------------------------------
  expect(result).toEqual({ sent: true })

  const msg = onlyMessage()
  expect(msg.from).toBe(`<${SENDER}>`)
  expect(msg.rcpt).toEqual(["<nurse@example.com>"])
  expect(msg.text).toContain("Your CareFirst access PIN has been reset")
  expect(msg.text).toContain("Thandi")
  expect(msg.text).toContain("482913")
})

test("sendPinResetCodeEmail delivers the code and expiry window", async () => {
  // ----- Act ----------------------------------------------------------------
  const result = await email.sendPinResetCodeEmail({
    to: "nurse@example.com",
    firstName: "Thandi",
    code: "551204",
    expiresMinutes: 15,
  })

  // ----- Assert -------------------------------------------------------------
  expect(result).toEqual({ sent: true })

  const msg = onlyMessage()
  expect(msg.text).toContain("Your CareFirst PIN reset code")
  expect(msg.text).toContain("551204")
  expect(msg.text).toContain("15 minutes")
})

test("sendConsultLinkEmail delivers the CareFirst SSO URL", async () => {
  // ----- Act ----------------------------------------------------------------
  const result = await email.sendConsultLinkEmail({
    to: "patient@example.com",
    firstName: "Sipho",
    consultUrl: "https://carefirst.example/sso?token=abc123",
  })

  // ----- Assert -------------------------------------------------------------
  expect(result).toEqual({ sent: true })

  const msg = onlyMessage()
  expect(msg.rcpt).toEqual(["<patient@example.com>"])
  expect(msg.text).toContain("Your CareFirst consultation is ready")
  expect(msg.text).toContain("token=abc123")
})

test("sendPaymentLinkEmail delivers the PayFast URL and amount", async () => {
  // ----- Act ----------------------------------------------------------------
  const result = await email.sendPaymentLinkEmail({
    to: "patient@example.com",
    firstName: "Sipho",
    paymentUrl: "https://sandbox.payfast.co.za/eng/process?m=1",
    amount: "450.00",
    itemName: "GP Consultation",
  })

  // ----- Assert -------------------------------------------------------------
  expect(result).toEqual({ sent: true })

  const msg = onlyMessage()
  // The subject carries an em dash, so it arrives RFC 2047 encoded — asserting
  // on the decoded text also proves that round-trips correctly.
  expect(msg.text).toContain("Your CareFirst booking — payment required")
  expect(msg.text).toContain("Complete your booking payment")
  expect(msg.text).toContain("450.00")
  expect(msg.text).toContain("GP Consultation")
})

// =============================================================================
// H9 regression guard — the advisory's preconditions must stay absent.
//
// GHSA-p6gq-j5cr-w38f needs a message-level `raw` option; the related List-*
// CRLF issue needs a `list` option. Neither is used, and the delivered message
// must stay a single text/html part with no attachment or List-* headers. If
// someone adds one of those, these fail rather than silently re-opening the
// class of bug the 9.0.3 bump closed.
// =============================================================================

test("delivered message carries no attachment, List-* header, or raw passthrough", async () => {
  // ----- Act ----------------------------------------------------------------
  await email.sendPaymentLinkEmail({
    to: "patient@example.com",
    firstName: "Sipho",
    paymentUrl: "https://sandbox.payfast.co.za/eng/process?m=1",
    amount: "450.00",
    itemName: "GP Consultation",
  })

  // ----- Assert -------------------------------------------------------------
  const msg = onlyMessage()
  expect(msg.data).toContain("Content-Type: text/html")
  expect(msg.data).not.toContain("Content-Disposition: attachment")
  expect(msg.data).not.toContain("multipart/mixed")
  expect(msg.data.toLowerCase()).not.toContain("\r\nlist-")
})

// =============================================================================
// Escaping — escapeHtml / escapeUrlAttribute are not exported, so they're
// covered through the senders, which is where a regression would actually bite.
// =============================================================================

test("attacker-controlled first name is HTML-escaped, not injected", async () => {
  // ----- Act ----------------------------------------------------------------
  await email.sendPinResetEmail({
    to: "nurse@example.com",
    firstName: '<script>alert("xss")</script>',
    newPin: "482913",
  })

  // ----- Assert -------------------------------------------------------------
  const msg = onlyMessage()
  expect(msg.text).not.toContain("<script>")
  expect(msg.text).toContain("&lt;script&gt;")
})

test("non-http consult URL is neutralised to # rather than emitted as a scheme", async () => {
  // ----- Act ----------------------------------------------------------------
  await email.sendConsultLinkEmail({
    to: "patient@example.com",
    firstName: "Sipho",
    consultUrl: 'javascript:alert("xss")',
  })

  // ----- Assert -------------------------------------------------------------
  const msg = onlyMessage()
  expect(msg.text).toContain('href="#"')
  expect(msg.text).not.toContain('href="javascript:')
})

// =============================================================================
// Failure path — callers branch on { sent: false }, so it must not throw.
// =============================================================================

test("send failure resolves to sent:false with an error instead of throwing", async () => {
  // ----- Arrange ------------------------------------------------------------
  // Drop the SMTP server so the next connect attempt is refused.
  await smtp.close()

  // ----- Act ----------------------------------------------------------------
  const result = await email.sendPinResetEmail({
    to: "nurse@example.com",
    firstName: "Thandi",
    newPin: "482913",
  })

  // ----- Assert -------------------------------------------------------------
  expect(result.sent).toBe(false)
  expect(result.error).toBeTruthy()
})
