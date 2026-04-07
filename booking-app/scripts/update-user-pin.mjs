// =============================================================================
// scripts/update-user-pin.mjs
//
// Update a user's PIN in BOTH places it lives:
//   1. public.users.pin
//   2. auth.users — email AND password (because the synthetic email is
//      derived from the PIN: pin-{pin}@carefirst.local)
//
// Usage (from booking-app/):
//   node --env-file=.env.local scripts/update-user-pin.mjs <user-id> <new-pin>
//
// Or edit the constants below and run with no args.
//
// Safety:
//   - Refuses to run if the new PIN is already taken by another user.
//   - Refuses to run if the user doesn't have an auth_user_id (run backfill first).
//   - Updates auth.users first, then public.users — if the auth update fails
//     nothing changes; if the public.users update fails the auth side is
//     rolled back so the two stay in sync.
// =============================================================================

import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.")
  process.exit(1)
}

// Defaults if no CLI args supplied. Edit these or pass args.
const DEFAULT_USER_ID = null   // e.g. "5fb29f82-1baa-4efc-a953-96d006ea74ea"
const DEFAULT_NEW_PIN = null   // e.g. "66666"

const args = process.argv.slice(2)
const userId = args[0] || DEFAULT_USER_ID
const newPin = args[1] || DEFAULT_NEW_PIN

if (!userId || !newPin) {
  console.error("Usage: node --env-file=.env.local scripts/update-user-pin.mjs <user-id> <new-pin>")
  process.exit(1)
}

if (!/^\d+$/.test(newPin)) {
  console.error("PIN must be digits only.")
  process.exit(1)
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function pinToEmail(pin) {
  return `pin-${pin}@carefirst.local`
}

async function main() {
  // 1. Load the target user.
  const { data: user, error: loadErr } = await admin
    .from("users")
    .select("id, first_names, surname, pin, auth_user_id")
    .eq("id", userId)
    .single()

  if (loadErr || !user) {
    console.error("User not found:", loadErr?.message || userId)
    process.exit(1)
  }

  console.log(`Target: ${user.first_names} ${user.surname} (current pin=${user.pin})`)

  if (user.pin === newPin) {
    console.log("New PIN is the same as the current PIN. Nothing to do.")
    return
  }

  if (!user.auth_user_id) {
    console.error("This user has no auth_user_id. Run the backfill script first.")
    process.exit(1)
  }

  // 2. Make sure the new PIN isn't already taken.
  const { data: clash, error: clashErr } = await admin
    .from("users")
    .select("id, first_names, surname")
    .eq("pin", newPin)
    .neq("id", userId)

  if (clashErr) {
    console.error("Failed to check for PIN collisions:", clashErr.message)
    process.exit(1)
  }
  if (clash && clash.length > 0) {
    console.error(`PIN ${newPin} is already in use by:`)
    for (const c of clash) console.error(`  - ${c.first_names} ${c.surname} (${c.id})`)
    process.exit(1)
  }

  const oldPin = user.pin
  const newEmail = pinToEmail(newPin)
  const oldEmail = pinToEmail(oldPin)

  // 3. Update auth.users first (email + password).
  console.log(`Updating auth user ${user.auth_user_id}: ${oldEmail} -> ${newEmail}`)
  const { error: authErr } = await admin.auth.admin.updateUserById(user.auth_user_id, {
    email: newEmail,
    password: newPin,
    email_confirm: true,
  })

  if (authErr) {
    console.error("Failed to update auth user:", authErr.message)
    process.exit(1)
  }

  // 4. Update public.users.pin.
  console.log(`Updating public.users.pin: ${oldPin} -> ${newPin}`)
  const { error: updErr } = await admin
    .from("users")
    .update({ pin: newPin })
    .eq("id", userId)

  if (updErr) {
    console.error("Failed to update public.users.pin:", updErr.message)
    console.error("Rolling back auth user change…")
    const { error: rollbackErr } = await admin.auth.admin.updateUserById(user.auth_user_id, {
      email: oldEmail,
      password: oldPin,
      email_confirm: true,
    })
    if (rollbackErr) {
      console.error("ROLLBACK FAILED:", rollbackErr.message)
      console.error("Manual fix needed. Auth user is now out of sync with public.users.")
    } else {
      console.error("Rollback OK. Both sides are back to the old PIN.")
    }
    process.exit(1)
  }

  console.log(`✅ Done. ${user.first_names} ${user.surname} can now sign in with PIN ${newPin}.`)
}

main().catch((err) => {
  console.error("Crashed:", err)
  process.exit(1)
})
