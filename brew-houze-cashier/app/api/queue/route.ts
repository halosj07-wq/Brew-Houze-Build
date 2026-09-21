import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

export async function GET(request: Request) {
  const session = verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

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
        so.order_source,
        TO_CHAR(so.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS created_at,
        COALESCE((
          SELECT json_agg(json_build_object(
            'product_name', detail_product.product_name,
            'size_label', detail_variant.size_label,
            'temperature', detail_variant.temperature,
            'quantity', detail_item.quantity,
            'additions', COALESCE((
              SELECT json_agg(json_build_object(
                'name', detail_addition.addition_name,
                'quantity', detail_addition_link.quantity
              ) ORDER BY detail_addition.addition_name)
              FROM sales_order_item_additions detail_addition_link
              JOIN additions detail_addition ON detail_addition.addition_id = detail_addition_link.addition_id
              WHERE detail_addition_link.order_item_id = detail_item.order_item_id
            ), '[]'::json)
          ) ORDER BY detail_item.order_item_id)
          FROM sales_order_items detail_item
          JOIN products detail_product ON detail_product.product_id = detail_item.product_id
          LEFT JOIN product_variants detail_variant ON detail_variant.product_variant_id = detail_item.product_variant_id
          WHERE detail_item.order_id = so.order_id
        ), '[]'::json) AS order_details,
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
    const recentResult = await pool.query(`
      SELECT so.order_id, so.queue_number, so.status, so.total_amount,
        TO_CHAR(so.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS created_at,
        COALESCE((
          SELECT json_agg(json_build_object(
            'product_name', detail_product.product_name,
            'size_label', detail_variant.size_label,
            'temperature', detail_variant.temperature,
            'quantity', detail_item.quantity,
            'additions', COALESCE((
              SELECT json_agg(json_build_object(
                'name', detail_addition.addition_name,
                'quantity', detail_addition_link.quantity
              ) ORDER BY detail_addition.addition_name)
              FROM sales_order_item_additions detail_addition_link
              JOIN additions detail_addition ON detail_addition.addition_id = detail_addition_link.addition_id
              WHERE detail_addition_link.order_item_id = detail_item.order_item_id
            ), '[]'::json)
          ) ORDER BY detail_item.order_item_id)
          FROM sales_order_items detail_item
          JOIN products detail_product ON detail_product.product_id = detail_item.product_id
          LEFT JOIN product_variants detail_variant ON detail_variant.product_variant_id = detail_item.product_variant_id
          WHERE detail_item.order_id = so.order_id
        ), '[]'::json) AS order_details,
        COALESCE(
          STRING_AGG(
            p.product_name || CASE
              WHEN pv.size_label IS NULL THEN ''
              ELSE ' (' || pv.size_label || CASE
                WHEN pv.temperature IN ('hot', 'cold') THEN ' · ' || INITCAP(pv.temperature)
                ELSE ''
              END || ')'
            END || ' x' || soi.quantity::text,
            ', ' ORDER BY p.product_name, pv.size_label, pv.temperature
          ), 'Order'
        ) AS items
      FROM sales_orders so
      JOIN sales_order_items soi ON soi.order_id = so.order_id
      JOIN products p ON p.product_id = soi.product_id
      LEFT JOIN product_variants pv ON pv.product_variant_id = soi.product_variant_id
      WHERE so.status IN ('completed', 'voided', 'refunded')
      GROUP BY so.order_id
      ORDER BY so.created_at DESC, so.order_id DESC
      LIMIT 30
    `);
    return NextResponse.json({
      data: {
        waiting: result.rows.filter((order) => order.queue_status === "waiting"),
        ready: result.rows.filter((order) => order.queue_status === "served"),
        recent: recentResult.rows,
      },
    });
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
    const body = await request.json() as { order_id?: unknown; action?: unknown };
    const orderId = Number(body.order_id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return NextResponse.json({ error: "A valid order_id is required." }, { status: 400 });
    }

    const action = body.action === "flush" ? "flush" : "serve";
    const result = await pool.query(`
      UPDATE sales_orders
      SET queue_status = ${action === "flush" ? "'flushed'" : "'served'"}, served_at = ${action === "flush" ? "served_at" : "CURRENT_TIMESTAMP"}
      WHERE order_id = $1
        AND queue_status = ${action === "flush" ? "'served'" : "'waiting'"}
      RETURNING order_id, queue_number
    `, [orderId]);
    if (result.rowCount === 0) return NextResponse.json({ error: action === "flush" ? "Ready order was already flushed or not found." : "Queue order was already moved to ready or not found." }, { status: 404 });
    return NextResponse.json({ data: result.rows[0] });
  } catch (error) {
    console.error("PATCH /api/queue failed:", error);
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "42703") {
      return NextResponse.json({ error: "The queue database fields are missing or do not match the current schema. Run queue-migration.sql, then reload the cashier." }, { status: 500 });
    }
    return NextResponse.json({ error: "Could not move the queue order to ready status." }, { status: 500 });
  }
}
