import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET(request: Request) {
  try {
    const signatureResult = await pool.query(`
      SELECT COUNT(*)::int AS total,
        COALESCE(MAX(order_id), 0)::int AS latest_order_id,
        COALESCE(MAX(served_at), TIMESTAMP 'epoch') AS latest_served_at
      FROM sales_orders
      WHERE queue_status IN ('waiting', 'served')
    `);
    if (new URL(request.url).searchParams.get("signatureOnly") === "1") {
      return NextResponse.json({ signature: signatureResult.rows[0] }, { headers: { "Cache-Control": "no-store" } });
    }
    const result = await pool.query(`
      SELECT
        so.order_id,
        so.queue_number,
        so.queue_status,
        TO_CHAR(so.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS created_at,
        COALESCE(
          STRING_AGG(
            p.product_name || CASE
              WHEN pv.size_label IS NULL THEN ''
              ELSE ' (' || pv.size_label || CASE
                WHEN pv.temperature IN ('hot', 'cold') THEN ' · ' || INITCAP(pv.temperature)
                ELSE ''
              END || ')'
            END
            || ' x' || soi.quantity::text,
            ', ' ORDER BY p.product_name, pv.size_label, pv.temperature
          ),
          'Order'
        ) AS items
      FROM sales_orders so
      JOIN sales_order_items soi ON soi.order_id = so.order_id
      JOIN products p ON p.product_id = soi.product_id
      LEFT JOIN product_variants pv ON pv.product_variant_id = soi.product_variant_id
      WHERE so.queue_status IN ('waiting', 'served')
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
