// =============================================================================
// scripts/migrate-pins-to-6-digits.mjs
//
// One-off migration: replace each user's existing PIN with a new 6-digit PIN.
// Updates BOTH public.users.pin AND auth.users (email + password) atomically,
// rolling back the auth side if the public.users update fails.
//
// Identifies users by full name (first_names + ' ' + surname). Run once.
// Idempotent: if a user's current PIN already matches their target PIN,
// they're skipped.
//
// Usage (from booking-app/):
//   node --env-file=.env.local scripts/migrate-pins-to-6-digits.mjs
//
// Safety:
//   - Uses the service role key. Run locally only.
//   - Refuses to run if any target PIN collides with an existing other user.
//   - Logs each step and stops on the first hard error so you can re-run after
//     fixing.
// =============================================================================

import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.")
  process.exit(1)
}

// ---------------------------------------------------------------------------
// New PIN assignments. Edit if you need to re-run with different values.
// Match by full name exactly as stored in public.users.
// ---------------------------------------------------------------------------
const NEW_PINS = [
  { name: "Almighty DaWizard",    pin: "487293" },
  { name: "Ndumiso Buthelezi",    pin: "615048" },
  { name: "Brian Nonjiji",        pin: "392716" },
  { name: "Mikhali Junkoon",      pin: "740582" },
  { name: "Nicholas Schreiber",   pin: "168934" },
  { name: "Tracy Smith",          pin: "529607" },
  { name: "Genevieve Barac",      pin: "854371" },
]

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function pinToEmail(pin) {
  return `pin-${pin}@carefirst.local`
}

async function main() {
  // Validate the input list locally first.
  const seen = new Set()
  for (const u of NEW_PINS) {
    if (!/^\d{6}$/.test(u.pin)) {
      console.error(`Bad PIN for ${u.name}: must be exactly 6 digits, got "${u.pin}"`)
      process.exit(1)
    }
    if (seen.has(u.pin)) {
      console.error(`Duplicate PIN ${u.pin} in input list`)
      process.exit(1)
    }
    seen.add(u.pin)
  }

  // Load all matching users.
  console.log("Loading users from public.users…")
  const { data: users, error: loadErr } = await admin
    .from("users")
    .select("id, first_names, surname, pin, auth_user_id")

  if (loadErr) {
    console.error("Failed to fetch users:", loadErr.message)
    process.exit(1)
  }

  // Normalize for matching: collapse whitespace, lowercase, strip non-printable.
  const normalize = (s) =>
    String(s ?? "")
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()

  // Match input list to DB rows.
  const plan = []
  for (const target of NEW_PINS) {
    const targetNorm = normalize(target.name)
    const matches = users.filter(
      (u) => normalize(`${u.first_names} ${u.surname}`) === targetNorm
    )
    if (matches.length === 0) {
      console.error(`No DB user found for "${target.name}"`)
      console.error("Available users in DB:")
      for (const u of users) {
        const full = `${u.first_names} ${u.surname}`
        console.error(`  - "${full}"  (normalized: "${normalize(full)}")`)
      }
      console.error(`Looking for normalized: "${targetNorm}"`)
      process.exit(1)
    }
    if (matches.length > 1) {
      console.error(`Ambiguous name "${target.name}" — ${matches.length} matches in DB`)
      process.exit(1)
    }
    const user = matches[0]
    if (!user.auth_user_id) {
      console.error(`${target.name} has no auth_user_id. Run the backfill first.`)
      process.exit(1)
    }
    plan.push({ user, newPin: target.pin })
  }

  // Pre-flight: detect any collisions with users NOT in the migration set.
  // (Two users in the migration set with the same new PIN was already caught above.)
  const newPinSet = new Set(plan.map((p) => p.newPin))
  const planUserIds = new Set(plan.map((p) => p.user.id))
  for (const other of users) {
    if (planUserIds.has(other.id)) continue
    if (newPinSet.has(other.pin)) {
      console.error(
        `Collision: new PIN ${other.pin} is already used by an unrelated user ` +
          `${other.first_names} ${other.surname} (${other.id}). Aborting.`
      )
      process.exit(1)
    }
  }

  console.log(`Plan: updating ${plan.length} users.`)
  for (const { user, newPin } of plan) {
    console.log(`  ${user.first_names} ${user.surname}: ${user.pin} -> ${newPin}`)
  }
  console.log("")

  // Execute, one user at a time. Stop on first hard failure.
  let updated = 0
  let skipped = 0

  for (const { user, newPin } of plan) {
    const label = `${user.first_names} ${user.surname}`

    if (user.pin === newPin) {
      console.log(`SKIP ${label} — already on PIN ${newPin}`)
      skipped++
      continue
    }

    const oldPin = user.pin
    const newEmail = pinToEmail(newPin)
    const oldEmail = pinToEmail(oldPin)

    console.log(`UPDATE ${label}: auth ${oldEmail} -> ${newEmail}`)
    const { error: authErr } = await admin.auth.admin.updateUserById(user.auth_user_id, {
      email: newEmail,
      password: newPin,
      email_confirm: true,
    })
    if (authErr) {
      console.error(`  FAIL auth update for ${label}: ${authErr.message}`)
      console.error("  Aborting. Re-run after fixing — script is idempotent.")
      process.exit(1)
    }

    const { error: updErr } = await admin
      .from("users")
      .update({ pin: newPin })
      .eq("id", user.id)

    if (updErr) {
      console.error(`  FAIL public.users update for ${label}: ${updErr.message}`)
      console.error("  Rolling back auth user…")
      const { error: rbErr } = await admin.auth.admin.updateUserById(user.auth_user_id, {
        email: oldEmail,
        password: oldPin,
        email_confirm: true,
      })
      if (rbErr) {
        console.error(`  ROLLBACK FAILED: ${rbErr.message}`)
        console.error("  Manual fix required for this user.")
      } else {
        console.error("  Rollback OK.")
      }
      process.exit(1)
    }

    console.log(`  OK`)
    updated++
  }

  console.log("")
  console.log("=== Migration complete ===")
  console.log(`  updated: ${updated}`)
  console.log(`  skipped: ${skipped}`)
  console.log("")
  console.log("Next step: change PIN_LENGTH from 5 to 6 in src/app/(auth)/sign-in/page.tsx,")
  console.log("then test login locally with one of the new PINs.")
}

main().catch((err) => {
  console.error("Crashed:", err)
  process.exit(1)
})
