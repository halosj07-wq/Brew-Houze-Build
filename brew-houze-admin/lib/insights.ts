import pool from "@/lib/db";

// The facts behind AI insights (see ai-insights-migration.sql): worked out here from the cafe's own
// records, so every number Claude sees is exact and Claude only ranks and words them. Only numbers,
// item and product names go out: no customer or staff personal details.
//
//   money     net sales, orders, cost of goods, PayMongo fees, expenses, stock written off and net
//             profit, this period and the one before (same length)
//   stock     items running out at their pace over the last 14 days: days left and the day they
//             run out, and items already at or below their low-stock alert
//   menu      best sellers, and products that sold little or nothing in the period
//   waste     stock written off by reason and the items that cost the most
//   expenses  by category, this period and the one before
//   payments  cash and GCash, and what PayMongo kept
//   drawer    shifts closed short or over
//   reversals voids and refunds, and how many were already made
//   hours     the busiest hours

const TZ = "Asia/Manila";
const round = (value: number, places = 2) => Math.round(value * 10 ** places) / 10 ** places;
const n = (value: unknown) => Number(value ?? 0);

function addDays(day: string, offset: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

// Orders by business day: the day their shift opened (after-midnight sales count toward their
// night), or their calendar day without a shift.
const ordersCte = `
  o AS (
    SELECT so.*, COALESCE((sh.opened_at AT TIME ZONE '${TZ}')::date, DATE(so.created_at AT TIME ZONE 'UTC' AT TIME ZONE '${TZ}')) AS bd,
      so.status IN ('void', 'voided', 'refund', 'refunded') AS reversed
    FROM sales_orders so LEFT JOIN shifts sh ON sh.shift_id = so.shift_id
    WHERE so.is_archived = FALSE
  )`;

const writtenOffCte = `
  written_off AS (
    SELECT COALESCE((sh.opened_at AT TIME ZONE '${TZ}')::date, (il.created_at AT TIME ZONE '${TZ}')::date) AS bd, il.write_off_reason AS reason, il.write_off_cost AS cost, il.item_name
    FROM inventory_log il LEFT JOIN shifts sh ON sh.shift_id = il.shift_id
    WHERE il.change_type = 'written_off'
    UNION ALL
    SELECT COALESCE((rs.opened_at AT TIME ZONE '${TZ}')::date, (so.reversed_at AT TIME ZONE '${TZ}')::date), 'made_order', so.wasted_cost, NULL
    FROM sales_orders so LEFT JOIN shifts rs ON rs.shift_id = so.reversed_shift_id
    WHERE so.reversed_after_made = TRUE AND so.is_archived = FALSE
  )`;

async function money(start: string, end: string) {
  const row = (await pool.query(`
    WITH ${ordersCte}, ${writtenOffCte},
    lines AS (
      SELECT soi.quantity * soi.unit_cost + COALESCE((SELECT SUM(soia.quantity * soia.unit_cost) FROM sales_order_item_additions soia WHERE soia.order_item_id = soi.order_item_id), 0) AS cost
      FROM o JOIN sales_order_items soi ON soi.order_id = o.order_id
      WHERE NOT o.reversed AND o.bd BETWEEN $1::date AND $2::date
    )
    SELECT
      (SELECT COUNT(*) FILTER (WHERE NOT reversed) FROM o WHERE bd BETWEEN $1::date AND $2::date)::int AS orders,
      (SELECT COALESCE(SUM(total_amount) FILTER (WHERE NOT reversed), 0) FROM o WHERE bd BETWEEN $1::date AND $2::date) AS net_sales,
      (SELECT COALESCE(SUM(cost), 0) FROM lines) AS cost_of_goods,
      (SELECT COUNT(*) FILTER (WHERE cost IS NULL) FROM lines)::int AS uncosted_lines,
      (SELECT COALESCE(SUM(payment_fee), 0) FROM o WHERE bd BETWEEN $1::date AND $2::date) AS paymongo_fees,
      (SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE voided_at IS NULL AND spent_on BETWEEN $1::date AND $2::date) AS expenses,
      (SELECT COALESCE(SUM(cost), 0) FROM written_off WHERE bd BETWEEN $1::date AND $2::date) AS written_off
  `, [start, end])).rows[0];
  const netSales = n(row.net_sales);
  const cost = n(row.cost_of_goods);
  const fees = n(row.paymongo_fees);
  const expenses = n(row.expenses);
  const writtenOff = n(row.written_off);
  return {
    orders: n(row.orders), net_sales: round(netSales), average_order: n(row.orders) ? round(netSales / n(row.orders)) : 0,
    cost_of_goods: round(cost), gross_profit: round(netSales - cost), paymongo_fees: round(fees), expenses: round(expenses),
    stock_written_off: round(writtenOff), net_profit: round(netSales - cost - fees - expenses - writtenOff),
    sold_lines_without_a_cost: n(row.uncosted_lines),
  };
}

// How long each stocked item lasts at its pace over the last 14 days (sales and write-offs, less
// what voids and refunds put back). Portions count against their source item, as stock does.
async function stockRunway(today: string) {
  const rows = (await pool.query(`
    WITH used AS (
      SELECT inventory_id, -SUM(quantity_delta) AS used
      FROM inventory_log
      WHERE change_type IN ('order_deduction', 'written_off', 'void_restore', 'refund_restore') AND created_at > CURRENT_TIMESTAMP - INTERVAL '14 days'
      GROUP BY inventory_id
    ),
    restocks AS (
      SELECT inventory_id, MAX(created_at) AS last_restock FROM inventory_log WHERE change_type = 'restocked' GROUP BY inventory_id
    )
    SELECT i.item_name, i.unit_of_measure, i.quantity, i.low_stock_threshold, COALESCE(u.used, 0) AS used_14_days,
      EXTRACT(DAY FROM CURRENT_TIMESTAMP - r.last_restock)::int AS days_since_restock
    FROM inventory i
    LEFT JOIN used u ON u.inventory_id = i.inventory_id
    LEFT JOIN restocks r ON r.inventory_id = i.inventory_id
    WHERE i.is_archived = FALSE AND i.derived_from_inventory_id IS NULL
  `)).rows;
  const now = Date.now();
  const items = rows.map((row) => {
    const onHand = Math.max(0, n(row.quantity));
    const perDay = Math.max(0, n(row.used_14_days)) / 14;
    const daysLeft = perDay > 0 ? onHand / perDay : null;
    const runsOut = daysLeft === null ? null : new Date(now + daysLeft * 86_400_000);
    return {
      item: String(row.item_name), unit: String(row.unit_of_measure ?? ""), on_hand: round(onHand, 3), low_stock_alert_at: round(n(row.low_stock_threshold), 3),
      used_per_day: round(perDay, 3), days_left: daysLeft === null ? null : round(daysLeft, 1),
      // e.g. "Thursday afternoon, Oct 9", in Philippine time.
      runs_out_around: runsOut === null || daysLeft === null || daysLeft > 60 ? null
        : `${runsOut.toLocaleDateString("en-PH", { timeZone: TZ, weekday: "long", month: "short", day: "numeric" })}, ${partOfDay(Number(runsOut.toLocaleString("en-US", { timeZone: TZ, hour: "numeric", hour12: false })))}`,
      days_since_last_restock: row.days_since_restock === null ? null : n(row.days_since_restock),
    };
  });
  return {
    as_of: today,
    running_out_within_10_days: items.filter((item) => item.days_left !== null && item.days_left <= 10).sort((a, b) => (a.days_left ?? 0) - (b.days_left ?? 0)).slice(0, 10),
    at_or_below_low_stock_alert: items.filter((item) => item.on_hand <= item.low_stock_alert_at).map((item) => ({ item: item.item, unit: item.unit, on_hand: item.on_hand, low_stock_alert_at: item.low_stock_alert_at })).slice(0, 10),
  };
}

function partOfDay(hour: number): string {
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

async function menu(start: string, end: string, days: number) {
  const [best, slow] = await Promise.all([
    pool.query(`
      WITH ${ordersCte}
      SELECT p.product_name, SUM(soi.quantity)::int AS sold, SUM(soi.quantity * soi.unit_price) AS sales
      FROM o JOIN sales_order_items soi ON soi.order_id = o.order_id JOIN products p ON p.product_id = soi.product_id
      WHERE NOT o.reversed AND o.bd BETWEEN $1::date AND $2::date
      GROUP BY p.product_name ORDER BY sold DESC LIMIT 5
    `, [start, end]),
    pool.query(`
      WITH ${ordersCte},
      sold AS (
        SELECT soi.product_id, SUM(soi.quantity)::int AS sold FROM o JOIN sales_order_items soi ON soi.order_id = o.order_id
        WHERE NOT o.reversed AND o.bd BETWEEN $1::date AND $2::date GROUP BY soi.product_id
      )
      SELECT p.product_name, COALESCE(s.sold, 0) AS sold
      FROM products p LEFT JOIN sold s ON s.product_id = p.product_id
      WHERE p.is_archived = FALSE AND COALESCE(s.sold, 0) <= GREATEST(2, $3::int / 7)
      ORDER BY sold ASC, p.product_name LIMIT 8
    `, [start, end, days]),
  ]);
  return {
    best_sellers: best.rows.map((row) => ({ product: String(row.product_name), sold: n(row.sold), sales: round(n(row.sales)) })),
    slow_sellers: slow.rows.map((row) => ({ product: String(row.product_name), sold: n(row.sold) })),
  };
}

async function waste(start: string, end: string) {
  const [byReason, topItems] = await Promise.all([
    pool.query(`WITH ${writtenOffCte} SELECT reason, COUNT(*)::int AS entries, COALESCE(SUM(cost), 0) AS cost FROM written_off WHERE bd BETWEEN $1::date AND $2::date GROUP BY reason ORDER BY cost DESC`, [start, end]),
    pool.query(`WITH ${writtenOffCte} SELECT item_name, COALESCE(SUM(cost), 0) AS cost FROM written_off WHERE item_name IS NOT NULL AND bd BETWEEN $1::date AND $2::date GROUP BY item_name ORDER BY cost DESC LIMIT 5`, [start, end]),
  ]);
  const reasonLabels: Record<string, string> = { expired: "expired or spoiled", damaged: "damaged", wasted: "spilled or wasted", in_house: "used in-house", other: "other", made_order: "made, then voided or refunded" };
  return {
    by_reason: byReason.rows.map((row) => ({ reason: reasonLabels[String(row.reason)] ?? String(row.reason), entries: n(row.entries), cost: round(n(row.cost)) })),
    costliest_items: topItems.rows.map((row) => ({ item: String(row.item_name), cost: round(n(row.cost)) })),
  };
}

async function expensesByCategory(start: string, end: string, previousStart: string, previousEnd: string) {
  const rows = (await pool.query(`
    SELECT category,
      COALESCE(SUM(amount) FILTER (WHERE spent_on BETWEEN $1::date AND $2::date), 0) AS this_period,
      COALESCE(SUM(amount) FILTER (WHERE spent_on BETWEEN $3::date AND $4::date), 0) AS period_before
    FROM expenses WHERE voided_at IS NULL AND spent_on BETWEEN $3::date AND $2::date
    GROUP BY category ORDER BY this_period DESC
  `, [start, end, previousStart, previousEnd])).rows;
  return rows.map((row) => ({ category: String(row.category), this_period: round(n(row.this_period)), period_before: round(n(row.period_before)) }));
}

async function operations(start: string, end: string) {
  const [payments, drawer, reversals, hours] = await Promise.all([
    pool.query(`
      WITH ${ordersCte}
      SELECT
        COALESCE(SUM(CASE COALESCE(payment_method, 'cash') WHEN 'cash' THEN total_amount WHEN 'cod' THEN total_amount WHEN 'split' THEN COALESCE(cash_portion, 0) ELSE 0 END) FILTER (WHERE NOT reversed), 0) AS cash,
        COALESCE(SUM(CASE COALESCE(payment_method, 'cash') WHEN 'cash' THEN 0 WHEN 'cod' THEN 0 WHEN 'split' THEN total_amount - COALESCE(cash_portion, 0) ELSE total_amount END) FILTER (WHERE NOT reversed), 0) AS gcash,
        COALESCE(SUM(payment_fee), 0) AS fees
      FROM o WHERE bd BETWEEN $1::date AND $2::date
    `, [start, end]),
    pool.query(`
      SELECT COUNT(*) FILTER (WHERE cash_difference <= -1)::int AS short_shifts, COALESCE(-SUM(cash_difference) FILTER (WHERE cash_difference <= -1), 0) AS short_total,
        COUNT(*) FILTER (WHERE cash_difference >= 1)::int AS over_shifts, COALESCE(SUM(cash_difference) FILTER (WHERE cash_difference >= 1), 0) AS over_total,
        COUNT(*)::int AS closed_shifts
      FROM shift_summaries WHERE closed_at IS NOT NULL AND business_date BETWEEN $1::date AND $2::date
    `, [start, end]),
    pool.query(`
      WITH ${ordersCte}
      SELECT COUNT(*) FILTER (WHERE status IN ('void', 'voided'))::int AS voids, COUNT(*) FILTER (WHERE status IN ('refund', 'refunded'))::int AS refunds,
        COALESCE(SUM(total_amount) FILTER (WHERE reversed), 0) AS amount, COUNT(*) FILTER (WHERE reversed AND reversed_after_made = TRUE)::int AS already_made
      FROM o WHERE bd BETWEEN $1::date AND $2::date
    `, [start, end]),
    pool.query(`
      WITH ${ordersCte}
      SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC' AT TIME ZONE '${TZ}')::int AS hour, COUNT(*)::int AS orders
      FROM o WHERE NOT reversed AND bd BETWEEN $1::date AND $2::date GROUP BY 1 ORDER BY orders DESC LIMIT 3
    `, [start, end]),
  ]);
  const pay = payments.rows[0];
  const gcash = n(pay.gcash);
  return {
    payments: { cash: round(n(pay.cash)), gcash_through_paymongo: round(gcash), paymongo_fees: round(n(pay.fees)), fee_percent_of_gcash: gcash > 0 ? round((n(pay.fees) / gcash) * 100, 1) : 0 },
    drawer: { closed_shifts: n(drawer.rows[0].closed_shifts), shifts_short: n(drawer.rows[0].short_shifts), total_short: round(n(drawer.rows[0].short_total)), shifts_over: n(drawer.rows[0].over_shifts), total_over: round(n(drawer.rows[0].over_total)) },
    voids_and_refunds: { voids: n(reversals.rows[0].voids), refunds: n(reversals.rows[0].refunds), amount: round(n(reversals.rows[0].amount)), already_made: n(reversals.rows[0].already_made) },
    busiest_hours: hours.rows.map((row) => ({ hour: `${(n(row.hour) % 12) || 12} ${n(row.hour) < 12 ? "AM" : "PM"}`, orders: n(row.orders) })),
  };
}

// Everything Claude is given for one period, with the period before for comparison.
export async function insightFacts(start: string, end: string, today: string) {
  const days = Math.round((new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) / 86_400_000) + 1;
  const previousEnd = addDays(start, -1);
  const previousStart = addDays(start, -days);
  const [current, previous, stock, menuFacts, wasteFacts, expenses, ops] = await Promise.all([
    money(start, end), money(previousStart, previousEnd), stockRunway(today), menu(start, end, days), waste(start, end),
    expensesByCategory(start, end, previousStart, previousEnd), operations(start, end),
  ]);
  return {
    cafe: "Brew Houze, a cafe in the Philippines. Amounts are in Philippine pesos.",
    period: { from: start, to: end, days, today },
    period_before: { from: previousStart, to: previousEnd },
    money: { this_period: current, period_before: previous },
    stock,
    menu: menuFacts,
    waste: wasteFacts,
    expenses_by_category: expenses,
    ...ops,
  };
}

export type InsightFacts = Awaited<ReturnType<typeof insightFacts>>;
