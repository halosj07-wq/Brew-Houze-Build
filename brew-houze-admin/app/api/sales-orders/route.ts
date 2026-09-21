import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    if (searchParams.get("signatureOnly") === "1") {
      const signatureResult = await pool.query(`
        SELECT COUNT(*)::int AS total,
          COALESCE(MAX(order_id), 0)::int AS latest_order_id,
          COALESCE(MAX(created_at), TIMESTAMP 'epoch') AS latest_created_at,
          COALESCE(MAX(reversed_at), TIMESTAMP 'epoch') AS latest_reversed_at,
          COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_count,
          COUNT(*) FILTER (WHERE status = 'voided')::int AS voided_count,
          COUNT(*) FILTER (WHERE status = 'refunded')::int AS refunded_count
        FROM sales_orders
      `);
      return NextResponse.json({ signature: signatureResult.rows[0] }, { headers: { "Cache-Control": "no-store" } });
    }
    const period = searchParams.get("period") ?? "30";
    const dailySalesDate = searchParams.get("daily_date") ?? "";
    const orderHistoryDate = searchParams.get("history_date") ?? "";
    const dailySalesStart = searchParams.get("daily_start") ?? "";
    const dailySalesEnd = searchParams.get("daily_end") ?? "";
    const orderHistoryStart = searchParams.get("history_start") ?? "";
    const orderHistoryEnd = searchParams.get("history_end") ?? "";
    const excludeReversed = searchParams.get("exclude_reversed") === "1";
    const isCurrentWeek = period === "week";
    const days = period === "all" ? null : Number(period);
    if (!isCurrentWeek && days !== null && (![7, 30, 90].includes(days) || !Number.isInteger(days))) {
      return NextResponse.json({ error: "Period must be week, 7, 30, 90, or all." }, { status: 400 });
    }
    const dates = [dailySalesDate, dailySalesStart, dailySalesEnd, orderHistoryDate, orderHistoryStart, orderHistoryEnd];
    if (dates.some((date) => date && !/^\d{4}-\d{2}-\d{2}$/.test(date))) {
      return NextResponse.json({ error: "Dates must use YYYY-MM-DD format." }, { status: 400 });
    }
    if ((dailySalesStart && dailySalesEnd && dailySalesStart > dailySalesEnd) || (orderHistoryStart && orderHistoryEnd && orderHistoryStart > orderHistoryEnd)) {
      return NextResponse.json({ error: "Start dates must not be after end dates." }, { status: 400 });
    }
    const financeTimeZone = "Asia/Manila";
    const overviewClause = isCurrentWeek
      ? `WHERE so.status NOT IN ('void', 'voided', 'refund', 'refunded') AND DATE(so.created_at AT TIME ZONE 'UTC' AT TIME ZONE '${financeTimeZone}') >= DATE_TRUNC('week', (CURRENT_TIMESTAMP AT TIME ZONE '${financeTimeZone}')::date)::date`
      : days === null ? "WHERE so.status NOT IN ('void', 'voided', 'refund', 'refunded')" : `WHERE so.status NOT IN ('void', 'voided', 'refund', 'refunded') AND DATE(so.created_at AT TIME ZONE 'UTC' AT TIME ZONE '${financeTimeZone}') >= ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date - ($1::int - 1))`;
    const overviewParams: (string | number)[] = isCurrentWeek || days === null ? [] : [days];
    const dailyClause = dailySalesDate
      ? `WHERE so.status NOT IN ('void', 'voided', 'refund', 'refunded') AND DATE(so.created_at AT TIME ZONE 'UTC' AT TIME ZONE '${financeTimeZone}') = $1::date`
      : dailySalesStart || dailySalesEnd
        ? `WHERE so.status NOT IN ('void', 'voided', 'refund', 'refunded') AND DATE(so.created_at AT TIME ZONE 'UTC' AT TIME ZONE '${financeTimeZone}') >= $1::date AND DATE(so.created_at AT TIME ZONE 'UTC' AT TIME ZONE '${financeTimeZone}') <= $2::date`
        : isCurrentWeek
          ? `WHERE so.status NOT IN ('void', 'voided', 'refund', 'refunded') AND DATE(so.created_at AT TIME ZONE 'UTC' AT TIME ZONE '${financeTimeZone}') >= DATE_TRUNC('week', (CURRENT_TIMESTAMP AT TIME ZONE '${financeTimeZone}')::date)::date`
            : days === null ? "WHERE so.status NOT IN ('void', 'voided', 'refund', 'refunded')" : `WHERE so.status NOT IN ('void', 'voided', 'refund', 'refunded') AND DATE(so.created_at AT TIME ZONE 'UTC' AT TIME ZONE '${financeTimeZone}') >= ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date - ($1::int - 1))`;
    const dailyParams: (string | number)[] = dailySalesDate
      ? [dailySalesDate]
      : dailySalesStart || dailySalesEnd
        ? [dailySalesStart || dailySalesEnd, dailySalesEnd || dailySalesStart]
        : isCurrentWeek || days === null ? [] : [days];
    const historyClause = orderHistoryDate
      ? `WHERE ${excludeReversed ? "so.status NOT IN ('void', 'voided', 'refund', 'refunded') AND " : ""}DATE(so.created_at AT TIME ZONE 'UTC' AT TIME ZONE '${financeTimeZone}') = $1::date`
      : orderHistoryStart || orderHistoryEnd
        ? `WHERE ${excludeReversed ? "so.status NOT IN ('void', 'voided', 'refund', 'refunded') AND " : ""}DATE(so.created_at AT TIME ZONE 'UTC' AT TIME ZONE '${financeTimeZone}') >= $1::date AND DATE(so.created_at AT TIME ZONE 'UTC' AT TIME ZONE '${financeTimeZone}') <= $2::date`
        : isCurrentWeek
          ? `WHERE ${excludeReversed ? "so.status NOT IN ('void', 'voided', 'refund', 'refunded') AND " : ""}DATE(so.created_at AT TIME ZONE 'UTC' AT TIME ZONE '${financeTimeZone}') >= DATE_TRUNC('week', (CURRENT_TIMESTAMP AT TIME ZONE '${financeTimeZone}')::date)::date`
          : days === null
            ? excludeReversed ? "WHERE so.status NOT IN ('void', 'voided', 'refund', 'refunded')" : ""
            : `WHERE ${excludeReversed ? "so.status NOT IN ('void', 'voided', 'refund', 'refunded') AND " : ""}DATE(so.created_at AT TIME ZONE 'UTC' AT TIME ZONE '${financeTimeZone}') >= ((CURRENT_TIMESTAMP AT TIME ZONE '${financeTimeZone}')::date - ($1::int - 1))`;
    const historyParams: (string | number)[] = orderHistoryDate
      ? [orderHistoryDate]
      : orderHistoryStart || orderHistoryEnd
        ? [orderHistoryStart || orderHistoryEnd, orderHistoryEnd || orderHistoryStart]
        : isCurrentWeek || days === null ? [] : [days];
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
    const additionRevenueExpression = additionTableResult.rows[0]?.available
      ? `COALESCE((
          SELECT SUM(soia.quantity * soia.unit_price)
          FROM sales_order_item_additions soia
          WHERE soia.order_item_id = soi.order_item_id
        ), 0)`
      : "0";

    const result = await pool.query(`
      SELECT
        so.order_id,
        so.total_amount,
        so.received_amount,
        so.change_amount,
        so.payment_method,
        so.status,
        TO_CHAR(so.created_at AT TIME ZONE 'UTC' AT TIME ZONE '${financeTimeZone}', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS created_at,
        so.queue_number,
        so.queue_status,
        so.order_source,
        COALESCE(a.full_name, CASE WHEN so.order_source = 'online' THEN 'Online order' ELSE 'Unknown cashier' END) AS punched_by,
        COALESCE(
          json_agg(
            json_build_object(
              'product_id', soi.product_id,
              'product_name', p.product_name,
              'product_category', p.product_category,
              'variant_id', soi.product_variant_id,
              'size_label', pv.size_label,
              'temperature', pv.temperature,
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
      LEFT JOIN admin_users a ON a.admin_id = so.cashier_admin_id
      ${historyClause}
      GROUP BY so.order_id, a.full_name
      ORDER BY so.created_at DESC, so.order_id DESC
    `, historyParams);

    const summaryResult = await pool.query(`
      SELECT
        COUNT(*)::int AS order_count,
        COALESCE(SUM(so.total_amount), 0) AS revenue,
        COALESCE((
          SELECT SUM(soi.quantity)
          FROM sales_order_items soi
          WHERE soi.order_id IN (
            SELECT overview_orders.order_id
            FROM sales_orders overview_orders
            ${overviewClause.replaceAll("so.", "overview_orders.")}
          )
        ), 0)::int AS items_sold
      FROM sales_orders so
      ${overviewClause}
    `, overviewParams);

    const topProductsResult = await pool.query(`
      SELECT p.product_name,
        COALESCE(SUM(soi.quantity), 0)::int AS quantity,
        COALESCE(SUM(soi.quantity * soi.unit_price + ${additionRevenueExpression}), 0) AS revenue
      FROM sales_order_items soi
      JOIN sales_orders so ON so.order_id = soi.order_id
      JOIN products p ON p.product_id = soi.product_id
      ${overviewClause}
      GROUP BY p.product_id, p.product_name
      ORDER BY quantity DESC, revenue DESC
      LIMIT 5
    `, overviewParams);

    const dailySalesResult = await pool.query(`
      WITH filtered_orders AS (
        SELECT so.order_id, DATE(so.created_at AT TIME ZONE 'UTC' AT TIME ZONE '${financeTimeZone}') AS sale_date, so.total_amount
        FROM sales_orders so
        ${dailyClause}
      )
      SELECT
        TO_CHAR(filtered_orders.sale_date, 'YYYY-MM-DD') AS sale_date,
        COUNT(*)::int AS order_count,
        COALESCE(SUM(filtered_orders.total_amount), 0) AS revenue,
        COALESCE(SUM(item_totals.items_sold), 0)::int AS items_sold
      FROM filtered_orders
      LEFT JOIN (
        SELECT soi.order_id, SUM(soi.quantity)::int AS items_sold
        FROM sales_order_items soi
        GROUP BY soi.order_id
      ) item_totals ON item_totals.order_id = filtered_orders.order_id
      GROUP BY filtered_orders.sale_date
      ORDER BY filtered_orders.sale_date DESC
    `, dailyParams);

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

export async function PATCH(request: Request) {
  const client = await pool.connect();
  try {
    const body = await request.json();
    if (body?.action !== "clear_all" || body?.confirmation !== "CLEAR_FINANCE_RECORDS") {
      return NextResponse.json({ error: "Explicit finance records confirmation is required." }, { status: 400 });
    }

    await client.query("BEGIN");
    const result = await client.query("DELETE FROM sales_orders RETURNING order_id");
    await client.query("COMMIT");

    return NextResponse.json({ data: { deleted_count: result.rowCount ?? 0 } });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("PATCH /api/sales-orders failed:", error);
    return NextResponse.json({ error: "Could not clear finance records." }, { status: 500 });
  } finally {
    client.release();
  }
}
