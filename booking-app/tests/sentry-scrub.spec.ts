import { test, expect } from "@playwright/test"
import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs"
import type { StreamedSpanJSON } from "@sentry/core"
import {
  redactText,
  scrubBreadcrumb,
  scrubEvent,
  scrubSpan,
} from "../src/lib/sentry-shared"

// POPIA regression coverage for the Sentry scrubbers (src/lib/sentry-shared.ts).
// Pure functions — no browser or dev server needed.

const PII = [
  "jane.test@example.com",
  "pin-123456@carefirst.local",
  "8001015009087",
  "+27821234567",
  "+27 82 123 4567",
  "082 123 4567",
  "0821234567",
]

function assertNoPii(value: unknown) {
  const json = JSON.stringify(value)
  for (const p of PII) expect(json, `leaked "${p}"`).not.toContain(p)
  expect(json).not.toContain("eq.")
}

test.describe("Sentry POPIA scrubbing", () => {
  test("redactText masks emails, SA IDs, phones and labelled PINs/codes", () => {
    const out = redactText(
      "jane.test@example.com id 8001015009087 tel +27 82 123 4567 / 082 123 4567 pin 123456 code: 654321 pin-123456@carefirst.local"
    )
    expect(out).toBe(
      "[email] id [id-number] tel [phone] / [phone] pin [redacted] code: [redacted] [email]"
    )
  })

  test("redactText catches the other SA phone and ID layouts", () => {
    expect(
      redactText("27821234567 | (082) 123 4567 | 082 123 45 67 | 011-123-4567 | 800101 5009 087")
    ).toBe("[phone] | [phone] | [phone] | [phone] | [id-number]")
  })

  test("baseSentryOptions turns off all SDK-side data collection", async () => {
    const { baseSentryOptions } = await import("../src/lib/sentry-shared")
    const dc = baseSentryOptions.dataCollection
    expect(dc.httpBodies).toEqual([])
    expect(dc.cookies).toBe(false)
    expect(dc.userInfo).toBe(false)
    expect(dc.urlQueryParams).toBe(false)
    expect(dc.stackFrameVariables).toBe(false)
    expect(baseSentryOptions).not.toHaveProperty("sendDefaultPii")
  })

  test("ui.click breadcrumb loses name-bearing attribute selectors", () => {
    const crumb = scrubBreadcrumb({
      category: "ui.click",
      message: 'div.row > button.icon[title="Edit Jane Test"] > img[alt="Jane Test avatar"]',
    } as Breadcrumb)
    expect(crumb?.message).toBe("div.row > button.icon > img")
  })

  test("redactText leaves ordinary text and UUIDs alone", () => {
    const s = "Booking 3f2b1c9e-8d4a-4f6b-9c1d-2e3f4a5b6c7d moved to Payment Complete (HTTP 503)"
    expect(redactText(s)).toBe(s)
  })

  test("fetch breadcrumb loses the Supabase query string", () => {
    const crumb = scrubBreadcrumb({
      category: "fetch",
      data: {
        method: "GET",
        url: "https://x.supabase.co/rest/v1/bookings?select=*&email=eq.jane.test@example.com&id_number=eq.8001015009087",
        status_code: 200,
        "http.query": "?email=eq.jane.test@example.com",
      },
    } as Breadcrumb)
    expect(crumb?.data?.url).toBe("https://x.supabase.co/rest/v1/bookings")
    assertNoPii(crumb)
  })

  test("console breadcrumb keeps a redacted message and drops raw arguments", () => {
    const crumb = scrubBreadcrumb({
      category: "console",
      message: "[forgot-pin] Lookup error for jane.test@example.com",
      data: { arguments: [{ patient: "Jane Test", phone: "0821234567" }] },
    } as Breadcrumb)
    expect(crumb?.data).toBeUndefined()
    expect(crumb?.message).toBe("[forgot-pin] Lookup error for [email]")
  })

  test("error event: request body/cookies/query/headers stripped, user reduced to id+role", () => {
    const event = scrubEvent({
      type: undefined,
      message: "duplicate key (email)=(jane.test@example.com)",
      exception: { values: [{ type: "Error", value: "CareFirst rejected 8001015009087" }] },
      request: {
        url: "https://bookings.carefirst.co.za/patient-details?id=8001015009087",
        query_string: "id=8001015009087",
        data: { contact_number: "+27821234567" },
        cookies: { "sb-access-token": "secret" },
        headers: { cookie: "sb=1", authorization: "Bearer x", "user-agent": "UA", "x-csrf-token": "t" },
      },
      extra: { note: "call 082 123 4567" },
      contexts: { nextjs: { request_path: "/api/bookings?email=eq.jane.test@example.com", route_type: "route" } },
      user: { id: "u1", role: "user", email: "jane.test@example.com", username: "Jane" } as never,
      breadcrumbs: [{ category: "xhr", data: { url: "/rest/v1/users?email=eq.jane.test@example.com" } }],
    } as ErrorEvent)!

    expect(event.request?.url).toBe("https://bookings.carefirst.co.za/patient-details")
    expect(event.request?.data).toBeUndefined()
    expect(event.request?.cookies).toBeUndefined()
    expect(event.request?.query_string).toBeUndefined()
    expect(Object.keys(event.request?.headers ?? {})).toEqual(["user-agent"])
    expect(event.user).toEqual({ id: "u1", role: "user" })
    expect(event.contexts?.nextjs?.request_path).toBe("/api/bookings")
    assertNoPii(event)
  })

  test("server segment span: bodies, private headers, user and client IP are dropped", () => {
    const span = scrubSpan({
      trace_id: "t",
      span_id: "s",
      name: "POST /api/bookings",
      start_timestamp: 0,
      status: "ok",
      is_segment: true,
      attributes: {
        "http.request.body.data": '{"patient_name":"Jane Test","id_number":"8001015009087"}',
        "http.response.body.data": '{"name_first":"Jane"}',
        "http.request.header.cookie": "sb-access-token=secret",
        "http.request.header.referer": "https://bookings.carefirst.co.za/x?email=a@b.co",
        "http.request.header.user-agent": "UA",
        "user.ip_address": "196.1.2.3",
        "client.address": "196.1.2.3",
        "http.route": "/api/bookings",
      },
    } as StreamedSpanJSON)

    expect(Object.keys(span.attributes).sort()).toEqual([
      "http.request.header.user-agent",
      "http.route",
    ])
  })

  test("UI span names keep their # selector", () => {
    const span = scrubSpan({
      trace_id: "t", span_id: "s", name: "button#save", start_timestamp: 0,
      status: "ok", is_segment: false, attributes: {},
    } as StreamedSpanJSON)
    expect(span.name).toBe("button#save")
  })

  test("streamed span: name and URL attributes lose query strings, string attrs redacted", () => {
    const span = scrubSpan({
      trace_id: "t",
      span_id: "s",
      name: "GET https://x.supabase.co/rest/v1/bookings?email=eq.jane.test@example.com",
      start_timestamp: 0,
      status: "ok",
      is_segment: false,
      attributes: {
        "url.full": "https://x.supabase.co/rest/v1/bookings?email=eq.jane.test@example.com",
        "url.query": "email=eq.jane.test@example.com",
        "http.url": { value: "https://x.supabase.co/rest/v1/users?id_number=eq.8001015009087", type: "string" },
        "db.statement": "select * where phone = '0821234567'",
        booking_provider: "carefirst",
      },
    } as StreamedSpanJSON)

    expect(span.name).toBe("GET https://x.supabase.co/rest/v1/bookings")
    expect(span.attributes["url.query"]).toBeUndefined()
    expect(span.attributes.booking_provider).toBe("carefirst")
    assertNoPii(span)
  })
})
