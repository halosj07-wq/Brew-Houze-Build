import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSession } from "@/lib/sessions";

// Everything the Shift page shows about one shift: its totals and cash drawer, every order sold
// or reversed in it, who clocked in and out, stock changes recorded under it, what sold, and
// GCash payments still in progress. Without a shift_id it follows the open shift, or the last
// closed one while the store is closed.

const TZ = "Asia/Manila";
// Timestamps with a time zone need one conversion; sales_orders.created_at is stored in UTC
// without one, so it needs two.
const isoText = (column: string) => `TO_CHAR(${column} AT TIME ZONE '${TZ}', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"')`;
const orderCreatedText = `TO_CHAR(so.created_at AT TIME ZONE 'UTC' AT TIME ZONE '${TZ}', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"')`;

const optionalNumber = (value: unknown) => (value === null || value === undefined ? null : Number(value));

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  try {
    const requested = new URL(request.url).searchParams.get("shift_id");
    let shiftId: number | null = null;
    if (requested) {
      shiftId = Number(requested);
      if (!Number.isInteger(shiftId) || shiftId <= 0) return NextResponse.json({ error: "A valid shift_id is required." }, { status: 400 });
    } else {
      const current = await pool.query("SELECT shift_id FROM shifts ORDER BY (closed_at IS NULL) DESC, opened_at DESC LIMIT 1");
      shiftId = current.rows[0] ? Number(current.rows[0].shift_id) : null;
    }

    const recentShifts = await pool.query(`
      SELECT shift_id, closed_at IS NULL AS is_open, ${isoText("opened_at")} AS opened_at
      FROM shifts
      ORDER BY opened_at DESC
      LIMIT 60
    `);
    const shiftList = recentShifts.rows.map((row) => ({ shiftId: Number(row.shift_id), isOpen: Boolean(row.is_open), openedAt: row.opened_at as string }));
    if (shiftId === null) {
      return NextResponse.json({
        data: { shift: null, shifts: shiftList, orders: [], attendance: [], stock: [], products: [], payments: [], generatedAt: new Date().toISOString() },
      }, { headers: { "Cache-Control": "no-store" } });
    }

    const summaryResult = await pool.query(`
      SELECT ss.*, disc_id.sc_pwd_discount, disc_id.sc_pwd_count, disc_id.other_id_discount, disc_so.vat_exempt, disc_so.reward_discount,
        dlv.delivery_orders, dlv.delivery_fee_total, dlv.cod_order_total, dlv.delivered_count, dlv.failed_count, dlv.cod_with_riders,
        TO_CHAR(ss.business_date, 'YYYY-MM-DD') AS business_date_text,
        ${isoText("ss.opened_at")} AS opened_at_text,
        ${isoText("ss.closed_at")} AS closed_at_text,
        (SELECT shift_id FROM shifts WHERE opened_at < ss.opened_at ORDER BY opened_at DESC LIMIT 1) AS previous_shift_id,
        (SELECT shift_id FROM shifts WHERE opened_at > ss.opened_at ORDER BY opened_at ASC LIMIT 1) AS next_shift_id
      FROM shift_summaries ss
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(od.discount_amount) FILTER (WHERE od.type_code IN ('senior', 'pwd')), 0) AS sc_pwd_discount,
        COUNT(*) FILTER (WHERE od.type_code IN ('senior', 'pwd'))::int AS sc_pwd_count,
        COALESCE(SUM(od.discount_amount) FILTER (WHERE od.type_code NOT IN ('senior', 'pwd')), 0) AS other_id_discount
      FROM order_discounts od JOIN sales_orders dso ON dso.order_id = od.order_id
      WHERE dso.shift_id = ss.shift_id AND dso.status NOT IN ('void', 'voided', 'refund', 'refunded')
    ) disc_id ON TRUE
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(vat_exempt_amount), 0) AS vat_exempt,
        COALESCE(SUM(discount_amount) FILTER (WHERE discount_source IN ('reward', 'birthday')), 0) AS reward_discount
      FROM sales_orders WHERE shift_id = ss.shift_id AND status NOT IN ('void', 'voided', 'refund', 'refunded')
    ) disc_so ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*) FILTER (WHERE dso.status NOT IN ('void', 'voided', 'refund', 'refunded'))::int AS delivery_orders,
        COALESCE(SUM(dso.delivery_fee) FILTER (WHERE dso.status NOT IN ('void', 'voided', 'refund', 'refunded')), 0) AS delivery_fee_total,
        COALESCE(SUM(dso.total_amount) FILTER (WHERE d.payment = 'cod' AND dso.status NOT IN ('void', 'voided', 'refund', 'refunded')), 0) AS cod_order_total,
        COUNT(*) FILTER (WHERE d.status = 'delivered')::int AS delivered_count,
        COUNT(*) FILTER (WHERE d.status = 'failed')::int AS failed_count,
        COALESCE(SUM(d.cod_collected) FILTER (WHERE d.cod_remitted_at IS NULL), 0) AS cod_with_riders
      FROM deliveries d JOIN sales_orders dso ON dso.order_id = d.order_id
      WHERE dso.shift_id = ss.shift_id AND dso.is_archived = FALSE
    ) dlv ON TRUE
      WHERE ss.shift_id = $1
    `, [shiftId]);
    const row = summaryResult.rows[0];
    if (!row) return NextResponse.json({ error: "Shift not found." }, { status: 404 });
    const isOpen = row.closed_at_text === null;

    const [orders, attendance, stock, products, checkouts, movements, deliveries] = await Promise.all([
      pool.query(`
        SELECT so.order_id, so.queue_number, so.status, so.queue_status, so.total_amount, so.payment_method, so.order_source, so.discount_label, so.discount_amount + so.vat_exempt_amount AS discount_total, so.service_type,
          (SELECT d.status FROM deliveries d WHERE d.order_id = so.order_id) AS delivery_status,
          so.return_method, so.return_gcash_name, so.return_gcash_number, so.return_reference, so.cash_portion,
          so.shift_id = $1 AS sold_in_shift,
          COALESCE(so.reversed_shift_id = $1, FALSE) AS reversed_in_shift,
          ${orderCreatedText} AS created_at,
          ${isoText("so.reversed_at")} AS reversed_at,
          COALESCE(cashier.full_name, CASE WHEN so.order_source = 'online' THEN 'Mobile order' ELSE 'Unknown' END) AS punched_by,
          reverser.full_name AS reversed_by,
          COALESCE(STRING_AGG(p.product_name || COALESCE(' ' || NULLIF(pv.size_label, 'Regular'), '') || CASE WHEN soi.quantity > 1 THEN ' x' || soi.quantity::text ELSE '' END, ', ' ORDER BY soi.order_item_id), '') AS items
        FROM sales_orders so
        LEFT JOIN admin_users cashier ON cashier.admin_id = so.cashier_admin_id
        LEFT JOIN admin_users reverser ON reverser.admin_id = so.reversed_by_admin_id
        LEFT JOIN sales_order_items soi ON soi.order_id = so.order_id
        LEFT JOIN products p ON p.product_id = soi.product_id
        LEFT JOIN product_variants pv ON pv.product_variant_id = soi.product_variant_id
        WHERE (so.shift_id = $1 OR so.reversed_shift_id = $1) AND so.is_archived = FALSE
        GROUP BY so.order_id, cashier.full_name, reverser.full_name
        ORDER BY so.created_at DESC, so.order_id DESC
      `, [shiftId]),
      pool.query(`
        SELECT t.time_log_id, au.full_name, au.role,
          ${isoText("t.time_in")} AS time_in,
          ${isoText("t.time_out")} AS time_out
        FROM employee_time_logs t
        JOIN admin_users au ON au.admin_id = t.admin_id
        WHERE t.shift_id = $1 AND t.is_archived = FALSE
        ORDER BY t.time_in ASC
      `, [shiftId]),
      pool.query(`
        SELECT il.log_id, il.inventory_id, il.item_name, il.unit_of_measure, il.change_type, il.quantity_delta,
          il.quantity_after, il.order_id, il.packaging_name, il.packs_added, il.source_app,
          au.full_name AS admin_name,
          ${isoText("il.created_at")} AS created_at
        FROM inventory_log il
        LEFT JOIN admin_users au ON au.admin_id = il.admin_id
        WHERE il.shift_id = $1
        ORDER BY il.created_at DESC
        LIMIT 2000
      `, [shiftId]),
      pool.query(`
        SELECT p.product_name, COALESCE(p.product_category, '') AS category,
          SUM(soi.quantity)::int AS quantity, SUM(soi.quantity * soi.unit_price) AS revenue
        FROM sales_order_items soi
        JOIN sales_orders so ON so.order_id = soi.order_id
        JOIN products p ON p.product_id = soi.product_id
        WHERE so.shift_id = $1 AND so.is_archived = FALSE AND so.status NOT IN ('void', 'voided', 'refund', 'refunded')
        GROUP BY p.product_id, p.product_name, p.product_category
        ORDER BY quantity DESC, revenue DESC
      `, [shiftId]),
      // GCash payments started during this shift that have not become an order yet. The table
      // only exists after the PayMongo migration.
      pool.query(`
        SELECT to_regclass('public.payment_checkouts') IS NOT NULL AS available
      `).then(async (check) => check.rows[0]?.available
        ? pool.query(`
          SELECT pc.checkout_id, pc.source_app, pc.status, pc.amount, pc.error, ${isoText("pc.created_at")} AS created_at
          FROM payment_checkouts pc
          JOIN shifts sh ON sh.shift_id = $1
          WHERE pc.status IN ('awaiting_payment', 'needs_attention', 'failed')
            AND pc.created_at >= sh.opened_at AND pc.created_at <= COALESCE(sh.closed_at, CURRENT_TIMESTAMP)
          ORDER BY pc.created_at DESC
          LIMIT 50
        `, [shiftId])
        : { rows: [] as Record<string, unknown>[] }),
      // Cash put into or taken out of the drawer during the shift.
      pool.query(`
        SELECT cm.movement_id, cm.kind, cm.amount, cm.reason, cm.note, cm.source_app, au.full_name,
          ${isoText("cm.created_at")} AS created_at
        FROM cash_movements cm
        LEFT JOIN admin_users au ON au.admin_id = cm.admin_id
        WHERE cm.shift_id = $1
        ORDER BY cm.created_at DESC, cm.movement_id DESC
      `, [shiftId]),
      // Delivery orders sold in the shift, and cash on delivery handed in during it.
      pool.query(`
        SELECT d.delivery_id, d.order_id, so.queue_number, d.status, d.payment, d.fee, d.zone_name, d.cod_amount, d.cod_collected, d.failure_reason,
          so.shift_id = $1 AS sold_in_shift, so.status AS order_status, COALESCE(d.cod_remitted_shift_id = $1, FALSE) AS remitted_in_shift,
          rider.full_name AS rider_name, receiver.full_name AS remitted_to,
          ${isoText("d.picked_up_at")} AS picked_up_at, ${isoText("d.delivered_at")} AS delivered_at,
          ${isoText("d.failed_at")} AS failed_at, ${isoText("d.cod_remitted_at")} AS remitted_at
        FROM deliveries d
        JOIN sales_orders so ON so.order_id = d.order_id
        LEFT JOIN admin_users rider ON rider.admin_id = d.rider_admin_id
        LEFT JOIN admin_users receiver ON receiver.admin_id = d.cod_remitted_to
        WHERE (so.shift_id = $1 OR d.cod_remitted_shift_id = $1) AND so.is_archived = FALSE
        ORDER BY d.created_at ASC
      `, [shiftId]),
    ]);

    return NextResponse.json({
      data: {
        shifts: shiftList,
        shift: {
          shiftId: Number(row.shift_id),
          isOpen,
          businessDate: row.business_date_text as string,
          openedAt: row.opened_at_text as string,
          closedAt: (row.closed_at_text as string | null) ?? null,
          openedByName: (row.opened_by_name as string | null) ?? null,
          closedByName: (row.closed_by_name as string | null) ?? null,
          isHistorical: Boolean(row.is_historical),
          closingNotes: (row.closing_notes as string | null) ?? null,
          previousShiftId: optionalNumber(row.previous_shift_id),
          nextShiftId: optionalNumber(row.next_shift_id),
          startingCash: Number(row.starting_cash ?? 0),
          countedCash: optionalNumber(row.counted_cash),
          expectedCash: Number(row.expected_cash ?? 0),
          cashDifference: optionalNumber(row.cash_difference),
          orderCount: Number(row.order_count ?? 0),
          mobileOrderCount: Number(row.mobile_order_count ?? 0),
          itemsSold: Number(row.items_sold ?? 0),
          grossSales: Number(row.gross_sales ?? 0),
          discounts: { scPwd: Number(row.sc_pwd_discount ?? 0), scPwdCount: Number(row.sc_pwd_count ?? 0), vatExempt: Number(row.vat_exempt ?? 0), otherId: Number(row.other_id_discount ?? 0), rewards: Number(row.reward_discount ?? 0) },
          cashSales: Number(row.cash_sales ?? 0),
          onlineSales: Number(row.online_sales ?? 0),
          voidCount: Number(row.void_count ?? 0),
          refundCount: Number(row.refund_count ?? 0),
          reversedAmount: Number(row.reversed_amount ?? 0),
          cashReversed: Number(row.cash_reversed ?? 0),
          gcashReturned: Number(row.gcash_returned ?? 0),
          cashAdded: Number(row.cash_added ?? 0),
          cashRemoved: Number(row.cash_removed ?? 0),
          netSales: Number(row.net_sales ?? 0),
          costOfGoods: Number(row.cost_of_goods ?? 0),
          uncostedItems: Number(row.uncosted_items ?? 0),
          delivery: { orders: Number(row.delivery_orders ?? 0), fees: Number(row.delivery_fee_total ?? 0), codSales: Number(row.cod_order_total ?? 0), codReceived: Number(row.cod_remitted ?? 0), codWithRiders: Number(row.cod_with_riders ?? 0), delivered: Number(row.delivered_count ?? 0), failed: Number(row.failed_count ?? 0) },
        },
        orders: orders.rows.map((order) => ({
          orderId: Number(order.order_id),
          queueNumber: order.queue_number === null ? null : Number(order.queue_number),
          status: order.status as string,
          queueStatus: (order.queue_status as string | null) ?? null,
          total: Number(order.total_amount),
          discountLabel: (order.discount_label as string | null) ?? null, discountTotal: Number(order.discount_total ?? 0),
          paymentMethod: order.payment_method as string,
          orderSource: order.order_source as string,
          serviceType: (order.service_type as string | null) ?? null,
          deliveryStatus: (order.delivery_status as string | null) ?? null,
          soldInShift: Boolean(order.sold_in_shift),
          reversedInShift: Boolean(order.reversed_in_shift),
          createdAt: order.created_at as string,
          reversedAt: (order.reversed_at as string | null) ?? null,
          punchedBy: order.punched_by as string,
          reversedBy: (order.reversed_by as string | null) ?? null,
          returnMethod: (order.return_method as string | null) ?? null,
          cashPortion: order.cash_portion === null || order.cash_portion === undefined ? null : Number(order.cash_portion),
          returnGcashName: (order.return_gcash_name as string | null) ?? null,
          returnGcashNumber: (order.return_gcash_number as string | null) ?? null,
          returnReference: (order.return_reference as string | null) ?? null,
          items: order.items as string,
        })),
        attendance: attendance.rows.map((log) => ({
          id: Number(log.time_log_id),
          name: log.full_name as string,
          role: log.role as string,
          timeIn: log.time_in as string,
          timeOut: (log.time_out as string | null) ?? null,
        })),
        stock: stock.rows.map((log) => ({
          logId: Number(log.log_id),
          inventoryId: log.inventory_id === null ? null : Number(log.inventory_id),
          itemName: log.item_name as string,
          unit: log.unit_of_measure as string,
          changeType: log.change_type as string,
          delta: optionalNumber(log.quantity_delta),
          quantityAfter: optionalNumber(log.quantity_after),
          orderId: log.order_id === null ? null : Number(log.order_id),
          packagingName: (log.packaging_name as string | null) ?? null,
          packsAdded: optionalNumber(log.packs_added),
          sourceApp: (log.source_app as string | null) ?? null,
          adminName: (log.admin_name as string | null) ?? null,
          createdAt: log.created_at as string,
        })),
        products: products.rows.map((product) => ({ name: product.product_name as string, category: product.category as string, quantity: Number(product.quantity), revenue: Number(product.revenue) })),
        payments: checkouts.rows.map((checkout) => ({
          checkoutId: Number(checkout.checkout_id),
          sourceApp: checkout.source_app as string,
          status: checkout.status as string,
          amount: Number(checkout.amount),
          error: (checkout.error as string | null) ?? null,
          createdAt: checkout.created_at as string,
        })),
        deliveries: deliveries.rows.map((row) => ({
          id: Number(row.delivery_id), orderId: Number(row.order_id), queueNumber: row.queue_number === null ? null : Number(row.queue_number),
          status: String(row.status), payment: String(row.payment), fee: Number(row.fee), zone: String(row.zone_name),
          codAmount: row.cod_amount === null ? null : Number(row.cod_amount), codCollected: row.cod_collected === null ? null : Number(row.cod_collected),
          failureReason: (row.failure_reason as string | null) ?? null, soldInShift: Boolean(row.sold_in_shift), orderStatus: String(row.order_status),
          remittedInShift: Boolean(row.remitted_in_shift), rider: (row.rider_name as string | null) ?? null, remittedTo: (row.remitted_to as string | null) ?? null,
          pickedUpAt: (row.picked_up_at as string | null) ?? null, deliveredAt: (row.delivered_at as string | null) ?? null,
          failedAt: (row.failed_at as string | null) ?? null, remittedAt: (row.remitted_at as string | null) ?? null,
        })),
        movements: movements.rows.map((row) => ({
          id: Number(row.movement_id),
          kind: String(row.kind),
          amount: Number(row.amount),
          reason: String(row.reason),
          note: (row.note as string | null) ?? null,
          by: (row.full_name as string | null) ?? null,
          source: String(row.source_app),
          createdAt: String(row.created_at),
        })),
        generatedAt: new Date().toISOString(),
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/shift-activity failed:", error);
    return NextResponse.json({ error: "Could not load the shift." }, { status: 500 });
  }
}
