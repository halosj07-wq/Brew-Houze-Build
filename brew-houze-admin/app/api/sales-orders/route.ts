import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET(request: Request) {
  try {
    const period = new URL(request.url).searchParams.get("period") ?? "30";
    const selectedDate = new URL(request.url).searchParams.get("date") ?? "";
    const isCurrentWeek = period === "week";
    const days = period === "all" ? null : Number(period);
    if (!isCurrentWeek && days !== null && (![7, 30, 90].includes(days) || !Number.isInteger(days))) {
      return NextResponse.json({ error: "Period must be week, 7, 30, 90, or all." }, { status: 400 });
    }
    if (selectedDate && !/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) {
      return NextResponse.json({ error: "Date must use YYYY-MM-DD format." }, { status: 400 });
    }
    const periodClause = selectedDate
      ? "WHERE so.created_at >= $1::date AND so.created_at < ($1::date + INTERVAL '1 day')"
      : isCurrentWeek ? "WHERE so.created_at >= DATE_TRUNC('week', CURRENT_TIMESTAMP)"
      : days === null ? "" : "WHERE so.created_at >= CURRENT_TIMESTAMP - ($1::int * INTERVAL '1 day')";
    const params: (string | number)[] = selectedDate ? [selectedDate] : isCurrentWeek || days === null ? [] : [days];
    const additionTableResult = await pool.query(`
      SELECT to_regclass('public.sales_order_item_additions') IS NOT NULL AS available
    `);
    const additionsExpression = additionTableResult.rows[0]?.available
      ? `COALESCE((
          SELECT json_agg(json_build_object(
            'addition_id', a.addition_id,
            'addition_name', a.addition_name,
            'quantity', soia.quantity,
            'unit_price', soia.unit_price
          ) ORDER BY a.addition_name)
          FROM sales_order_item_additions soia
          JOIN additions a ON a.addition_id = soia.addition_id
          WHERE soia.order_item_id = soi.order_item_id
        ), '[]'::json)`
      : "'[]'::json";

    const result = await pool.query(`
      SELECT
        so.order_id,
        so.total_amount,
        so.status,
        so.created_at,
        COALESCE(
          json_agg(
            json_build_object(
              'product_id', soi.product_id,
              'product_name', p.product_name,
              'variant_id', soi.product_variant_id,
              'size_label', pv.size_label,
              'quantity', soi.quantity,
              'unit_price', soi.unit_price,
              'additions', ${additionsExpression}
            )
            ORDER BY soi.order_item_id
          ) FILTER (WHERE soi.order_item_id IS NOT NULL),
          '[]'::json
        ) AS items
      FROM sales_orders so
      LEFT JOIN sales_order_items soi ON soi.order_id = so.order_id
      LEFT JOIN products p ON p.product_id = soi.product_id
      LEFT JOIN product_variants pv ON pv.product_variant_id = soi.product_variant_id
      ${periodClause}
      GROUP BY so.order_id
      ORDER BY so.created_at DESC, so.order_id DESC
    `, params);

    const summaryResult = await pool.query(`
      SELECT
        COUNT(DISTINCT so.order_id)::int AS order_count,
        COALESCE(SUM(so.total_amount), 0) AS revenue,
        COALESCE(SUM(soi.quantity), 0)::int AS items_sold
      FROM sales_orders so
      LEFT JOIN sales_order_items soi ON soi.order_id = so.order_id
      ${periodClause}
    `, params);

    const topProductsResult = await pool.query(`
      SELECT p.product_name, COALESCE(SUM(soi.quantity), 0)::int AS quantity, COALESCE(SUM(soi.quantity * soi.unit_price), 0) AS revenue
      FROM sales_order_items soi
      JOIN sales_orders so ON so.order_id = soi.order_id
      JOIN products p ON p.product_id = soi.product_id
      ${periodClause}
      GROUP BY p.product_id, p.product_name
      ORDER BY quantity DESC, revenue DESC
      LIMIT 5
    `, params);

    const dailySalesResult = await pool.query(`
      SELECT
        DATE(so.created_at) AS sale_date,
        COUNT(DISTINCT so.order_id)::int AS order_count,
        COALESCE(SUM(so.total_amount), 0) AS revenue,
        COALESCE(SUM(soi.quantity), 0)::int AS items_sold
      FROM sales_orders so
      LEFT JOIN sales_order_items soi ON soi.order_id = so.order_id
      ${periodClause}
      GROUP BY DATE(so.created_at)
      ORDER BY sale_date DESC
    `, params);

    return NextResponse.json({
      data: result.rows,
      summary: summaryResult.rows[0],
      topProducts: topProductsResult.rows,
      dailySales: dailySalesResult.rows,
      period: isCurrentWeek ? "week" : period === "all" ? "all" : days,
    });
  } catch (error) {
    console.error("GET /api/sales-orders failed:", error);
    return NextResponse.json({ error: "Could not retrieve sales records." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const client = await pool.connect();
  try {
    const body = await request.json();
    const orderId = Number(body?.order_id);

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return NextResponse.json({ error: "A valid order_id is required." }, { status: 400 });
    }

    await client.query("BEGIN");
    const result = await client.query(
      "DELETE FROM sales_orders WHERE order_id = $1 RETURNING order_id",
      [orderId]
    );

    if (result.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Sales record not found." }, { status: 404 });
    }

    await client.query("COMMIT");
    return NextResponse.json({ data: { order_id: Number(result.rows[0].order_id) } });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("DELETE /api/sales-orders failed:", error);
    return NextResponse.json({ error: "Could not archive sales record." }, { status: 500 });
  } finally {
    client.release();
  }
}
