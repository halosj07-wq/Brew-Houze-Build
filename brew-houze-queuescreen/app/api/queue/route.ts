import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET() {
  try {
    const result = await pool.query(`
      SELECT
        so.order_id,
        so.queue_number,
        so.queue_status,
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
        AND so.queue_status IN ('waiting', 'served')
      GROUP BY so.order_id
      ORDER BY so.queue_status DESC, so.queue_number ASC
    `);

    return NextResponse.json({
      data: {
        waiting: result.rows.filter((order) => order.queue_status === "waiting"),
        ready: result.rows.filter((order) => order.queue_status === "served"),
      },
      updatedAt: new Date().toISOString(),
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("GET /api/queue failed:", error);
    return NextResponse.json({ error: "Could not retrieve the queue." }, { status: 500 });
  }
}
