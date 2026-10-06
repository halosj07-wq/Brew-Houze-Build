import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { idHistory } from "@/lib/id-history";
import { APPROVED_MINUTES, cleanupIdVerifications } from "@/lib/id-verifications";
import { getSession, isQueueOnly, QUEUE_ONLY } from "@/lib/sessions";
import { signalChange } from "@/lib/realtime";

// ID photos sent from the mobile menu, waiting for the counter to check them (see
// lib/id-verifications.ts). GET lists them, each with its ID's history (was it used for this
// discount before? see lib/id-history.ts); the photos themselves come from ./[id]/photo.
// PATCH { id, action: "approve" | "reject", reason } decides. Either way the photo is deleted.
// An approval the customer asked to remember is saved to their account (never the photo).

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (isQueueOnly(session)) return NextResponse.json(QUEUE_ONLY, { status: 403 });
  try {
    await cleanupIdVerifications();
    const result = await pool.query(`
      SELECT v.verification_id, v.holder_name, v.id_number, v.items, v.lines, v.group_size, v.service_type, v.remember,
        v.discount_type_id, dt.name AS discount_name, dt.code AS discount_code, dt.id_label, v.photo IS NOT NULL AS has_photo,
        c.full_name AS customer_name, c.username,
        TO_CHAR(v.created_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS created_at,
        TO_CHAR(v.expires_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS expires_at
      FROM id_verifications v
      LEFT JOIN discount_types dt ON dt.discount_type_id = v.discount_type_id
      LEFT JOIN customers c ON c.customer_id = v.customer_id AND c.deleted_at IS NULL
      WHERE v.status = 'pending'
      ORDER BY v.created_at
      LIMIT 20
    `);
    const histories = await Promise.all(result.rows.map((row) => idHistory(row.discount_type_id === null ? null : Number(row.discount_type_id), String(row.discount_code ?? "custom"), (row.id_number as string | null) ?? null)));
    return NextResponse.json({
      data: result.rows.map((row, index) => ({
        id: Number(row.verification_id),
        holderName: String(row.holder_name),
        idNumber: (row.id_number as string | null) ?? null,
        items: Array.isArray(row.items) ? row.items : [],
        lines: Array.isArray(row.lines) ? row.lines : null,
        groupSize: row.group_size === null ? null : Number(row.group_size),
        serviceType: row.service_type === "take_out" ? "take_out" : "dine_in",
        remember: Boolean(row.remember),
        discountTypeId: row.discount_type_id === null ? null : Number(row.discount_type_id),
        discountName: (row.discount_name as string | null) ?? "Discount",
        discountCode: (row.discount_code as string | null) ?? "custom",
        idLabel: (row.id_label as string | null) ?? null,
        hasPhoto: Boolean(row.has_photo),
        customerName: (row.customer_name as string | null) ?? null,
        username: (row.username as string | null) ?? null,
        createdAt: String(row.created_at),
        expiresAt: String(row.expires_at),
        history: histories[index],
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/id-verifications failed:", error);
    return NextResponse.json({ error: "Could not load the ID checks." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  // Live screens reload once this is saved (a failed request only causes an extra reload).
  signalChange("line");
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (isQueueOnly(session)) return NextResponse.json(QUEUE_ONLY, { status: 403 });
  const client = await pool.connect();
  try {
    const body = await request.json() as { id?: unknown; action?: unknown; reason?: unknown };
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0 || (body.action !== "approve" && body.action !== "reject")) return NextResponse.json({ error: "Unknown request." }, { status: 400 });
    await client.query("BEGIN");
    const current = await client.query("SELECT status, remember, customer_id, discount_type_id, holder_name, id_number, expires_at < CURRENT_TIMESTAMP AS expired FROM id_verifications WHERE verification_id = $1 FOR UPDATE", [id]);
    const row = current.rows[0];
    if (!row || row.status !== "pending" || row.expired) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: row?.status === "cancelled" ? "The customer cancelled this request." : "This request is no longer waiting." }, { status: 409 });
    }
    if (body.action === "reject") {
      const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 160) : "The café could not accept this ID.";
      await client.query("UPDATE id_verifications SET status = 'rejected', reject_reason = $2, photo = NULL, decided_by = $3, decided_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE verification_id = $1", [id, reason, session.adminId]);
    } else {
      await client.query(`
        UPDATE id_verifications SET status = 'approved', photo = NULL, decided_by = $2, decided_at = CURRENT_TIMESTAMP,
          expires_at = CURRENT_TIMESTAMP + ($3 || ' minutes')::interval, updated_at = CURRENT_TIMESTAMP
        WHERE verification_id = $1
      `, [id, session.adminId, String(APPROVED_MINUTES)]);
      if (row.remember && row.customer_id !== null) {
        await client.query(`
          UPDATE customers SET id_discount_type_id = $2, id_discount_name = $3, id_discount_number = $4, id_verified_at = CURRENT_TIMESTAMP, id_verified_by = $5, updated_at = CURRENT_TIMESTAMP
          WHERE customer_id = $1 AND deleted_at IS NULL
        `, [row.customer_id, row.discount_type_id, row.holder_name, row.id_number, session.adminId]);
      }
    }
    await client.query("COMMIT");
    return NextResponse.json({ data: { id, status: body.action === "approve" ? "approved" : "rejected" } });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("PATCH /api/id-verifications failed:", error);
    return NextResponse.json({ error: "Could not save the decision." }, { status: 500 });
  } finally {
    client.release();
  }
}
