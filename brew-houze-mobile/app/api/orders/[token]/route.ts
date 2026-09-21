import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) return NextResponse.json({ error: "Invalid tracking token." }, { status: 400 });

  try {
    const result = await pool.query(`
      SELECT order_id, queue_number, queue_status, order_source,
        TO_CHAR(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS created_at
      FROM sales_orders
      WHERE customer_order_token = $1::uuid AND order_source = 'online'
    `, [token]);
    if (result.rowCount === 0) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    return NextResponse.json({ data: result.rows[0] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/orders/[token] failed:", error);
    return NextResponse.json({ error: "Unable to retrieve order status." }, { status: 500 });
  }
}
