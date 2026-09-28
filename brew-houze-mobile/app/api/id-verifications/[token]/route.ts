import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { quoteOrderBreakdown } from "@/lib/orders";
import { approvedVerification, cleanupIdVerifications } from "@/lib/id-verifications";

// An ID check followed by the customer's phone (the token is only known to that phone):
//   pending    waiting for the cashier
//   approved   ready to pay: with the order total after the discount, worked out now
//   rejected   with the cashier's reason
//   cancelled, expired, used
// PATCH { action: "cancel" } takes it back (the photo is deleted).

const isToken = (token: string) => /^[0-9a-f-]{36}$/i.test(token);

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!isToken(token)) return NextResponse.json({ error: "Invalid ID check." }, { status: 400 });
  const client = await pool.connect();
  try {
    await cleanupIdVerifications(client);
    const result = await client.query(`
      SELECT v.status, v.reject_reason, v.holder_name, dt.name AS discount_name,
        TO_CHAR(v.expires_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS expires_at
      FROM id_verifications v LEFT JOIN discount_types dt ON dt.discount_type_id = v.discount_type_id
      WHERE v.public_token = $1
    `, [token]);
    const row = result.rows[0];
    if (!row) return NextResponse.json({ error: "This ID check is no longer on file." }, { status: 404 });
    let breakdown: { subtotal: number; discountAmount: number; vatExemptAmount: number; total: number } | null = null;
    let problem: string | null = null;
    if (row.status === "approved") {
      try {
        const approved = await approvedVerification(client, token);
        breakdown = await quoteOrderBreakdown(client, { items: approved.items, source: "mobile", cashierAdminId: null, idDiscounts: [approved.idDiscount] });
      } catch (quoteError) {
        problem = quoteError instanceof Error ? quoteError.message : "This order can't be placed right now.";
      }
    }
    return NextResponse.json({
      data: {
        status: String(row.status),
        rejectReason: (row.reject_reason as string | null) ?? null,
        holderName: String(row.holder_name),
        discountName: (row.discount_name as string | null) ?? null,
        expiresAt: String(row.expires_at),
        breakdown,
        problem,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/id-verifications/[token] failed:", error);
    return NextResponse.json({ error: "Could not check your ID status." }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!isToken(token)) return NextResponse.json({ error: "Invalid ID check." }, { status: 400 });
  try {
    const body = await request.json() as { action?: unknown };
    if (body.action !== "cancel") return NextResponse.json({ error: "Unknown request." }, { status: 400 });
    await pool.query("UPDATE id_verifications SET status = 'cancelled', photo = NULL, updated_at = CURRENT_TIMESTAMP WHERE public_token = $1 AND status IN ('pending', 'approved')", [token]);
    return NextResponse.json({ data: { status: "cancelled" } });
  } catch (error) {
    console.error("PATCH /api/id-verifications/[token] failed:", error);
    return NextResponse.json({ error: "Could not cancel." }, { status: 500 });
  }
}
