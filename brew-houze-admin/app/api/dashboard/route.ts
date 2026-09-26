import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSession } from "@/lib/sessions";

// Everything the Dashboard shows, in one request: the current shift (or the last one when the
// store is closed), the last 7 business days, what is selling, the live queue, who is clocked
// in, and the latest orders. Sales follow Finance: voided and refunded orders are left out, and
// an order's business date is the date its shift opened.

const TZ = "Asia/Manila";
const today = `(CURRENT_TIMESTAMP AT TIME ZONE '${TZ}')::date`;
const businessDateSql = `COALESCE((SELECT (sh.opened_at AT TIME ZONE '${TZ}')::date FROM shifts sh WHERE sh.shift_id = so.shift_id), DATE(so.created_at AT TIME ZONE 'UTC' AT TIME ZONE '${TZ}'))`;
const notReversed = "so.is_archived = FALSE AND so.status NOT IN ('void', 'voided', 'refund', 'refunded')";
const isoText = (column: string) => `TO_CHAR(${column} AT TIME ZONE '${TZ}', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"')`;

function mapShift(row: Record<string, unknown> | undefined) {
  if (!row) return null;
  return {
    shiftId: Number(row.shift_id),
    openedAt: row.opened_at_text as string,
    closedAt: (row.closed_at_text as string | null) ?? null,
    openedByName: (row.opened_by_name as string | null) ?? null,
    closedByName: (row.closed_by_name as string | null) ?? null,
    orderCount: Number(row.order_count ?? 0),
    mobileOrderCount: Number(row.mobile_order_count ?? 0),
    itemsSold: Number(row.items_sold ?? 0),
    grossSales: Number(row.gross_sales ?? 0),
    cashSales: Number(row.cash_sales ?? 0),
    onlineSales: Number(row.online_sales ?? 0),
    voidCount: Number(row.void_count ?? 0),
    refundCount: Number(row.refund_count ?? 0),
    reversedAmount: Number(row.reversed_amount ?? 0),
    netSales: Number(row.net_sales ?? 0),
    startingCash: Number(row.starting_cash ?? 0),
    expectedCash: Number(row.expected_cash ?? 0),
    countedCash: row.counted_cash === null || row.counted_cash === undefined ? null : Number(row.counted_cash),
    cashDifference: row.cash_difference === null || row.cash_difference === undefined ? null : Number(row.cash_difference),
    costOfGoods: Number(row.cost_of_goods ?? 0),
    uncostedItems: Number(row.uncosted_items ?? 0),
  };
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  try {
    const shiftSelect = `
      SELECT ss.*, ${isoText("ss.opened_at")} AS opened_at_text, ${isoText("ss.closed_at")} AS closed_at_text
      FROM shift_summaries ss
    `;
    const [openShift, lastShift] = await Promise.all([
      pool.query(`${shiftSelect} WHERE ss.closed_at IS NULL ORDER BY ss.opened_at DESC LIMIT 1`),
      pool.query(`${shiftSelect} WHERE ss.closed_at IS NOT NULL ORDER BY ss.closed_at DESC LIMIT 1`),
    ]);
    const shift = mapShift(openShift.rows[0]);
    const previousShift = mapShift(lastShift.rows[0]);
    // Hourly sales follow the open shift, or the last closed one while the store is closed.
    const hourlyShiftId = shift?.shiftId ?? previousShift?.shiftId ?? null;

    const [trend, costs, topProducts, hourly, queue, staff, recentOrders] = await Promise.all([
      // Last 14 business days, zero-filled, so the client can compare this week with the one before.
      pool.query(`
        WITH days AS (SELECT generate_series(${today} - 13, ${today}, INTERVAL '1 day')::date AS day),
        sales AS (
          SELECT ${businessDateSql} AS day, COUNT(*)::int AS orders, SUM(so.total_amount) AS revenue
          FROM sales_orders so
          WHERE ${notReversed}
          GROUP BY 1
        )
        SELECT TO_CHAR(days.day, 'YYYY-MM-DD') AS day, COALESCE(sales.orders, 0)::int AS orders, COALESCE(sales.revenue, 0) AS revenue
        FROM days LEFT JOIN sales ON sales.day = days.day
        ORDER BY days.day
      `),
      // Gross profit over the last 7 days, from the cost snapshot on each sold line. Lines with no
      // known cost are left out and counted, so a missing cost never reads as free.
      pool.query(`
        WITH lines AS (
          SELECT
            soi.quantity,
            soi.quantity * soi.unit_price + COALESCE(extra.revenue, 0) AS revenue,
            CASE WHEN soi.unit_cost IS NOT NULL AND COALESCE(extra.all_costed, TRUE)
              THEN soi.quantity * soi.unit_cost + COALESCE(extra.cost, 0) END AS cost
          FROM sales_order_items soi
          JOIN sales_orders so ON so.order_id = soi.order_id
          LEFT JOIN LATERAL (
            SELECT SUM(soia.quantity * soia.unit_price) AS revenue, SUM(soia.quantity * soia.unit_cost) AS cost, bool_and(soia.unit_cost IS NOT NULL) AS all_costed
            FROM sales_order_item_additions soia
            WHERE soia.order_item_id = soi.order_item_id
          ) extra ON TRUE
          WHERE ${notReversed} AND ${businessDateSql} >= ${today} - 6
        )
        SELECT
          COALESCE(SUM(cost), 0) AS cost_of_goods,
          COALESCE(SUM(revenue) FILTER (WHERE cost IS NOT NULL), 0) AS costed_revenue,
          COALESCE(SUM(quantity) FILTER (WHERE cost IS NULL), 0)::int AS uncosted_items,
          COALESCE(SUM(quantity), 0)::int AS items_sold
        FROM lines
      `),
      pool.query(`
        SELECT p.product_name, COALESCE(p.product_category, '') AS category,
          SUM(soi.quantity)::int AS quantity,
          SUM(soi.quantity * soi.unit_price) AS revenue
        FROM sales_order_items soi
        JOIN sales_orders so ON so.order_id = soi.order_id
        JOIN products p ON p.product_id = soi.product_id
        WHERE ${notReversed} AND ${businessDateSql} >= ${today} - 6
        GROUP BY p.product_id, p.product_name, p.product_category
        ORDER BY quantity DESC, revenue DESC
        LIMIT 5
      `),
      hourlyShiftId === null
        ? Promise.resolve({ rows: [] as Record<string, unknown>[] })
        : pool.query(`
          SELECT EXTRACT(HOUR FROM so.created_at AT TIME ZONE 'UTC' AT TIME ZONE '${TZ}')::int AS hour,
            COUNT(*)::int AS orders, SUM(so.total_amount) AS revenue
          FROM sales_orders so
          WHERE so.shift_id = $1 AND ${notReversed}
          GROUP BY 1
        `, [hourlyShiftId]),
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE queue_status = 'waiting')::int AS waiting,
          COUNT(*) FILTER (WHERE queue_status = 'served')::int AS ready
        FROM sales_orders
        WHERE queue_status IN ('waiting', 'served') AND is_archived = FALSE
      `),
      pool.query(`
        SELECT au.full_name, au.role, ${isoText("t.time_in")} AS time_in
        FROM employee_time_logs t
        JOIN admin_users au ON au.admin_id = t.admin_id
        WHERE t.time_out IS NULL AND t.is_archived = FALSE
        ORDER BY t.time_in ASC
      `),
      pool.query(`
        SELECT so.order_id, so.queue_number, so.status, so.total_amount, so.payment_method, so.order_source,
          TO_CHAR(so.created_at AT TIME ZONE 'UTC' AT TIME ZONE '${TZ}', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS created_at,
          COALESCE(cashier.full_name, CASE WHEN so.order_source = 'online' THEN 'Mobile order' ELSE 'Unknown' END) AS punched_by,
          COALESCE(STRING_AGG(p.product_name || COALESCE(' ' || NULLIF(pv.size_label, 'Regular'), '') || CASE WHEN soi.quantity > 1 THEN ' x' || soi.quantity::text ELSE '' END, ', ' ORDER BY soi.order_item_id), '') AS items
        FROM (
          SELECT * FROM sales_orders WHERE is_archived = FALSE ORDER BY created_at DESC, order_id DESC LIMIT 6
        ) so
        LEFT JOIN admin_users cashier ON cashier.admin_id = so.cashier_admin_id
        LEFT JOIN sales_order_items soi ON soi.order_id = so.order_id
        LEFT JOIN products p ON p.product_id = soi.product_id
        LEFT JOIN product_variants pv ON pv.product_variant_id = soi.product_variant_id
        GROUP BY so.order_id, so.queue_number, so.status, so.total_amount, so.payment_method, so.order_source, so.created_at, cashier.full_name
        ORDER BY so.created_at DESC, so.order_id DESC
      `),
    ]);

    const costRow = costs.rows[0];
    return NextResponse.json({
      data: {
        shift,
        previousShift,
        trend: trend.rows.map((row) => ({ day: row.day as string, orders: Number(row.orders), revenue: Number(row.revenue) })),
        week: {
          costOfGoods: Number(costRow.cost_of_goods),
          costedRevenue: Number(costRow.costed_revenue),
          uncostedItems: Number(costRow.uncosted_items),
          itemsSold: Number(costRow.items_sold),
        },
        topProducts: topProducts.rows.map((row) => ({ name: row.product_name as string, category: row.category as string, quantity: Number(row.quantity), revenue: Number(row.revenue) })),
        hourly: hourly.rows.map((row) => ({ hour: Number(row.hour), orders: Number(row.orders), revenue: Number(row.revenue) })),
        queue: { waiting: Number(queue.rows[0]?.waiting ?? 0), ready: Number(queue.rows[0]?.ready ?? 0) },
        staffOnDuty: staff.rows.map((row) => ({ name: row.full_name as string, role: row.role as string, timeIn: row.time_in as string })),
        recentOrders: recentOrders.rows.map((row) => ({
          orderId: Number(row.order_id),
          queueNumber: row.queue_number === null ? null : Number(row.queue_number),
          status: row.status as string,
          total: Number(row.total_amount),
          paymentMethod: row.payment_method as string,
          orderSource: row.order_source as string,
          createdAt: row.created_at as string,
          punchedBy: row.punched_by as string,
          items: row.items as string,
        })),
        generatedAt: new Date().toISOString(),
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/dashboard failed:", error);
    return NextResponse.json({ error: "Could not load the dashboard." }, { status: 500 });
  }
}
