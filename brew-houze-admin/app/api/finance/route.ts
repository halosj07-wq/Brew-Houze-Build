import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSession } from "@/lib/sessions";

// Finance for a range of business dates (inclusive). An order's business date is the date its
// shift opened, so sales after midnight count toward the night they belong to; orders without a
// shift fall back to their calendar date (Asia/Manila).
//
//   GET /api/finance?start=YYYY-MM-DD&end=YYYY-MM-DD              -> overview figures
//   GET /api/finance?start=YYYY-MM-DD&end=YYYY-MM-DD&view=orders  -> every order in the range
//
// Net sales are completed orders only. Voided and refunded orders are reported separately under
// the business date they were sold on, so net sales = gross sales - voids/refunds.

const TZ = "Asia/Manila";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 400;
const ORDER_LIMIT = 5000;

const ordersCte = `
  o AS (
    SELECT so.*,
      COALESCE((sh.opened_at AT TIME ZONE '${TZ}')::date, DATE(so.created_at AT TIME ZONE 'UTC' AT TIME ZONE '${TZ}')) AS bd,
      so.status IN ('void', 'voided', 'refund', 'refunded') AS reversed
    FROM sales_orders so
    LEFT JOIN shifts sh ON sh.shift_id = so.shift_id
    WHERE so.is_archived = FALSE
  )`;

// One row per sold product line of a completed order, with its add-ons folded in. Cost is null
// when the line or any of its add-ons was sold without a known cost.
const linesCte = `
  lines AS (
    SELECT o.order_id, o.bd, o.cashier_admin_id, o.order_source, soi.product_id, soi.quantity,
      p.product_name, COALESCE(NULLIF(TRIM(p.product_category), ''), 'Uncategorized') AS category,
      soi.quantity * soi.unit_price AS base_revenue,
      COALESCE(x.revenue, 0) AS addon_revenue,
      CASE WHEN soi.unit_cost IS NOT NULL AND COALESCE(x.all_costed, TRUE) THEN soi.quantity * soi.unit_cost + COALESCE(x.cost, 0) END AS cost
    FROM o
    JOIN sales_order_items soi ON soi.order_id = o.order_id
    JOIN products p ON p.product_id = soi.product_id
    LEFT JOIN LATERAL (
      SELECT SUM(soia.quantity * soia.unit_price) AS revenue, SUM(soia.quantity * soia.unit_cost) AS cost, bool_and(soia.unit_cost IS NOT NULL) AS all_costed
      FROM sales_order_item_additions soia
      WHERE soia.order_item_id = soi.order_item_id
    ) x ON TRUE
    WHERE NOT o.reversed AND o.bd BETWEEN $1::date AND $2::date
  )`;

function addDays(day: string, offset: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string): number {
  return Math.round((new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) / 86_400_000) + 1;
}

const n = (value: unknown) => Number(value ?? 0);

async function totals(start: string, end: string) {
  const result = await pool.query(`
    WITH ${ordersCte}, ${linesCte}
    SELECT
      (SELECT COUNT(*) FILTER (WHERE NOT reversed) FROM o WHERE bd BETWEEN $1::date AND $2::date)::int AS orders,
      (SELECT COALESCE(SUM(total_amount) FILTER (WHERE NOT reversed), 0) FROM o WHERE bd BETWEEN $1::date AND $2::date) AS net_sales,
      (SELECT COALESCE(SUM(total_amount), 0) FROM o WHERE bd BETWEEN $1::date AND $2::date) AS gross_sales,
      (SELECT COUNT(*) FILTER (WHERE status IN ('void', 'voided')) FROM o WHERE bd BETWEEN $1::date AND $2::date)::int AS voids,
      (SELECT COUNT(*) FILTER (WHERE status IN ('refund', 'refunded')) FROM o WHERE bd BETWEEN $1::date AND $2::date)::int AS refunds,
      (SELECT COALESCE(SUM(total_amount) FILTER (WHERE reversed), 0) FROM o WHERE bd BETWEEN $1::date AND $2::date) AS reversed_amount,
      (SELECT COALESCE(SUM(total_amount) FILTER (WHERE NOT reversed AND COALESCE(order_source, '') <> 'online' AND COALESCE(payment_method, 'cash') = 'cash'), 0) FROM o WHERE bd BETWEEN $1::date AND $2::date) AS cash_sales,
      (SELECT COALESCE(SUM(total_amount) FILTER (WHERE NOT reversed AND COALESCE(order_source, '') <> 'online' AND COALESCE(payment_method, 'cash') <> 'cash'), 0) FROM o WHERE bd BETWEEN $1::date AND $2::date) AS counter_online_sales,
      (SELECT COALESCE(SUM(total_amount) FILTER (WHERE NOT reversed AND order_source = 'online'), 0) FROM o WHERE bd BETWEEN $1::date AND $2::date) AS mobile_sales,
      (SELECT COUNT(*) FILTER (WHERE NOT reversed AND order_source = 'online') FROM o WHERE bd BETWEEN $1::date AND $2::date)::int AS mobile_orders,
      (SELECT COALESCE(SUM(quantity), 0) FROM lines)::int AS items_sold,
      (SELECT COALESCE(SUM(cost), 0) FROM lines) AS cost_of_goods,
      (SELECT COALESCE(SUM(base_revenue + addon_revenue) FILTER (WHERE cost IS NOT NULL), 0) FROM lines) AS costed_revenue,
      (SELECT COALESCE(SUM(quantity) FILTER (WHERE cost IS NULL), 0) FROM lines)::int AS uncosted_items
  `, [start, end]);
  const row = result.rows[0];
  const costOfGoods = n(row.cost_of_goods);
  const costedRevenue = n(row.costed_revenue);
  return {
    orders: n(row.orders),
    netSales: n(row.net_sales),
    grossSales: n(row.gross_sales),
    voids: n(row.voids),
    refunds: n(row.refunds),
    reversedAmount: n(row.reversed_amount),
    cashSales: n(row.cash_sales),
    counterOnlineSales: n(row.counter_online_sales),
    mobileSales: n(row.mobile_sales),
    mobileOrders: n(row.mobile_orders),
    itemsSold: n(row.items_sold),
    costOfGoods,
    costedRevenue,
    grossProfit: costedRevenue - costOfGoods,
    uncostedItems: n(row.uncosted_items),
  };
}

export async function GET(request: Request) {
  if (!(await getSession())) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  try {
    const params = new URL(request.url).searchParams;
    const start = params.get("start") ?? "";
    const end = params.get("end") ?? "";
    if (!DATE_RE.test(start) || !DATE_RE.test(end)) return NextResponse.json({ error: "Dates must use YYYY-MM-DD format." }, { status: 400 });
    if (start > end) return NextResponse.json({ error: "The start date must not be after the end date." }, { status: 400 });
    const days = daysBetween(start, end);
    if (days > MAX_DAYS) return NextResponse.json({ error: `Choose a range of ${MAX_DAYS} days or less.` }, { status: 400 });

    if (params.get("view") === "orders") {
      const result = await pool.query(`
        WITH ${ordersCte}
        SELECT o.order_id, o.queue_number, o.status, o.total_amount, o.payment_method, o.order_source, o.received_amount, o.change_amount,
          o.shift_id, o.reversed_shift_id, o.reversal_type, o.reversed,
          TO_CHAR(o.bd, 'YYYY-MM-DD') AS business_date,
          TO_CHAR(o.created_at AT TIME ZONE 'UTC' AT TIME ZONE '${TZ}', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS created_at,
          TO_CHAR(o.reversed_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS reversed_at,
          COALESCE(cashier.full_name, CASE WHEN o.order_source = 'online' THEN 'Mobile order' ELSE 'Unknown' END) AS punched_by,
          reverser.full_name AS reversed_by,
          COALESCE(lines.items, '[]'::json) AS items,
          lines.cost AS cost
        FROM o
        LEFT JOIN admin_users cashier ON cashier.admin_id = o.cashier_admin_id
        LEFT JOIN admin_users reverser ON reverser.admin_id = o.reversed_by_admin_id
        LEFT JOIN LATERAL (
          SELECT
            json_agg(json_build_object(
              'productName', p.product_name,
              'category', COALESCE(NULLIF(TRIM(p.product_category), ''), 'Uncategorized'),
              'size', pv.size_label,
              'temperature', pv.temperature,
              'quantity', soi.quantity,
              'unitPrice', soi.unit_price,
              'additions', COALESCE((
                SELECT json_agg(json_build_object('name', a.addition_name, 'quantity', soia.quantity, 'unitPrice', soia.unit_price) ORDER BY a.addition_name)
                FROM sales_order_item_additions soia JOIN additions a ON a.addition_id = soia.addition_id
                WHERE soia.order_item_id = soi.order_item_id
              ), '[]'::json)
            ) ORDER BY soi.order_item_id) AS items,
            CASE WHEN bool_and(soi.unit_cost IS NOT NULL AND NOT EXISTS (
              SELECT 1 FROM sales_order_item_additions soia WHERE soia.order_item_id = soi.order_item_id AND soia.unit_cost IS NULL
            )) THEN SUM(soi.quantity * soi.unit_cost + COALESCE((
              SELECT SUM(soia.quantity * soia.unit_cost) FROM sales_order_item_additions soia WHERE soia.order_item_id = soi.order_item_id
            ), 0)) END AS cost
          FROM sales_order_items soi
          JOIN products p ON p.product_id = soi.product_id
          LEFT JOIN product_variants pv ON pv.product_variant_id = soi.product_variant_id
          WHERE soi.order_id = o.order_id
        ) lines ON TRUE
        WHERE o.bd BETWEEN $1::date AND $2::date
        ORDER BY o.created_at DESC, o.order_id DESC
        LIMIT ${ORDER_LIMIT + 1}
      `, [start, end]);
      const rows = result.rows.slice(0, ORDER_LIMIT);
      return NextResponse.json({
        data: rows.map((row) => ({
          orderId: n(row.order_id),
          queueNumber: row.queue_number === null ? null : n(row.queue_number),
          status: String(row.status),
          reversed: Boolean(row.reversed),
          total: n(row.total_amount),
          paymentMethod: row.payment_method ?? "cash",
          orderSource: row.order_source ?? "pos",
          received: row.received_amount === null ? null : n(row.received_amount),
          change: row.change_amount === null ? null : n(row.change_amount),
          shiftId: row.shift_id === null ? null : n(row.shift_id),
          reversedShiftId: row.reversed_shift_id === null ? null : n(row.reversed_shift_id),
          reversalType: row.reversal_type ?? null,
          businessDate: row.business_date,
          createdAt: row.created_at,
          reversedAt: row.reversed_at,
          punchedBy: row.punched_by,
          reversedBy: row.reversed_by ?? null,
          cost: row.cost === null ? null : n(row.cost),
          items: (row.items as { productName: string; category: string; size: string | null; temperature: string | null; quantity: number; unitPrice: number; additions: { name: string; quantity: number; unitPrice: number }[] }[]).map((item) => ({
            ...item,
            quantity: n(item.quantity),
            unitPrice: n(item.unitPrice),
            additions: item.additions.map((addition) => ({ ...addition, quantity: n(addition.quantity), unitPrice: n(addition.unitPrice) })),
          })),
        })),
        truncated: result.rows.length > ORDER_LIMIT,
      }, { headers: { "Cache-Control": "no-store" } });
    }

    const previousEnd = addDays(start, -1);
    const previousStart = addDays(start, -days);
    const [current, previous, daily, categories, products, addons, hours, staff] = await Promise.all([
      totals(start, end),
      totals(previousStart, previousEnd),
      pool.query(`
        WITH ${ordersCte},
        days AS (SELECT generate_series($1::date, $2::date, INTERVAL '1 day')::date AS day)
        SELECT TO_CHAR(days.day, 'YYYY-MM-DD') AS day,
          COUNT(o.order_id) FILTER (WHERE NOT o.reversed)::int AS orders,
          COALESCE(SUM(o.total_amount) FILTER (WHERE NOT o.reversed), 0) AS net_sales,
          COALESCE(SUM(o.total_amount) FILTER (WHERE o.reversed), 0) AS reversed_amount
        FROM days LEFT JOIN o ON o.bd = days.day
        GROUP BY days.day ORDER BY days.day
      `, [start, end]),
      pool.query(`
        WITH ${ordersCte}, ${linesCte}
        SELECT category, SUM(quantity)::int AS quantity, SUM(base_revenue + addon_revenue) AS revenue
        FROM lines GROUP BY category ORDER BY revenue DESC
      `, [start, end]),
      pool.query(`
        WITH ${ordersCte}, ${linesCte}
        SELECT product_id, product_name, category, SUM(quantity)::int AS quantity, SUM(base_revenue + addon_revenue) AS revenue,
          CASE WHEN bool_and(cost IS NOT NULL) THEN SUM(cost) END AS cost
        FROM lines GROUP BY product_id, product_name, category ORDER BY revenue DESC LIMIT 50
      `, [start, end]),
      pool.query(`
        WITH ${ordersCte}
        SELECT a.addition_name, SUM(soia.quantity) AS quantity, SUM(soia.quantity * soia.unit_price) AS revenue
        FROM o
        JOIN sales_order_items soi ON soi.order_id = o.order_id
        JOIN sales_order_item_additions soia ON soia.order_item_id = soi.order_item_id
        JOIN additions a ON a.addition_id = soia.addition_id
        WHERE NOT o.reversed AND o.bd BETWEEN $1::date AND $2::date
        GROUP BY a.addition_name ORDER BY revenue DESC
      `, [start, end]),
      pool.query(`
        WITH ${ordersCte}
        SELECT EXTRACT(HOUR FROM o.created_at AT TIME ZONE 'UTC' AT TIME ZONE '${TZ}')::int AS hour,
          COUNT(*)::int AS orders, SUM(o.total_amount) AS revenue
        FROM o WHERE NOT o.reversed AND o.bd BETWEEN $1::date AND $2::date
        GROUP BY 1 ORDER BY 1
      `, [start, end]),
      pool.query(`
        WITH ${ordersCte}
        SELECT COALESCE(cashier.full_name, CASE WHEN o.order_source = 'online' THEN 'Mobile menu' ELSE 'Unknown' END) AS name,
          COALESCE(cashier.role, CASE WHEN o.order_source = 'online' THEN 'online' ELSE '' END) AS role,
          COUNT(*) FILTER (WHERE NOT o.reversed)::int AS orders,
          COALESCE(SUM(o.total_amount) FILTER (WHERE NOT o.reversed), 0) AS revenue,
          COUNT(*) FILTER (WHERE o.reversed)::int AS reversed_orders,
          COALESCE(SUM(o.total_amount) FILTER (WHERE o.reversed), 0) AS reversed_amount
        FROM o LEFT JOIN admin_users cashier ON cashier.admin_id = o.cashier_admin_id
        WHERE o.bd BETWEEN $1::date AND $2::date
        GROUP BY 1, 2 ORDER BY revenue DESC
      `, [start, end]),
    ]);

    return NextResponse.json({
      data: {
        range: { start, end, days },
        previousRange: { start: previousStart, end: previousEnd },
        current,
        previous,
        daily: daily.rows.map((row) => ({ day: row.day, orders: n(row.orders), netSales: n(row.net_sales), reversedAmount: n(row.reversed_amount) })),
        categories: categories.rows.map((row) => ({ name: row.category, quantity: n(row.quantity), revenue: n(row.revenue) })),
        products: products.rows.map((row) => ({ productId: n(row.product_id), name: row.product_name, category: row.category, quantity: n(row.quantity), revenue: n(row.revenue), cost: row.cost === null ? null : n(row.cost) })),
        addons: addons.rows.map((row) => ({ name: row.addition_name, quantity: n(row.quantity), revenue: n(row.revenue) })),
        hours: hours.rows.map((row) => ({ hour: n(row.hour), orders: n(row.orders), revenue: n(row.revenue) })),
        staff: staff.rows.map((row) => ({ name: row.name, role: row.role, orders: n(row.orders), revenue: n(row.revenue), reversedOrders: n(row.reversed_orders), reversedAmount: n(row.reversed_amount) })),
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/finance failed:", error);
    return NextResponse.json({ error: "Could not load finance figures." }, { status: 500 });
  }
}
