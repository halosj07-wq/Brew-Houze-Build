import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

export async function GET() {
  const session = verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  try {
    const result = await pool.query(`
      SELECT
        so.order_id,
        so.queue_number,
        so.created_at,
        COALESCE(
          STRING_AGG(
            p.product_name || CASE WHEN pv.size_label IS NULL THEN '' ELSE ' (' || pv.size_label || ')' END
            || ' x' || soi.quantity::text,
            ', ' ORDER BY p.product_name, pv.size_label
          ),
          'Order'
        ) AS items
      FROM sales_orders so
      JOIN sales_order_items soi ON soi.order_id = so.order_id
      JOIN products p ON p.product_id = soi.product_id
      LEFT JOIN product_variants pv ON pv.product_variant_id = soi.product_variant_id
      WHERE so.created_at >= CURRENT_DATE
        AND so.created_at < CURRENT_DATE + INTERVAL '1 day'
        AND so.queue_status = 'waiting'
      GROUP BY so.order_id
      ORDER BY so.queue_number ASC
    `);
    return NextResponse.json({ data: result.rows });
  } catch (error) {
    console.error("GET /api/queue failed:", error);
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "42703") {
      return NextResponse.json({ error: "The queue query does not match the current sales table schema. Check the cashier queue setup." }, { status: 500 });
    }
    return NextResponse.json({ error: "Could not retrieve the queue." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  try {
    const body = await request.json() as { order_id?: unknown };
    const orderId = Number(body.order_id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return NextResponse.json({ error: "A valid order_id is required." }, { status: 400 });
    }

    const result = await pool.query(`
      UPDATE sales_orders
      SET queue_status = 'served', served_at = CURRENT_TIMESTAMP
      WHERE order_id = $1
        AND queue_status = 'waiting'
      RETURNING order_id, queue_number
    `, [orderId]);
    if (result.rowCount === 0) return NextResponse.json({ error: "Queue order was already served or not found." }, { status: 404 });
    return NextResponse.json({ data: result.rows[0] });
  } catch (error) {
    console.error("PATCH /api/queue failed:", error);
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "42703") {
      return NextResponse.json({ error: "The queue database fields are missing or do not match the current schema. Run queue-migration.sql, then reload the cashier." }, { status: 500 });
    }
    return NextResponse.json({ error: "Could not mark the queue order as served." }, { status: 500 });
  }
}
