// =============================================================================
// Unit coverage for parseTransactionHistoryCsv (src/lib/payfast.ts).
//
// The LIVE PayFast Transaction History API returns CSV, not the JSON the
// Playwright mock serves — discovered 2026-08-25 when the signature fix made
// the live call succeed for the first time. The header row and quoting rules
// below are copied from a real live response, so this spec pins the exact
// production format. Pure-function tests: no page, no dev-server round trips
// (same pattern as phone-lib.spec.ts — relative import, NOT "@/lib/*").
// =============================================================================

import { test, expect } from "@playwright/test"
import {
  parseTransactionHistoryCsv,
  selectCompletedTransaction,
} from "../src/lib/payfast"

// Real header captured from the live API on 2026-08-25.
const LIVE_HEADER = `Date,Type,Sign,Party,Name,Description,Currency,"Funding Type","Batch ID",Gross,Fee,Net,Balance,"M Payment ID","PF Payment ID","custom str1","custom int1","custom str2","custom int2","custom str3","custom str4","custom str5","custom int3","custom int4","custom int5"`

test("maps a FUNDS_RECEIVED credit row to payment_status COMPLETE with comma-free amounts", () => {
  const csv = [
    LIVE_HEADER,
    `"2026-08-20 11:54:59",FUNDS_RECEIVED,CREDIT,"Jane Buyer","Some Shop - 1531","New order, with a comma",ZAR,CC,,"2,800.00",-105.34,"2,694.66","2,906.19",LCH-11111111-2222-3333-4444-555555555555,32238`,
  ].join("\n")

  const rows = parseTransactionHistoryCsv(csv)
  expect(rows).toHaveLength(1)
  const t = rows[0]
  expect(t.payment_status).toBe("COMPLETE")
  expect(t.m_payment_id).toBe("LCH-11111111-2222-3333-4444-555555555555")
  expect(t.pf_payment_id).toBe("32238")
  // Thousands separators stripped; Rand-string form preserved.
  expect(t.amount_gross).toBe("2800.00")
  expect(t.amount_net).toBe("2694.66")
})

test("a PAYOUT debit row is NOT COMPLETE (reconcile must never match it)", () => {
  const csv = [
    LIVE_HEADER,
    `"2026-08-22 16:19:38",PAYOUT,DEBIT,"My Bank Account","Payout to bank account","Payout: FNB, na (250655)",ZAR,,,"-2,896.19",-10.00,"-2,906.19",0.00,,3`,
  ].join("\n")

  const rows = parseTransactionHistoryCsv(csv)
  expect(rows).toHaveLength(1)
  expect(rows[0].payment_status).toBe("PAYOUT")
  expect(rows[0].m_payment_id).toBe("")
})

test("quoted fields keep embedded commas and unescape doubled quotes", () => {
  const csv = [
    LIVE_HEADER,
    `"2026-08-20 12:00:00",FUNDS_RECEIVED,CREDIT,"Buyer, Jr.","A ""quoted"" name","Desc",ZAR,CC,,26.00,-1.00,25.00,25.00,ABC-99999999-8888-7777-6666-555555555555,40001`,
  ].join("\n")

  const rows = parseTransactionHistoryCsv(csv)
  expect(rows[0].amount_gross).toBe("26.00")
  expect(rows[0].m_payment_id).toBe("ABC-99999999-8888-7777-6666-555555555555")
})

test("header-only and empty bodies parse to an empty list", () => {
  expect(parseTransactionHistoryCsv(LIVE_HEADER)).toHaveLength(0)
  expect(parseTransactionHistoryCsv("")).toHaveLength(0)
  expect(parseTransactionHistoryCsv("\n\n")).toHaveLength(0)
})

test("a body that is neither JSON nor the known CSV shape throws", () => {
  expect(() =>
    parseTransactionHistoryCsv("<html>Some proxy error page</html>\nline2")
  ).toThrow(/unrecognised body/)
})

test("FUNDS_RECEIVED with DEBIT sign is NOT COMPLETE (the sign guard that protects money)", () => {
  const csv = [
    LIVE_HEADER,
    `"2026-08-20 12:00:00",FUNDS_RECEIVED,DEBIT,"X","Y","Z",ZAR,CC,,-26.00,0.00,-26.00,0.00,ABC-99999999-8888-7777-6666-555555555555,40002`,
  ].join("\n")
  expect(parseTransactionHistoryCsv(csv)[0].payment_status).toBe("FUNDS_RECEIVED")
})

test("a quoted newline inside Description stays one record", () => {
  const csv = [
    LIVE_HEADER,
    `"2026-08-20 12:00:00",FUNDS_RECEIVED,CREDIT,"Buyer","Shop","Line one\nline two",ZAR,CC,,26.00,-1.00,25.00,25.00,ABC-99999999-8888-7777-6666-555555555555,40003`,
  ].join("\n")
  const rows = parseTransactionHistoryCsv(csv)
  expect(rows).toHaveLength(1)
  expect(rows[0].m_payment_id).toBe("ABC-99999999-8888-7777-6666-555555555555")
})

// =============================================================================
// selectCompletedTransaction — the matcher guards (pure, no network).
// =============================================================================

const BOOKING_ID = "99999999-8888-7777-6666-555555555555"
const OLD_WINDOW = Date.parse("2026-08-01T00:00:00+02:00")

const credit = (over: Record<string, unknown> = {}) => ({
  m_payment_id: `ABC-${BOOKING_ID}`,
  pf_payment_id: "40010",
  amount_gross: "325.00",
  payment_status: "COMPLETE",
  sign: "CREDIT",
  currency: "ZAR",
  date: "2026-08-20 12:00:00",
  ...over,
})

test("matcher: a clean COMPLETE credit within the window matches", () => {
  expect(selectCompletedTransaction([credit()], BOOKING_ID, OLD_WINDOW)).not.toBeNull()
})

test("matcher: a refund row for the same booking negates the original credit", () => {
  const refund = credit({ payment_status: "REFUND", sign: "DEBIT", amount_gross: "-325.00" })
  expect(selectCompletedTransaction([credit(), refund], BOOKING_ID, OLD_WINDOW)).toBeNull()
})

test("matcher: a non-ZAR COMPLETE row never matches", () => {
  expect(
    selectCompletedTransaction([credit({ currency: "USD" })], BOOKING_ID, OLD_WINDOW)
  ).toBeNull()
})

test("matcher: a COMPLETE row older than the lookback window never matches (API ignores date params)", () => {
  const recentWindow = Date.parse("2026-08-24T00:00:00+02:00")
  expect(
    selectCompletedTransaction([credit({ date: "2026-06-29 07:19:22" })], BOOKING_ID, recentWindow)
  ).toBeNull()
})

test("matcher: JSON-mock-shaped rows (no sign/currency/date) still match — mock compatibility", () => {
  const mockShaped = {
    m_payment_id: BOOKING_ID,
    pf_payment_id: "12345",
    amount_gross: "325.00",
    payment_status: "COMPLETE",
  }
  expect(selectCompletedTransaction([mockShaped], BOOKING_ID, OLD_WINDOW)).not.toBeNull()
})

test("matcher: a different booking's transactions never match", () => {
  expect(
    selectCompletedTransaction([credit()], "00000000-0000-0000-0000-000000000000", OLD_WINDOW)
  ).toBeNull()
})
