import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireSystemAdminWithCaller } from "@/lib/api-auth"
import { writeAuditLog, getCallerIp } from "@/lib/audit-log"

// =============================================================================
// POST /api/admin/privacy/access
//
// POPIA §23 — right to access. A patient requests a copy of the personal
// information we hold about them (usually by emailing support with their
// ID number). A system admin verifies the requester's identity out of
// band, then calls this endpoint to pull all booking rows matching that
// ID number.
//
// Body: { idNumber: string, reason?: string }
//
// Returns:
//   {
//     ok: true,
//     idNumber: string,
//     count: number,
//     bookings: BookingRecord[],   // full rows, including erased tombstones
//     generatedAt: string
//   }
//
// Auth: system_admin only. Unit managers and users have no legitimate
// reason to export another patient's data; restricting this to admins
// keeps the audit trail clean.
//
// Every successful access is audit-logged with the actor, the ID number,
// and the stated reason (free-text from the caller). The admin should
// document the external request in the reason field.
// =============================================================================

interface Body {
  idNumber?: string
  reason?: string
}

export async function POST(request: Request) {
  const { caller, denied } = await requireSystemAdminWithCaller()
  if (denied) return denied

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const idNumber = body.idNumber?.trim()
  const reason = body.reason?.trim() || "Access request (reason not provided)"

  if (!idNumber) {
    return NextResponse.json(
      { error: "idNumber is required" },
      { status: 400 }
    )
  }

  let admin
  try {
    admin = getSupabaseAdmin()
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server misconfigured" },
      { status: 500 }
    )
  }

  // Pull every booking matching this ID number. Includes bookings that
  // have been erased (PII fields are NULL) so the requester can see that
  // an erasure request has been honoured.
  const { data: bookings, error } = await admin
    .from("bookings")
    .select("*")
    .eq("id_number", idNumber)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[privacy/access] DB error:", error.message)
    return NextResponse.json(
      { error: `Database error: ${error.message}` },
      { status: 500 }
    )
  }

  // Audit log — the reason is captured verbatim so we can show the POPIA
  // regulator we had a legitimate basis for each export.
  writeAuditLog({
    actorId: caller.id,
    actorName: caller.name,
    actorRole: caller.role,
    action: "update",
    entityType: "user",
    entityId: caller.id,
    entityName: `POPIA access request: ID ${idNumber}`,
    changes: {
      "ID Number": { new: idNumber },
      "Reason": { new: reason },
      "Bookings Returned": { new: String(bookings?.length ?? 0) },
    },
    ipAddress: getCallerIp(request),
  })

  return NextResponse.json({
    ok: true,
    idNumber,
    count: bookings?.length ?? 0,
    bookings: bookings ?? [],
    generatedAt: new Date().toISOString(),
  })
}
