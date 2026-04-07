// =============================================================================
// scripts/backfill-auth-users.mjs
//
// Phase 2 of Path 2: create a Supabase Auth user for every existing row in
// public.users, using the synthetic-email scheme `pin-{pin}@carefirst.local`,
// then store the new auth user id back on public.users.auth_user_id.
//
// This script is IDEMPOTENT — re-running it will skip rows that already have
// auth_user_id set, and will reuse existing auth users if it finds them by
// email.
//
// Usage (from booking-app/):
//   1. Make sure .env.local contains:
//        NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
//        SUPABASE_SERVICE_ROLE_KEY=<service role key>     # SECRET — never commit
//   2. node --env-file=.env.local scripts/backfill-auth-users.mjs
//
// Safety:
//   - Uses the service role key. Run locally only. Never expose in browser.
//   - Does NOT touch auth users that already exist; it only links them.
//   - On any error for a single row, logs and continues so partial progress
//     is preserved. Re-run to retry.
// =============================================================================

import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.")
  console.error("Run with: node --env-file=.env.local scripts/backfill-auth-users.mjs")
  process.exit(1)
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Synthetic email scheme. Keep this in sync with src/lib/auth-store.tsx.
function pinToEmail(pin) {
  return `pin-${pin}@carefirst.local`
}

async function findAuthUserByEmail(email) {
  // listUsers is paginated; for a small user base one page is enough, but
  // walk pages defensively up to 10k users.
  let page = 1
  const perPage = 1000
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    const match = data.users.find((u) => u.email === email)
    if (match) return match
    if (data.users.length < perPage) return null
    page++
    if (page > 10) return null
  }
}

async function main() {
  console.log("Fetching public.users…")
  const { data: users, error } = await admin
    .from("users")
    .select("id, first_names, surname, pin, email, role, status, auth_user_id")
    .order("created_at", { ascending: true })

  if (error) {
    console.error("Failed to fetch users:", error)
    process.exit(1)
  }

  console.log(`Found ${users.length} users.`)

  let created = 0
  let linked = 0
  let skipped = 0
  let failed = 0

  for (const u of users) {
    const label = `${u.first_names} ${u.surname} (pin=${u.pin})`

    if (!u.pin || u.pin.trim() === "") {
      console.warn(`SKIP ${label} — no PIN`)
      skipped++
      continue
    }

    if (u.auth_user_id) {
      console.log(`SKIP ${label} — already linked (${u.auth_user_id})`)
      skipped++
      continue
    }

    const email = pinToEmail(u.pin)

    try {
      // Try to create the auth user.
      let authUserId = null
      const { data: createData, error: createErr } = await admin.auth.admin.createUser({
        email,
        password: u.pin,
        email_confirm: true,
        user_metadata: {
          app_user_id: u.id,
          first_names: u.first_names,
          surname: u.surname,
          role: u.role,
        },
      })

      if (createErr) {
        // If the user already exists in auth (e.g. partial earlier run), find them.
        const msg = (createErr.message || "").toLowerCase()
        if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
          console.log(`  ${label} — auth user already exists, looking up…`)
          const existing = await findAuthUserByEmail(email)
          if (!existing) {
            throw new Error(`createUser said exists but listUsers couldn't find ${email}`)
          }
          authUserId = existing.id
          linked++
        } else {
          throw createErr
        }
      } else {
        authUserId = createData.user.id
        created++
      }

      // Link it back on public.users.
      const { error: updErr } = await admin
        .from("users")
        .update({ auth_user_id: authUserId })
        .eq("id", u.id)

      if (updErr) throw updErr

      console.log(`OK   ${label} -> ${authUserId}`)
    } catch (err) {
      console.error(`FAIL ${label}:`, err.message || err)
      failed++
    }
  }

  console.log("")
  console.log("=== Backfill complete ===")
  console.log(`  created:  ${created}`)
  console.log(`  linked:   ${linked} (already existed in auth, just linked)`)
  console.log(`  skipped:  ${skipped}`)
  console.log(`  failed:   ${failed}`)
  console.log("")

  if (failed > 0) {
    console.log("Some rows failed. Fix the errors above and re-run — the script is idempotent.")
    process.exit(1)
  }

  // Sanity check: confirm every active user with a PIN now has auth_user_id.
  const { data: missing } = await admin
    .from("users")
    .select("id, first_names, surname, pin")
    .is("auth_user_id", null)
    .not("pin", "is", null)
    .neq("pin", "")

  if (missing && missing.length > 0) {
    console.warn(`WARNING: ${missing.length} users still have no auth_user_id:`)
    for (const m of missing) {
      console.warn(`  - ${m.first_names} ${m.surname} (pin=${m.pin}, id=${m.id})`)
    }
  } else {
    console.log("All users with PINs are linked. ✅")
  }
}

main().catch((err) => {
  console.error("Backfill crashed:", err)
  process.exit(1)
})
