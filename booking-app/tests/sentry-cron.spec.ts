import { test, expect } from "@playwright/test"
import { runFailed, withCronMonitor } from "../src/lib/sentry-cron"

// The cron wrapper decides "failed run" from the RESPONSE, because the cron
// routes return error JSON instead of throwing. Sentry is disabled here (no
// DSN), so check-ins / captures are no-ops — this covers the decision logic
// and the pass-through contract.

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

test.describe("Sentry cron wrapper", () => {
  test("runFailed: HTTP errors, ok:false and partial `errors` count as failures", async () => {
    expect(await runFailed(json({ ok: true, reconciled: 0, results: [] }))).toBe(false)
    expect(await runFailed(json({ ok: true, swept: {}, errors: {} }))).toBe(false)
    expect(await runFailed(json({ ok: false, error: "x" }, 500))).toBe(true)
    expect(await runFailed(json({ ok: false, error: "x" }))).toBe(true)
    expect(await runFailed(json({ ok: true, errors: { auth_attempts: "unknown error" } }))).toBe(true)
    expect(await runFailed(new Response("no json", { status: 200 }))).toBe(false)
    expect(await runFailed(new Response(null, { status: 503 }))).toBe(true)
  })

  test("runFailed does not consume the body the route returns", async () => {
    const res = json({ ok: true, reconciled: 2 })
    await runFailed(res)
    expect(await res.json()).toEqual({ ok: true, reconciled: 2 })
  })

  test("non-cron calls pass straight through; cron calls return the handler's response", async () => {
    const prev = process.env.CRON_SECRET
    process.env.CRON_SECRET = "test-cron-secret-0123456789"
    try {
      let calls = 0
      const wrapped = withCronMonitor("unit-test", async () => {
        calls++
        return json({ ok: false, error: "boom" }, 500)
      }, { monitor: true })

      const plain = await wrapped(new Request("http://x/api/payfast/reconcile", { method: "POST" }))
      expect(plain.status).toBe(500)

      const cron = await wrapped(
        new Request("http://x/api/payfast/reconcile", {
          method: "POST",
          headers: { "X-Cron-Secret": "test-cron-secret-0123456789" },
        })
      )
      expect(cron.status).toBe(500)
      expect(await cron.json()).toEqual({ ok: false, error: "boom" })
      expect(calls).toBe(2)
    } finally {
      if (prev === undefined) delete process.env.CRON_SECRET
      else process.env.CRON_SECRET = prev
    }
  })

  test("a throwing handler still throws (after reporting)", async () => {
    process.env.CRON_SECRET = "test-cron-secret-0123456789"
    const wrapped = withCronMonitor("unit-test", async () => {
      throw new Error("handler crashed")
    })
    await expect(
      wrapped(new Request("http://x", { headers: { "X-Cron-Secret": "test-cron-secret-0123456789" } }))
    ).rejects.toThrow("handler crashed")
  })
})
