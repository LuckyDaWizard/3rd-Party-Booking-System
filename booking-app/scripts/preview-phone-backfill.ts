/* eslint-disable no-console */
// =============================================================================
// scripts/preview-phone-backfill.ts
//
// READ-ONLY preview of the contact-number E.164 backfill. THIS SCRIPT WRITES
// NOTHING — it only SELECTs rows and prints a report to stdout. The actual
// write migration is a SEPARATE, later, human-approved step.
//
// What it does:
//   For each of bookings / users / clients, it reads every row with a non-empty
//   contact_number and computes the proposed canonical E.164 value:
//     - bookings: normalizeToE164(row.country_code ?? "ZA", contact_number)
//     - users / clients (no country_code column): derive the country from the
//       number itself via deriveCountryFromNumber(), then normalizeToE164().
//   It then reports, per table: counts of {already-canonical, would-change,
//   cannot-normalize}, the full would-change list (id, old → new) and the full
//   cannot-normalize list (id, value), ending with a grand-total summary.
//
// Run it:
//   cd booking-app
//   npx tsx scripts/preview-phone-backfill.ts
//
// Requires the same env as the app (read from booking-app/.env.local or the
// process environment):
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// Uses the service-role client (bypasses RLS) — same construction as
// tests/_setup/seed.ts. NEVER imported from app code.
// =============================================================================

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { normalizeToE164 } from "../src/lib/phone"
import { deriveCountryFromNumber } from "../src/lib/phone-server"

// ----- Env loading (mirrors tests/_setup/seed.ts loadEnvFile) ----------------

function loadEnvFile(): void {
  try {
    const p = join(process.cwd(), ".env.local")
    const txt = readFileSync(p, "utf8")
    for (const rawLine of txt.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith("#")) continue
      const eq = line.indexOf("=")
      if (eq < 0) continue
      const key = line.slice(0, eq).trim()
      const value = line.slice(eq + 1).trim()
      if (!key || process.env[key] !== undefined) continue
      process.env[key] = value
    }
  } catch {
    // .env.local missing — fall through; the env check below surfaces the error.
  }
}

// ----- Report types ----------------------------------------------------------

interface TableReport {
  table: string
  total: number
  alreadyCanonical: number
  wouldChange: { id: string; old: string; next: string }[]
  cannotNormalize: { id: string; value: string }[]
}

function nonEmpty(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== ""
}

// ----- Per-table preview (READ-ONLY: select only) ----------------------------

async function previewBookings(admin: SupabaseClient): Promise<TableReport> {
  const report: TableReport = {
    table: "bookings",
    total: 0,
    alreadyCanonical: 0,
    wouldChange: [],
    cannotNormalize: [],
  }

  const { data, error } = await admin
    .from("bookings")
    .select("id, country_code, contact_number")
    .not("contact_number", "is", null)

  if (error) throw new Error(`[preview] bookings select failed: ${error.message}`)

  for (const row of (data ?? []) as {
    id: string
    country_code: string | null
    contact_number: string | null
  }[]) {
    if (!nonEmpty(row.contact_number)) continue
    report.total++
    const country = nonEmpty(row.country_code) ? row.country_code : "ZA"
    const next = normalizeToE164(country, row.contact_number)
    if (next === null) {
      report.cannotNormalize.push({ id: row.id, value: row.contact_number })
    } else if (next === row.contact_number) {
      report.alreadyCanonical++
    } else {
      report.wouldChange.push({ id: row.id, old: row.contact_number, next })
    }
  }

  return report
}

async function previewDerived(
  admin: SupabaseClient,
  table: "users" | "clients"
): Promise<TableReport> {
  const report: TableReport = {
    table,
    total: 0,
    alreadyCanonical: 0,
    wouldChange: [],
    cannotNormalize: [],
  }

  const { data, error } = await admin
    .from(table)
    .select("id, contact_number")
    .not("contact_number", "is", null)

  if (error) throw new Error(`[preview] ${table} select failed: ${error.message}`)

  for (const row of (data ?? []) as {
    id: string
    contact_number: string | null
  }[]) {
    if (!nonEmpty(row.contact_number)) continue
    report.total++
    const country = deriveCountryFromNumber(row.contact_number)
    const next = normalizeToE164(country, row.contact_number)
    if (next === null) {
      report.cannotNormalize.push({ id: row.id, value: row.contact_number })
    } else if (next === row.contact_number) {
      report.alreadyCanonical++
    } else {
      report.wouldChange.push({ id: row.id, old: row.contact_number, next })
    }
  }

  return report
}

// ----- Printing --------------------------------------------------------------

function printReport(r: TableReport): void {
  console.log("")
  console.log(`=== ${r.table} ===`)
  console.log(`  rows with a contact number : ${r.total}`)
  console.log(`  already canonical          : ${r.alreadyCanonical}`)
  console.log(`  would change               : ${r.wouldChange.length}`)
  console.log(`  cannot normalize           : ${r.cannotNormalize.length}`)

  if (r.wouldChange.length > 0) {
    console.log(`  -- would change --`)
    for (const w of r.wouldChange) {
      console.log(`     ${w.id}: ${w.old} -> ${w.next}`)
    }
  }
  if (r.cannotNormalize.length > 0) {
    console.log(`  -- cannot normalize --`)
    for (const c of r.cannotNormalize) {
      console.log(`     ${c.id}: ${c.value}`)
    }
  }
}

// ----- Entry point -----------------------------------------------------------

async function main(): Promise<void> {
  loadEnvFile()

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    throw new Error(
      "[preview] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
        "Set them in booking-app/.env.local."
    )
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log("READ-ONLY phone-backfill preview — NO writes are performed.")

  const reports: TableReport[] = [
    await previewBookings(admin),
    await previewDerived(admin, "users"),
    await previewDerived(admin, "clients"),
  ]

  for (const r of reports) printReport(r)

  // Grand total.
  const totals = reports.reduce(
    (acc, r) => {
      acc.total += r.total
      acc.alreadyCanonical += r.alreadyCanonical
      acc.wouldChange += r.wouldChange.length
      acc.cannotNormalize += r.cannotNormalize.length
      return acc
    },
    { total: 0, alreadyCanonical: 0, wouldChange: 0, cannotNormalize: 0 }
  )

  console.log("")
  console.log("=== GRAND TOTAL ===")
  console.log(`  rows with a contact number : ${totals.total}`)
  console.log(`  already canonical          : ${totals.alreadyCanonical}`)
  console.log(`  would change               : ${totals.wouldChange}`)
  console.log(`  cannot normalize           : ${totals.cannotNormalize}`)
  console.log("")
  console.log("Reminder: this was a preview. Nothing was written to the database.")
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
