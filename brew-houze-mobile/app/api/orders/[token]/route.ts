import { NextResponse } from "next/server";
import pool from "@/lib/db";

// The status of an order the customer's phone follows: a mobile order, or a counter order made
// from a cart they sent to the counter (it takes the cart token, see lib/counter-carts.ts).
// parts: the bar and kitchen parts of the order and their progress; pickup_mode "separate" means
// each part is called on its own (see kitchen-stations-migration.sql).
export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) return NextResponse.json({ error: "Invalid tracking token." }, { status: 400 });

  try {
    const result = await pool.query(`
      SELECT order_id, queue_number, queue_status, order_source, service_type,
        (SELECT d.status FROM deliveries d WHERE d.order_id = sales_orders.order_id) AS delivery_status,
        (SELECT json_agg(json_build_object('station', os.station, 'status', os.status) ORDER BY os.station) FROM order_stations os WHERE os.order_id = sales_orders.order_id) AS parts,
        (SELECT setting_value FROM store_settings WHERE setting_key = 'pickup_mode') AS pickup_mode,
        TO_CHAR(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS created_at
      FROM sales_orders
      WHERE customer_order_token = $1::uuid
    `, [token]);
    if (result.rowCount === 0) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    return NextResponse.json({ data: result.rows[0] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/orders/[token] failed:", error);
    return NextResponse.json({ error: "Unable to retrieve order status." }, { status: 500 });
  }
}
