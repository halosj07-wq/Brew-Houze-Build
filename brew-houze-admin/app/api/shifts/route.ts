import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSession } from "@/lib/sessions";
import { lastFloatKept, pesoText, recordShiftDeposit, recordShiftFloat, recordShiftGcash, SafeShortError } from "@/lib/treasury";

// Shift reports for Finance. Shifts are opened/closed from the staff app; totals come from
// the shift_summaries view (see shift-migration.sql). A shift's business date is the date it
// opened, so an 8 PM–2 AM shift belongs to the evening it started.

type SummaryRow = Record<string, unknown>;

const optionalNumber = (value: unknown) => (value === null || value === undefined ? null : Number(value));

function mapSummary(row: SummaryRow) {
  return {
    shiftId: Number(row.shift_id),
    businessDate: row.business_date_text,
    openedAt: row.opened_at_text,
    closedAt: row.closed_at_text ?? null,
    openedByName: row.opened_by_name ?? null,
    closedByName: row.closed_by_name ?? null,
    isHistorical: Boolean(row.is_historical),
    closingNotes: row.closing_notes ?? null,
    hoursOpen: Number(row.hours_open ?? 0),
    startingCash: Number(row.starting_cash ?? 0),
    // Cash the last closing left in the drawer (the rest of the starting cash came from the safe),
    // and cash this closing left for the next shift (the rest went to the safe).
    carriedFloat: optionalNumber(row.carried_float),
    floatKept: optionalNumber(row.float_kept),
    countedCash: optionalNumber(row.counted_cash),
    expectedCash: Number(row.expected_cash ?? 0),
    cashDifference: optionalNumber(row.cash_difference),
    orderCount: Number(row.order_count ?? 0),
    mobileOrderCount: Number(row.mobile_order_count ?? 0),
    itemsSold: Number(row.items_sold ?? 0),
    grossSales: Number(row.gross_sales ?? 0),
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
    // Fees PayMongo kept on the shift's GCash orders (voided and refunded ones too).
    paymentFees: Number(row.payment_fees ?? 0),
    // Stock written off in the shift, made orders voided or refunded in it included.
    writtenOff: Number(row.written_off ?? 0),
    // Discounts in the shift's sales (already taken off the sales figures above).
    discounts: { scPwd: Number(row.sc_pwd_discount ?? 0), scPwdCount: Number(row.sc_pwd_count ?? 0), vatExempt: Number(row.vat_exempt ?? 0), otherId: Number(row.other_id_discount ?? 0), rewards: Number(row.reward_discount ?? 0) },
    // Delivery orders of the shift. codReceived: riders' cash on delivery handed in during the
    // shift (already in the expected cash); codWithRiders: collected but not handed in yet.
    delivery: { orders: Number(row.delivery_orders ?? 0), fees: Number(row.delivery_fee_total ?? 0), codSales: Number(row.cod_order_total ?? 0), codReceived: Number(row.cod_remitted ?? 0), codWithRiders: Number(row.cod_with_riders ?? 0), delivered: Number(row.delivered_count ?? 0), failed: Number(row.failed_count ?? 0) },
  };
}

const summarySelect = `
  SELECT
    ss.*, sx.carried_float, sx.float_kept, (SELECT COALESCE(SUM(payment_fee), 0) FROM sales_orders pf WHERE pf.shift_id = ss.shift_id) AS payment_fees,
    (SELECT COALESCE(SUM(write_off_cost), 0) FROM inventory_log wl WHERE wl.shift_id = ss.shift_id AND wl.change_type = 'written_off')
      + (SELECT COALESCE(SUM(wasted_cost), 0) FROM sales_orders wo WHERE wo.reversed_shift_id = ss.shift_id AND wo.reversed_after_made = TRUE) AS written_off, disc_id.sc_pwd_discount, disc_id.sc_pwd_count, disc_id.other_id_discount, disc_so.vat_exempt, disc_so.reward_discount,
    dlv.delivery_orders, dlv.delivery_fee_total, dlv.cod_order_total, dlv.delivered_count, dlv.failed_count, dlv.cod_with_riders,
    TO_CHAR(ss.business_date, 'YYYY-MM-DD') AS business_date_text,
    TO_CHAR(ss.opened_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS opened_at_text,
    TO_CHAR(ss.closed_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS closed_at_text,
    EXTRACT(EPOCH FROM (COALESCE(ss.closed_at, CURRENT_TIMESTAMP) - ss.opened_at)) / 3600 AS hours_open
  FROM shift_summaries ss
    JOIN shifts sx ON sx.shift_id = ss.shift_id
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
`;

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  try {
    const searchParams = new URL(request.url).searchParams;

    const shiftId = Number(searchParams.get("shift_id"));
    if (searchParams.has("shift_id")) {
      if (!Number.isInteger(shiftId) || shiftId <= 0) return NextResponse.json({ error: "A valid shift_id is required." }, { status: 400 });
      const summaryResult = await pool.query(`${summarySelect} WHERE ss.shift_id = $1`, [shiftId]);
      if (summaryResult.rowCount === 0) return NextResponse.json({ error: "Shift not found." }, { status: 404 });

      const ordersResult = await pool.query(`
        SELECT
          so.order_id, so.queue_number, so.status, so.total_amount, so.payment_method, so.order_source, so.discount_label, so.discount_amount + so.vat_exempt_amount AS discount_total, so.service_type,
          so.shift_id = $1 AS sold_in_shift,
          COALESCE(so.reversed_shift_id = $1, FALSE) AS reversed_in_shift,
          TO_CHAR(so.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS created_at,
          TO_CHAR(so.reversed_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS reversed_at,
          COALESCE(cashier.full_name, CASE WHEN so.order_source = 'online' THEN 'Mobile order' ELSE 'Unknown' END) AS punched_by,
          COALESCE(STRING_AGG(p.product_name || COALESCE(' ' || NULLIF(pv.size_label, 'Regular'), '') || ' x' || soi.quantity::text, ', ' ORDER BY soi.order_item_id), '') AS items
        FROM sales_orders so
        LEFT JOIN admin_users cashier ON cashier.admin_id = so.cashier_admin_id
        LEFT JOIN sales_order_items soi ON soi.order_id = so.order_id
        LEFT JOIN products p ON p.product_id = soi.product_id
        LEFT JOIN product_variants pv ON pv.product_variant_id = soi.product_variant_id
        WHERE (so.shift_id = $1 OR so.reversed_shift_id = $1) AND so.is_archived = FALSE
        GROUP BY so.order_id, cashier.full_name
        ORDER BY so.created_at ASC, so.order_id ASC
      `, [shiftId]);

      const attendanceResult = await pool.query(`
        SELECT t.time_log_id, au.full_name, au.role,
          TO_CHAR(t.time_in AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS time_in,
          TO_CHAR(t.time_out AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS time_out
        FROM employee_time_logs t
        JOIN admin_users au ON au.admin_id = t.admin_id
        WHERE t.shift_id = $1 AND t.is_archived = FALSE
        ORDER BY t.time_in ASC
      `, [shiftId]);

      // Delivery orders sold in the shift, and cash on delivery handed in during it.
      const deliveriesResult = await pool.query(`
        SELECT d.delivery_id, d.order_id, so.queue_number, d.status, CASE WHEN d.payment = 'gcash' AND so.payment_method = 'cash' THEN 'cash' ELSE d.payment END AS payment, d.fee, d.zone_name, d.cod_amount, d.cod_collected, d.failure_reason,
          so.shift_id = $1 AS sold_in_shift, so.status AS order_status, COALESCE(d.cod_remitted_shift_id = $1, FALSE) AS remitted_in_shift,
          rider.full_name AS rider_name, receiver.full_name AS remitted_to,
          TO_CHAR(d.picked_up_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS picked_up_at, TO_CHAR(d.delivered_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS delivered_at,
          TO_CHAR(d.failed_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS failed_at, TO_CHAR(d.cod_remitted_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS remitted_at
        FROM deliveries d
        JOIN sales_orders so ON so.order_id = d.order_id
        LEFT JOIN admin_users rider ON rider.admin_id = d.rider_admin_id
        LEFT JOIN admin_users receiver ON receiver.admin_id = d.cod_remitted_to
        WHERE (so.shift_id = $1 OR d.cod_remitted_shift_id = $1) AND so.is_archived = FALSE
        ORDER BY d.created_at ASC
      `, [shiftId]);

      const movementsResult = await pool.query(`
        SELECT cm.movement_id, cm.kind, cm.amount, cm.reason, cm.note, cm.source_app, au.full_name,
          TO_CHAR(cm.created_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS created_at
        FROM cash_movements cm
        LEFT JOIN admin_users au ON au.admin_id = cm.admin_id
        WHERE cm.shift_id = $1
        ORDER BY cm.created_at ASC, cm.movement_id ASC
      `, [shiftId]);

      // What the shift moved in and out of the safe (its float, cash drops and cash ins, closing).
      const safeResult = await pool.query(`
        SELECT te.entry_id, te.kind, te.amount, te.balance_after, te.reason, au.full_name,
          TO_CHAR(te.created_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS created_at
        FROM treasury_entries te
        LEFT JOIN admin_users au ON au.admin_id = te.admin_id
        WHERE te.shift_id = $1
        ORDER BY te.created_at ASC, te.entry_id ASC
      `, [shiftId]);
      return NextResponse.json({
        data: {
          summary: mapSummary(summaryResult.rows[0]),
          orders: ordersResult.rows.map((row) => ({
            orderId: Number(row.order_id),
            queueNumber: row.queue_number === null ? null : Number(row.queue_number),
            status: row.status,
            total: Number(row.total_amount),
            discountLabel: (row.discount_label as string | null) ?? null, discountTotal: Number(row.discount_total ?? 0),
            paymentMethod: row.payment_method,
            orderSource: row.order_source,
            serviceType: (row.service_type as string | null) ?? null,
            soldInShift: Boolean(row.sold_in_shift),
            reversedInShift: Boolean(row.reversed_in_shift),
            createdAt: row.created_at,
            reversedAt: row.reversed_at,
            punchedBy: row.punched_by,
            items: row.items,
          })),
          deliveries: deliveriesResult.rows.map((row) => ({
            id: Number(row.delivery_id), orderId: Number(row.order_id), queueNumber: row.queue_number === null ? null : Number(row.queue_number),
            status: String(row.status), payment: String(row.payment), fee: Number(row.fee), zone: String(row.zone_name),
            codAmount: row.cod_amount === null ? null : Number(row.cod_amount), codCollected: row.cod_collected === null ? null : Number(row.cod_collected),
            failureReason: (row.failure_reason as string | null) ?? null, soldInShift: Boolean(row.sold_in_shift), orderStatus: String(row.order_status),
            remittedInShift: Boolean(row.remitted_in_shift), rider: (row.rider_name as string | null) ?? null, remittedTo: (row.remitted_to as string | null) ?? null,
            pickedUpAt: (row.picked_up_at as string | null) ?? null, deliveredAt: (row.delivered_at as string | null) ?? null,
            failedAt: (row.failed_at as string | null) ?? null, remittedAt: (row.remitted_at as string | null) ?? null,
          })),
          movements: movementsResult.rows.map((row) => ({
            id: Number(row.movement_id),
            kind: String(row.kind),
            amount: Number(row.amount),
            reason: String(row.reason),
            note: row.note ?? null,
            by: row.full_name ?? null,
            source: String(row.source_app),
            createdAt: String(row.created_at),
          })),
          safeMoves: safeResult.rows.map((row) => ({
            id: Number(row.entry_id),
            kind: String(row.kind),
            amount: Number(row.amount),
            balanceAfter: Number(row.balance_after),
            reason: String(row.reason),
            by: row.full_name ?? null,
            createdAt: String(row.created_at),
          })),
          attendance: attendanceResult.rows.map((row) => ({
            id: Number(row.time_log_id),
            name: row.full_name,
            role: row.role,
            timeIn: row.time_in,
            timeOut: row.time_out,
          })),
        },
      }, { headers: { "Cache-Control": "no-store" } });
    }

    // A range of business dates (inclusive), used by the Finance date bar.
    const rangeStart = searchParams.get("start") ?? "";
    const rangeEnd = searchParams.get("end") ?? "";
    if (rangeStart || rangeEnd) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(rangeStart) || !/^\d{4}-\d{2}-\d{2}$/.test(rangeEnd) || rangeStart > rangeEnd) {
        return NextResponse.json({ error: "Choose a valid date range." }, { status: 400 });
      }
      const ranged = await pool.query(`
        ${summarySelect}
        WHERE ss.business_date BETWEEN $1::date AND $2::date
        ORDER BY ss.opened_at DESC
        LIMIT 500
      `, [rangeStart, rangeEnd]);
      return NextResponse.json({ data: ranged.rows.map(mapSummary) }, { headers: { "Cache-Control": "no-store" } });
    }

    const period = searchParams.get("period") ?? "30";
    const days = period === "all" || period === "week" ? null : Number(period);
    if (period !== "all" && period !== "week" && (!Number.isInteger(days) || ![7, 30, 90].includes(days ?? 0))) {
      return NextResponse.json({ error: "Period must be week, 7, 30, 90, or all." }, { status: 400 });
    }
    const today = "(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date";
    const where = period === "all"
      ? ""
      : period === "week"
        ? `WHERE ss.business_date >= DATE_TRUNC('week', ${today})::date`
        : `WHERE ss.business_date >= ${today} - ($1::int - 1)`;
    const result = await pool.query(`
      ${summarySelect}
      ${where}
      ORDER BY ss.opened_at DESC
      LIMIT 200
    `, days === null ? [] : [days]);

    return NextResponse.json({ data: result.rows.map(mapSummary) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/shifts failed:", error);
    return NextResponse.json({ error: "Could not retrieve shift reports." }, { status: 500 });
  }
}

function parseAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) / 100 : null;
}

// Opens or closes the store from the admin app. Opening does not clock the admin in (they may
// not be at the counter), but cashiers already signed in join the new shift. Closing works like
// the staff app: everyone is clocked out and signed out of the staff app, and the queue clears.
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: { action?: unknown; starting_cash?: unknown; counted_cash?: unknown; float_kept?: unknown; shift_id?: unknown; notes?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A valid shift action is required." }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    if (body.action === "open") {
      const startingCash = parseAmount(body.starting_cash);
      if (startingCash === null) return NextResponse.json({ error: "Enter the starting cash in the drawer (0 or more)." }, { status: 400 });
      await client.query("BEGIN");
      const carried = await lastFloatKept(client);
      const inserted = await client.query("INSERT INTO shifts (opened_by, starting_cash, carried_float) VALUES ($1, $2, $3) RETURNING shift_id", [session.adminId, startingCash, carried]);
      const shiftId = Number(inserted.rows[0].shift_id);
      // More than the last closing left in the drawer comes from the safe; less goes back to it.
      await recordShiftFloat(client, { shiftId, startingCash, carried, adminId: session.adminId, sourceApp: "admin" });
      // Whoever is already signed in to the Staff Portal joins the shift. Their attendance for it
      // starts now: time signed in before the shift opened does not count toward it.
      await client.query("UPDATE employee_time_logs SET shift_id = $1, time_in = GREATEST(time_in, CURRENT_TIMESTAMP) WHERE time_out IS NULL AND shift_id IS NULL", [shiftId]);
      await client.query("COMMIT");
      const summary = await pool.query(`${summarySelect} WHERE ss.shift_id = $1`, [shiftId]);
      return NextResponse.json({ data: mapSummary(summary.rows[0]) }, { status: 201 });
    }

    if (body.action === "close") {
      const shiftId = Number(body.shift_id);
      const countedCash = parseAmount(body.counted_cash);
      const notes = String(body.notes ?? "").trim().slice(0, 500);
      // Cash left in the drawer for the next shift; the rest of the count goes to the safe.
      const floatKept = body.float_kept === undefined ? 0 : parseAmount(body.float_kept);
      if (!Number.isInteger(shiftId) || shiftId <= 0) return NextResponse.json({ error: "A valid shift is required." }, { status: 400 });
      if (countedCash === null) return NextResponse.json({ error: "Count the cash in the drawer and enter the amount (0 or more)." }, { status: 400 });
      if (floatKept === null || floatKept > countedCash) return NextResponse.json({ error: "The cash left in the drawer can be ₱0 up to the counted cash." }, { status: 400 });
      await client.query("BEGIN");
      // Waits for any checkout still running in this shift (they hold a share lock on it).
      const locked = await client.query("SELECT shift_id FROM shifts WHERE shift_id = $1 AND closed_at IS NULL FOR UPDATE", [shiftId]);
      if (locked.rowCount === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "This shift was already closed. Refresh to see the current state." }, { status: 409 });
      }
      // Deliveries must be finished first: none in progress, every failed one voided, and every
      // rider's cash on delivery received into this drawer.
      const openDeliveries = (await client.query(`
        SELECT COUNT(*) FILTER (WHERE d.status IN ('preparing', 'ready', 'out') AND so.status = 'completed')::int AS active,
          COUNT(*) FILTER (WHERE d.status = 'failed' AND so.status = 'completed')::int AS failed,
          COUNT(*) FILTER (WHERE d.payment = 'cod' AND d.cod_collected IS NOT NULL AND d.cod_remitted_at IS NULL)::int AS cash
        FROM deliveries d JOIN sales_orders so ON so.order_id = d.order_id
      `)).rows[0];
      if (Number(openDeliveries.active) + Number(openDeliveries.failed) + Number(openDeliveries.cash) > 0) {
        await client.query("ROLLBACK");
        const parts = [Number(openDeliveries.active) ? `${openDeliveries.active} delivery${Number(openDeliveries.active) === 1 ? " is" : " orders are"} still in progress` : "", Number(openDeliveries.failed) ? `${openDeliveries.failed} failed delivery order${Number(openDeliveries.failed) === 1 ? " needs" : "s need"} voiding` : "", Number(openDeliveries.cash) ? `${openDeliveries.cash} rider cash on delivery payment${Number(openDeliveries.cash) === 1 ? " is" : "s are"} not received yet` : ""].filter(Boolean);
        return NextResponse.json({ error: `Finish the deliveries before closing: ${parts.join(", ")}. See the Deliveries page.` }, { status: 409 });
      }
      // GCash sent to the café's own QR from the mobile menu must be confirmed or rejected first:
      // once the shift closes, a confirmed payment has no shift to become an order in.
      const unchecked = Number((await client.query("SELECT COUNT(*)::int AS n FROM payment_checkouts WHERE provider = 'gcash_direct' AND status = 'awaiting_confirmation'")).rows[0].n);
      if (unchecked > 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: `Check the GCash payment${unchecked === 1 ? "" : "s"} from the mobile menu before closing: ${unchecked} ${unchecked === 1 ? "is" : "are"} waiting in the Staff Portal's Counter line.` }, { status: 409 });
      }
      const expected = await client.query("SELECT expected_cash FROM shift_summaries WHERE shift_id = $1", [shiftId]);
      await client.query(`
        UPDATE shifts
        SET closed_at = CURRENT_TIMESTAMP, closed_by = $2, counted_cash = $3, expected_cash = $4, closing_notes = NULLIF($5, ''), float_kept = $6
        WHERE shift_id = $1
      `, [shiftId, session.adminId, countedCash, Number(expected.rows[0].expected_cash), notes, floatKept]);
      await recordShiftDeposit(client, { shiftId, countedCash, floatKept, adminId: session.adminId, sourceApp: "admin" });
      await recordShiftGcash(client, { shiftId, adminId: session.adminId, sourceApp: "admin" });
      await client.query("UPDATE employee_time_logs SET time_out = CURRENT_TIMESTAMP WHERE time_out IS NULL");
      await client.query("UPDATE user_sessions SET ended_at = CURRENT_TIMESTAMP, end_reason = 'shift_closed' WHERE app = 'cashier' AND ended_at IS NULL");
      // Their bar and kitchen parts are closed too (see kitchen-stations-migration.sql).
      await client.query("UPDATE order_stations os SET status = 'picked_up', picked_up_at = COALESCE(os.picked_up_at, CURRENT_TIMESTAMP) FROM sales_orders so WHERE so.order_id = os.order_id AND so.queue_status IN ('waiting', 'served') AND os.status <> 'picked_up'");
      await client.query("UPDATE sales_orders SET queue_status = 'flushed' WHERE queue_status IN ('waiting', 'served')");
      await client.query("COMMIT");
      const summary = await pool.query(`${summarySelect} WHERE ss.shift_id = $1`, [shiftId]);
      return NextResponse.json({ data: mapSummary(summary.rows[0]) });
    }

    return NextResponse.json({ error: "Unknown shift action." }, { status: 400 });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (error instanceof SafeShortError) {
      return NextResponse.json({ error: `The safe only has ${pesoText(error.available)}, but this starting cash needs ${pesoText(error.needed)} from it. Start with less, or add cash to the safe in Treasury first.` }, { status: 409 });
    }
    if (error && typeof error === "object" && (error as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "A shift is already open. Refresh to see it." }, { status: 409 });
    }
    console.error("POST /api/shifts failed:", error);
    return NextResponse.json({ error: "Could not update the shift." }, { status: 500 });
  } finally {
    client.release();
  }
}