// =============================================================================
// scripts/delete-user.mjs
//
// One-off hard delete of an app user. Removes:
//   1. user_units rows for the user (cleaned up first to avoid FK noise)
//   2. public.users row
//   3. auth.users row (if linked via auth_user_id)
//
// Same logic as DELETE /api/admin/users/[id], but runnable from the local
// machine without needing to be signed in as a system_admin in the browser.
// Useful for one-off cleanups (test users, mistaken creates).
//
// Usage (from booking-app/):
//   node --env-file=.env.local scripts/delete-user.mjs <public.users.id>
//
// Safety:
//   - Refuses to run without an explicit id argument.
//   - Loads + prints the user before deleting so you can sanity-check what
//     you're about to wipe.
//   - Refuses if the user is currently `Active` — pass --force to override.
//     (Disabled-then-delete is the intended pattern; deleting an Active user
//     is almost always a mistake.)
// =============================================================================

import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.")
  process.exit(1)
}

const args = process.argv.slice(2)
const userId = args.find((a) => !a.startsWith("--"))
const force = args.includes("--force")

if (!userId) {
  console.error("Usage: node --env-file=.env.local scripts/delete-user.mjs <user-id> [--force]")
  process.exit(1)
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  // 1. Load and sanity-check.
  const { data: user, error: loadErr } = await admin
    .from("users")
    .select("id, first_names, surname, email, role, status, auth_user_id")
    .eq("id", userId)
    .single()

  if (loadErr || !user) {
    console.error("User not found:", loadErr?.message || userId)
    process.exit(1)
  }

  console.log("About to delete:")
  console.log(`  id:           ${user.id}`)
  console.log(`  name:         ${user.first_names} ${user.surname}`)
  console.log(`  email:        ${user.email}`)
  console.log(`  role:         ${user.role}`)
  console.log(`  status:       ${user.status}`)
  console.log(`  auth_user_id: ${user.auth_user_id ?? "(none)"}`)
  console.log("")

  if (user.status === "Active" && !force) {
    console.error("Refusing to delete an Active user. Disable them first, or pass --force.")
    process.exit(1)
  }

  // 2. Delete user_units rows (best-effort; cascades may handle this anyway).
  const { error: junkErr } = await admin
    .from("user_units")
    .delete()
    .eq("user_id", userId)
  if (junkErr) {
    console.warn("WARN clearing user_units:", junkErr.message)
  } else {
    console.log("OK   user_units cleared")
  }

  // 3. Delete public.users row.
  const { error: delErr } = await admin.from("users").delete().eq("id", userId)
  if (delErr) {
    console.error("FAIL deleting public.users row:", delErr.message)
    process.exit(1)
  }
  console.log("OK   public.users row deleted")

  // 4. Delete auth.users row if linked.
  if (user.auth_user_id) {
    const { error: authErr } = await admin.auth.admin.deleteUser(user.auth_user_id)
    if (authErr) {
      console.warn(
        `WARN public row gone but failed to delete auth.users ${user.auth_user_id}:`,
        authErr.message
      )
      console.warn("You may need to delete the orphan auth user manually from the Supabase dashboard.")
    } else {
      console.log(`OK   auth.users ${user.auth_user_id} deleted`)
    }
  }

  console.log("")
  console.log("Done.")
}

main().catch((err) => {
  console.error("Crashed:", err)
  process.exit(1)
})
