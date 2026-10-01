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

// Stock written off, one row per write-off: stock history entries (their shift's business day, or
// the calendar day without one) and made orders that were voided or refunded (the business day of
// the void or refund). reason is the write-off reason, or made_order for the orders.
const writtenOffCte = `
  written_off AS (
    SELECT COALESCE((sh.opened_at AT TIME ZONE '${TZ}')::date, (il.created_at AT TIME ZONE '${TZ}')::date) AS bd, il.write_off_reason AS reason, il.write_off_cost
    FROM inventory_log il LEFT JOIN shifts sh ON sh.shift_id = il.shift_id
    WHERE il.change_type = 'written_off'
    UNION ALL
    SELECT COALESCE((rs.opened_at AT TIME ZONE '${TZ}')::date, (so.reversed_at AT TIME ZONE '${TZ}')::date), 'made_order', so.wasted_cost
    FROM sales_orders so LEFT JOIN shifts rs ON rs.shift_id = so.reversed_shift_id
    WHERE so.reversed_after_made = TRUE AND so.is_archived = FALSE
  )`;

async function totals(start: string, end: string) {
  const result = await pool.query(`
    WITH ${ordersCte}, ${linesCte}, ${writtenOffCte}
    SELECT
      (SELECT COUNT(*) FILTER (WHERE NOT reversed) FROM o WHERE bd BETWEEN $1::date AND $2::date)::int AS orders,
      (SELECT COALESCE(SUM(total_amount) FILTER (WHERE NOT reversed), 0) FROM o WHERE bd BETWEEN $1::date AND $2::date) AS net_sales,
      (SELECT COALESCE(SUM(total_amount), 0) FROM o WHERE bd BETWEEN $1::date AND $2::date) AS gross_sales,
      (SELECT COUNT(*) FILTER (WHERE status IN ('void', 'voided')) FROM o WHERE bd BETWEEN $1::date AND $2::date)::int AS voids,
      (SELECT COUNT(*) FILTER (WHERE status IN ('refund', 'refunded')) FROM o WHERE bd BETWEEN $1::date AND $2::date)::int AS refunds,
      (SELECT COALESCE(SUM(total_amount) FILTER (WHERE reversed), 0) FROM o WHERE bd BETWEEN $1::date AND $2::date) AS reversed_amount,
      -- A split ticket counts its cash part as cash and the rest as online.
      (SELECT COALESCE(SUM(CASE COALESCE(payment_method, 'cash') WHEN 'cash' THEN total_amount WHEN 'split' THEN COALESCE(cash_portion, 0) ELSE 0 END) FILTER (WHERE NOT reversed AND COALESCE(order_source, '') <> 'online'), 0) FROM o WHERE bd BETWEEN $1::date AND $2::date) AS cash_sales,
      (SELECT COALESCE(SUM(CASE COALESCE(payment_method, 'cash') WHEN 'cash' THEN 0 WHEN 'split' THEN total_amount - COALESCE(cash_portion, 0) ELSE total_amount END) FILTER (WHERE NOT reversed AND COALESCE(order_source, '') <> 'online'), 0) FROM o WHERE bd BETWEEN $1::date AND $2::date) AS counter_online_sales,
      (SELECT COALESCE(SUM(total_amount) FILTER (WHERE NOT reversed AND order_source = 'online'), 0) FROM o WHERE bd BETWEEN $1::date AND $2::date) AS mobile_sales,
      (SELECT COUNT(*) FILTER (WHERE NOT reversed AND order_source = 'online') FROM o WHERE bd BETWEEN $1::date AND $2::date)::int AS mobile_orders,
      (SELECT COALESCE(SUM(quantity), 0) FROM lines)::int AS items_sold,
      (SELECT COALESCE(SUM(cost), 0) FROM lines) AS cost_of_goods,
      (SELECT COALESCE(SUM(base_revenue + addon_revenue) FILTER (WHERE cost IS NOT NULL), 0) FROM lines) AS costed_revenue,
      (SELECT COALESCE(SUM(quantity) FILTER (WHERE cost IS NULL), 0) FROM lines)::int AS uncosted_items,
      -- PayMongo fees on the GCash orders of the period, voided and refunded ones too (PayMongo
      -- keeps its fee when the money goes back to the customer). See treasury-paymongo-migration.sql.
      (SELECT COALESCE(SUM(payment_fee), 0) FROM o WHERE bd BETWEEN $1::date AND $2::date) AS payment_fees,
      (SELECT COUNT(*) FILTER (WHERE payment_provider = 'paymongo_gcash' AND payment_fee IS NULL) FROM o WHERE bd BETWEEN $1::date AND $2::date)::int AS unknown_fees,
      -- What the cafe spent to run in the period (see expenses-migration.sql), voided ones left out.
      (SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE voided_at IS NULL AND spent_on BETWEEN $1::date AND $2::date) AS expenses,
      -- Stock written off (see stock-write-off-migration.sql), and made orders voided or refunded
      -- (their ingredients were used up), on the business day it happened.
      (SELECT COALESCE(SUM(write_off_cost), 0) FROM written_off WHERE bd BETWEEN $1::date AND $2::date) AS written_off,
      (SELECT COUNT(*) FILTER (WHERE write_off_cost IS NULL) FROM written_off WHERE bd BETWEEN $1::date AND $2::date)::int AS uncosted_write_offs
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
    paymentFees: n(row.payment_fees),
    unknownFees: n(row.unknown_fees),
    expenses: n(row.expenses),
    writtenOff: n(row.written_off),
    uncostedWriteOffs: n(row.uncosted_write_offs),
    // Gross profit, minus PayMongo fees, minus expenses, minus stock written off.
    netProfit: costedRevenue - costOfGoods - n(row.payment_fees) - n(row.expenses) - n(row.written_off),
  };
}

// Loyalty in the range: sales from customers linked to their orders ("members"), stars given and
// spent, and the rewards given away. A reward is a line sold at ₱0: its normal price
// (reward_value) is what the customer got, and its cost is already in the cost of goods, so
// gross profit shows the true effect of the program.
async function loyaltyFigures(start: string, end: string) {
  const [orders, rewards, stars, discounts] = await Promise.all([
    pool.query(`
      WITH ${ordersCte}
      SELECT COUNT(*) FILTER (WHERE customer_id IS NOT NULL)::int AS member_orders,
        COALESCE(SUM(total_amount) FILTER (WHERE customer_id IS NOT NULL), 0) AS member_sales,
        COUNT(DISTINCT customer_id)::int AS members
      FROM o WHERE NOT o.reversed AND o.bd BETWEEN $1::date AND $2::date
    `, [start, end]),
    pool.query(`
      WITH ${ordersCte}
      SELECT COALESCE(lr.name, 'Removed reward') AS name, SUM(soi.quantity)::int AS claimed,
        COALESCE(SUM(soi.reward_value * soi.quantity), 0) AS value,
        SUM(soi.unit_cost * soi.quantity) AS cost, bool_and(soi.unit_cost IS NOT NULL) AS costed
      FROM o
      JOIN sales_order_items soi ON soi.order_id = o.order_id AND soi.reward_id IS NOT NULL
      LEFT JOIN loyalty_rewards lr ON lr.reward_id = soi.reward_id
      WHERE NOT o.reversed AND o.bd BETWEEN $1::date AND $2::date
      GROUP BY 1 ORDER BY claimed DESC, name
    `, [start, end]),
    pool.query(`
      SELECT COALESCE(SUM(stars) FILTER (WHERE kind IN ('earned', 'reversed')), 0)::int AS earned,
        COALESCE(-SUM(stars) FILTER (WHERE kind IN ('redeemed', 'restored')), 0)::int AS spent,
        COALESCE(SUM(stars) FILTER (WHERE kind = 'adjusted'), 0)::int AS adjusted
      FROM loyalty_star_entries
      WHERE (created_at AT TIME ZONE '${TZ}')::date BETWEEN $1::date AND $2::date
    `, [start, end]),
    // Discounts taken off completed orders: loyalty rewards, birthday treats and ID discounts (with
    // the VAT removed for senior and PWD).
    pool.query(`
      WITH ${ordersCte}
      SELECT COALESCE(discount_source, 'other') AS source, COUNT(*)::int AS orders, COALESCE(SUM(discount_amount), 0) AS amount,
        COALESCE(SUM(vat_exempt_amount), 0) AS vat_exempt
      FROM o WHERE NOT o.reversed AND o.bd BETWEEN $1::date AND $2::date AND (COALESCE(discount_amount, 0) > 0 OR COALESCE(vat_exempt_amount, 0) > 0)
      GROUP BY 1 ORDER BY amount DESC
    `, [start, end]),
  ]);
  const rewardRows = rewards.rows.map((row) => ({ name: String(row.name), claimed: n(row.claimed), value: n(row.value), cost: row.costed ? n(row.cost) : null }));
  return {
    memberOrders: n(orders.rows[0].member_orders),
    memberSales: n(orders.rows[0].member_sales),
    members: n(orders.rows[0].members),
    starsEarned: n(stars.rows[0].earned),
    starsSpent: n(stars.rows[0].spent),
    starsAdjusted: n(stars.rows[0].adjusted),
    rewardsClaimed: rewardRows.reduce((sum, row) => sum + row.claimed, 0),
    rewardValue: rewardRows.reduce((sum, row) => sum + row.value, 0),
    rewardCost: rewardRows.every((row) => row.cost !== null) ? rewardRows.reduce((sum, row) => sum + (row.cost ?? 0), 0) : null,
    rewards: rewardRows,
    discounts: discounts.rows.map((row) => ({ source: String(row.source), orders: n(row.orders), amount: n(row.amount), vatExempt: n(row.vat_exempt) })),
    discountTotal: discounts.rows.reduce((sum, row) => sum + n(row.amount), 0),
    vatExemptTotal: discounts.rows.reduce((sum, row) => sum + n(row.vat_exempt), 0),
  };
}

// Deliveries in the range, by the business date of the order: sales and fees (completed orders),
// cash on delivery collected and handed in, orders that could not be delivered, how long
// deliveries took, and the same per rider and per zone.
async function deliveryFigures(start: string, end: string) {
  const [totals, riders, zones, failures] = await Promise.all([
    pool.query(`
      WITH ${ordersCte}
      SELECT COUNT(*) FILTER (WHERE NOT o.reversed)::int AS orders,
        COALESCE(SUM(o.total_amount) FILTER (WHERE NOT o.reversed), 0) AS sales,
        COALESCE(SUM(o.delivery_fee) FILTER (WHERE NOT o.reversed), 0) AS fees,
        COUNT(*) FILTER (WHERE NOT o.reversed AND o.delivery_fee = 0)::int AS free_deliveries,
        COUNT(*) FILTER (WHERE NOT o.reversed AND d.payment = 'cod')::int AS cod_orders,
        COALESCE(SUM(o.total_amount) FILTER (WHERE NOT o.reversed AND d.payment = 'cod'), 0) AS cod_sales,
        COALESCE(SUM(d.cod_collected), 0) AS cod_collected,
        COALESCE(SUM(d.cod_collected) FILTER (WHERE d.cod_remitted_at IS NOT NULL), 0) AS cod_received,
        COALESCE(SUM(d.cod_collected) FILTER (WHERE d.cod_remitted_at IS NULL), 0) AS cod_with_riders,
        COUNT(*) FILTER (WHERE d.status = 'delivered')::int AS delivered,
        COUNT(*) FILTER (WHERE d.status = 'failed')::int AS failed,
        COUNT(*) FILTER (WHERE d.status = 'cancelled')::int AS cancelled,
        COUNT(*) FILTER (WHERE d.status IN ('preparing', 'ready', 'out') AND NOT o.reversed)::int AS active,
        AVG(EXTRACT(EPOCH FROM (d.delivered_at - d.created_at)) / 60) FILTER (WHERE d.status = 'delivered') AS avg_total_minutes,
        AVG(EXTRACT(EPOCH FROM (d.delivered_at - d.picked_up_at)) / 60) FILTER (WHERE d.status = 'delivered' AND d.picked_up_at IS NOT NULL) AS avg_road_minutes
      FROM o JOIN deliveries d ON d.order_id = o.order_id
      WHERE o.bd BETWEEN $1::date AND $2::date
    `, [start, end]),
    pool.query(`
      WITH ${ordersCte}
      SELECT d.rider_admin_id, MIN(r.full_name) AS name,
        COUNT(*) FILTER (WHERE d.status = 'delivered')::int AS delivered,
        COUNT(*) FILTER (WHERE d.status = 'failed')::int AS failed,
        COALESCE(SUM(o.delivery_fee) FILTER (WHERE d.status = 'delivered' AND NOT o.reversed), 0) AS fees,
        COALESCE(SUM(d.cod_collected), 0) AS cod_collected,
        COALESCE(SUM(d.cod_collected) FILTER (WHERE d.cod_remitted_at IS NULL), 0) AS cod_with_rider,
        AVG(EXTRACT(EPOCH FROM (d.delivered_at - d.picked_up_at)) / 60) FILTER (WHERE d.status = 'delivered' AND d.picked_up_at IS NOT NULL) AS avg_road_minutes
      FROM o JOIN deliveries d ON d.order_id = o.order_id
      LEFT JOIN admin_users r ON r.admin_id = d.rider_admin_id
      WHERE o.bd BETWEEN $1::date AND $2::date AND d.rider_admin_id IS NOT NULL
      GROUP BY d.rider_admin_id
      ORDER BY delivered DESC, name
    `, [start, end]),
    pool.query(`
      WITH ${ordersCte}
      SELECT d.zone_name AS name, COUNT(*)::int AS orders, COALESCE(SUM(o.delivery_fee), 0) AS fees, COALESCE(SUM(o.total_amount), 0) AS sales
      FROM o JOIN deliveries d ON d.order_id = o.order_id
      WHERE o.bd BETWEEN $1::date AND $2::date AND NOT o.reversed
      GROUP BY d.zone_name ORDER BY orders DESC, name
    `, [start, end]),
    pool.query(`
      WITH ${ordersCte}
      SELECT d.order_id, o.queue_number, d.zone_name, d.failure_reason, d.payment, o.total_amount, o.reversed, r.full_name AS rider,
        TO_CHAR(d.failed_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS failed_at
      FROM o JOIN deliveries d ON d.order_id = o.order_id
      LEFT JOIN admin_users r ON r.admin_id = d.rider_admin_id
      WHERE o.bd BETWEEN $1::date AND $2::date AND d.status = 'failed'
      ORDER BY d.failed_at DESC LIMIT 30
    `, [start, end]),
  ]);
  const row = totals.rows[0];
  const minutes = (value: unknown) => value === null || value === undefined ? null : Math.round(Number(value));
  return {
    orders: n(row.orders), sales: n(row.sales), fees: n(row.fees), freeDeliveries: n(row.free_deliveries),
    codOrders: n(row.cod_orders), codSales: n(row.cod_sales), codCollected: n(row.cod_collected), codReceived: n(row.cod_received), codWithRiders: n(row.cod_with_riders),
    delivered: n(row.delivered), failed: n(row.failed), cancelled: n(row.cancelled), active: n(row.active),
    avgTotalMinutes: minutes(row.avg_total_minutes), avgRoadMinutes: minutes(row.avg_road_minutes),
    riders: riders.rows.map((rider) => ({ name: String(rider.name ?? "Rider"), delivered: n(rider.delivered), failed: n(rider.failed), fees: n(rider.fees), codCollected: n(rider.cod_collected), codWithRider: n(rider.cod_with_rider), avgRoadMinutes: minutes(rider.avg_road_minutes) })),
    zones: zones.rows.map((zone) => ({ name: String(zone.name), orders: n(zone.orders), fees: n(zone.fees), sales: n(zone.sales) })),
    failures: failures.rows.map((failure) => ({ orderId: n(failure.order_id), queueNumber: failure.queue_number === null ? null : n(failure.queue_number), zone: String(failure.zone_name), reason: (failure.failure_reason as string | null) ?? null, payment: String(failure.payment), total: n(failure.total_amount), voided: Boolean(failure.reversed), rider: (failure.rider as string | null) ?? null, at: (failure.failed_at as string | null) ?? null })),
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
          o.return_method, o.return_gcash_name, o.return_gcash_number, o.return_reference, o.payment_provider, o.cash_portion,
          TO_CHAR(o.bd, 'YYYY-MM-DD') AS business_date,
          TO_CHAR(o.created_at AT TIME ZONE 'UTC' AT TIME ZONE '${TZ}', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS created_at,
          TO_CHAR(o.reversed_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS reversed_at,
          COALESCE(cashier.full_name, CASE WHEN o.order_source = 'online' THEN 'Mobile order' ELSE 'Unknown' END) AS punched_by,
          reverser.full_name AS reversed_by,
          cu.full_name AS customer_name, o.subtotal_amount, o.discount_amount, o.discount_label, o.service_type, o.vat_exempt_amount, o.delivery_fee,
          dl.recipient_name AS delivery_recipient, dl.phone AS delivery_phone, dl.street AS delivery_street, dl.landmark AS delivery_landmark, dl.zone_name AS delivery_zone,
          dl.status AS delivery_status, dl.cod_collected AS delivery_cod_collected, dl.failure_reason AS delivery_failure, drider.full_name AS delivery_rider, dreceiver.full_name AS delivery_received_by,
          TO_CHAR(dl.delivered_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS delivery_delivered_at,
          TO_CHAR(dl.cod_remitted_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS delivery_remitted_at,
          COALESCE(lines.items, '[]'::json) AS items,
          lines.cost AS cost
        FROM o
        LEFT JOIN admin_users cashier ON cashier.admin_id = o.cashier_admin_id
        LEFT JOIN admin_users reverser ON reverser.admin_id = o.reversed_by_admin_id
        LEFT JOIN customers cu ON cu.customer_id = o.customer_id AND cu.deleted_at IS NULL
        LEFT JOIN deliveries dl ON dl.order_id = o.order_id
        LEFT JOIN admin_users drider ON drider.admin_id = dl.rider_admin_id
        LEFT JOIN admin_users dreceiver ON dreceiver.admin_id = dl.cod_remitted_to
        LEFT JOIN LATERAL (
          SELECT
            json_agg(json_build_object(
              'productName', p.product_name,
              'category', COALESCE(NULLIF(TRIM(p.product_category), ''), 'Uncategorized'),
              'size', pv.size_label,
              'temperature', pv.temperature,
              'quantity', soi.quantity,
              'unitPrice', soi.unit_price,
              'rewardName', lr.name,
              'rewardValue', soi.reward_value,
              'custom', NULLIF(CONCAT_WS(' · ',
                (SELECT STRING_AGG(CASE WHEN custom->>'level' = 'none' THEN 'No ' ELSE 'Less ' END || (custom->>'name'), ', ')
                  FROM jsonb_array_elements(COALESCE(soi.customizations, '[]'::jsonb)) custom),
                NULLIF(soi.item_note, '')), ''),
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
          LEFT JOIN loyalty_rewards lr ON lr.reward_id = soi.reward_id
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
          customerName: row.customer_name ?? null,
          subtotal: row.subtotal_amount === null || row.subtotal_amount === undefined ? null : n(row.subtotal_amount),
          discountAmount: n(row.discount_amount),
          discountLabel: row.discount_label ?? null,
          vatExemptAmount: n(row.vat_exempt_amount ?? 0),
          deliveryFee: n(row.delivery_fee ?? 0),
          delivery: row.delivery_status ? {
            recipient: String(row.delivery_recipient), phone: String(row.delivery_phone), street: String(row.delivery_street),
            landmark: (row.delivery_landmark as string | null) ?? null, zone: String(row.delivery_zone), status: String(row.delivery_status),
            rider: (row.delivery_rider as string | null) ?? null, failureReason: (row.delivery_failure as string | null) ?? null,
            codCollected: row.delivery_cod_collected === null ? null : n(row.delivery_cod_collected), receivedBy: (row.delivery_received_by as string | null) ?? null,
            deliveredAt: (row.delivery_delivered_at as string | null) ?? null, remittedAt: (row.delivery_remitted_at as string | null) ?? null,
          } : null,
          serviceType: row.service_type ?? null,
          paymentProvider: row.payment_provider ?? null,
          cashPortion: row.cash_portion === null || row.cash_portion === undefined ? null : n(row.cash_portion),
          returnMethod: row.return_method ?? null,
          returnGcashName: row.return_gcash_name ?? null,
          returnGcashNumber: row.return_gcash_number ?? null,
          returnReference: row.return_reference ?? null,
          cost: row.cost === null ? null : n(row.cost),
          items: (row.items as { productName: string; category: string; size: string | null; temperature: string | null; quantity: number; unitPrice: number; rewardName: string | null; rewardValue: number | null; custom: string | null; additions: { name: string; quantity: number; unitPrice: number }[] }[]).map((item) => ({
            ...item,
            quantity: n(item.quantity),
            unitPrice: n(item.unitPrice),
            rewardValue: item.rewardValue === null || item.rewardValue === undefined ? null : n(item.rewardValue),
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

    // Dine in vs take out (completed orders; orders from before it was recorded count as unknown).
    const serviceTypes = await pool.query(`
      WITH ${ordersCte}
      SELECT COALESCE(service_type, 'unknown') AS service_type, COUNT(*)::int AS orders, COALESCE(SUM(total_amount), 0) AS sales
      FROM o WHERE NOT o.reversed AND o.bd BETWEEN $1::date AND $2::date
      GROUP BY 1 ORDER BY 1
    `, [start, end]).then((result) => result.rows.map((row) => ({ type: String(row.service_type), orders: n(row.orders), sales: n(row.sales) }))).catch(() => []);

    // Stock written off in the range, by reason.
    const writeOffs = await pool.query(`
      WITH ${writtenOffCte}
      SELECT reason, COUNT(*)::int AS entries, COALESCE(SUM(write_off_cost), 0) AS cost
      FROM written_off WHERE bd BETWEEN $1::date AND $2::date
      GROUP BY reason ORDER BY cost DESC
    `, [start, end]).then((result) => result.rows.map((row) => ({ reason: String(row.reason), entries: n(row.entries), cost: n(row.cost) }))).catch(() => []);

    const deliveries = await deliveryFigures(start, end).catch((deliveryError) => {
      console.error("GET /api/finance: delivery figures failed:", deliveryError);
      return null;
    });

    const loyalty = await loyaltyFigures(start, end).catch((loyaltyError) => {
      console.error("GET /api/finance: loyalty figures failed:", loyaltyError);
      return null;
    });

    return NextResponse.json({
      data: {
        loyalty,
        writeOffs,
        deliveries,
        serviceTypes,
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
