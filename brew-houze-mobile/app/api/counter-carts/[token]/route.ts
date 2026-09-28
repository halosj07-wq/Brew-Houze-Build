import { NextResponse } from "next/server";
import pool from "@/lib/db";

// A cart sent to the counter, followed by the customer's phone: waiting (with its code), ordered
// (the queue number of the order it became), cancelled or expired. PATCH { action: "cancel" }
// takes it back while it is still waiting. The token is only known to that phone.

const isToken = (token: string) => /^[0-9a-f-]{36}$/i.test(token);

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!isToken(token)) return NextResponse.json({ error: "Invalid code." }, { status: 400 });
  try {
    await pool.query("UPDATE counter_carts SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE public_token = $1 AND status = 'waiting' AND expires_at < CURRENT_TIMESTAMP", [token]);
    const result = await pool.query(`
      SELECT cc.status, cc.short_code, dt.name AS discount_name, so.queue_number, so.queue_status,
        TO_CHAR(cc.expires_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS expires_at
      FROM counter_carts cc
      LEFT JOIN discount_types dt ON dt.discount_type_id = cc.discount_type_id
      LEFT JOIN sales_orders so ON so.order_id = cc.order_id
      WHERE cc.public_token = $1
    `, [token]);
    const row = result.rows[0];
    if (!row) return NextResponse.json({ error: "This code is no longer on file." }, { status: 404 });
    return NextResponse.json({
      data: {
        status: String(row.status),
        code: String(row.short_code),
        discountName: (row.discount_name as string | null) ?? null,
        expiresAt: String(row.expires_at),
        queueNumber: row.queue_number === null ? null : Number(row.queue_number),
        queueStatus: (row.queue_status as string | null) ?? null,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/counter-carts/[token] failed:", error);
    return NextResponse.json({ error: "Could not check your order." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!isToken(token)) return NextResponse.json({ error: "Invalid code." }, { status: 400 });
  try {
    const body = await request.json() as { action?: unknown };
    if (body.action !== "cancel") return NextResponse.json({ error: "Unknown request." }, { status: 400 });
    const result = await pool.query("UPDATE counter_carts SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE public_token = $1 AND status IN ('waiting', 'expired') RETURNING status", [token]);
    if (result.rowCount === 0) return NextResponse.json({ error: "The counter already has your order." }, { status: 409 });
    return NextResponse.json({ data: { status: "cancelled" } });
  } catch (error) {
    console.error("PATCH /api/counter-carts/[token] failed:", error);
    return NextResponse.json({ error: "Could not cancel." }, { status: 500 });
  }
}
