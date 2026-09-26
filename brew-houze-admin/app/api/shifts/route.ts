import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSession } from "@/lib/sessions";

// Shift reports for Finance. Shifts are opened/closed from the cashier app; totals come from
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
    netSales: Number(row.net_sales ?? 0),
    costOfGoods: Number(row.cost_of_goods ?? 0),
    uncostedItems: Number(row.uncosted_items ?? 0),
  };
}

const summarySelect = `
  SELECT
    ss.*,
    TO_CHAR(ss.business_date, 'YYYY-MM-DD') AS business_date_text,
    TO_CHAR(ss.opened_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS opened_at_text,
    TO_CHAR(ss.closed_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS closed_at_text,
    EXTRACT(EPOCH FROM (COALESCE(ss.closed_at, CURRENT_TIMESTAMP) - ss.opened_at)) / 3600 AS hours_open
  FROM shift_summaries ss
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
          so.order_id, so.queue_number, so.status, so.total_amount, so.payment_method, so.order_source,
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

      return NextResponse.json({
        data: {
          summary: mapSummary(summaryResult.rows[0]),
          orders: ordersResult.rows.map((row) => ({
            orderId: Number(row.order_id),
            queueNumber: row.queue_number === null ? null : Number(row.queue_number),
            status: row.status,
            total: Number(row.total_amount),
            paymentMethod: row.payment_method,
            orderSource: row.order_source,
            soldInShift: Boolean(row.sold_in_shift),
            reversedInShift: Boolean(row.reversed_in_shift),
            createdAt: row.created_at,
            reversedAt: row.reversed_at,
            punchedBy: row.punched_by,
            items: row.items,
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
// the cashier app: everyone is clocked out and signed out of the cashier app, and the queue clears.
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: { action?: unknown; starting_cash?: unknown; counted_cash?: unknown; shift_id?: unknown; notes?: unknown };
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
      const inserted = await client.query("INSERT INTO shifts (opened_by, starting_cash) VALUES ($1, $2) RETURNING shift_id", [session.adminId, startingCash]);
      const shiftId = Number(inserted.rows[0].shift_id);
      await client.query("UPDATE employee_time_logs SET shift_id = $1 WHERE time_out IS NULL AND shift_id IS NULL", [shiftId]);
      await client.query("COMMIT");
      const summary = await pool.query(`${summarySelect} WHERE ss.shift_id = $1`, [shiftId]);
      return NextResponse.json({ data: mapSummary(summary.rows[0]) }, { status: 201 });
    }

    if (body.action === "close") {
      const shiftId = Number(body.shift_id);
      const countedCash = parseAmount(body.counted_cash);
      const notes = String(body.notes ?? "").trim().slice(0, 500);
      if (!Number.isInteger(shiftId) || shiftId <= 0) return NextResponse.json({ error: "A valid shift is required." }, { status: 400 });
      if (countedCash === null) return NextResponse.json({ error: "Count the cash in the drawer and enter the amount (0 or more)." }, { status: 400 });
      await client.query("BEGIN");
      // Waits for any checkout still running in this shift (they hold a share lock on it).
      const locked = await client.query("SELECT shift_id FROM shifts WHERE shift_id = $1 AND closed_at IS NULL FOR UPDATE", [shiftId]);
      if (locked.rowCount === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "This shift was already closed. Refresh to see the current state." }, { status: 409 });
      }
      const expected = await client.query("SELECT expected_cash FROM shift_summaries WHERE shift_id = $1", [shiftId]);
      await client.query(`
        UPDATE shifts
        SET closed_at = CURRENT_TIMESTAMP, closed_by = $2, counted_cash = $3, expected_cash = $4, closing_notes = NULLIF($5, '')
        WHERE shift_id = $1
      `, [shiftId, session.adminId, countedCash, Number(expected.rows[0].expected_cash), notes]);
      await client.query("UPDATE employee_time_logs SET time_out = CURRENT_TIMESTAMP WHERE time_out IS NULL");
      await client.query("UPDATE user_sessions SET ended_at = CURRENT_TIMESTAMP, end_reason = 'shift_closed' WHERE app = 'cashier' AND ended_at IS NULL");
      await client.query("UPDATE sales_orders SET queue_status = 'flushed' WHERE queue_status IN ('waiting', 'served')");
      await client.query("COMMIT");
      const summary = await pool.query(`${summarySelect} WHERE ss.shift_id = $1`, [shiftId]);
      return NextResponse.json({ data: mapSummary(summary.rows[0]) });
    }

    return NextResponse.json({ error: "Unknown shift action." }, { status: 400 });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (error && typeof error === "object" && (error as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "A shift is already open. Refresh to see it." }, { status: 409 });
    }
    console.error("POST /api/shifts failed:", error);
    return NextResponse.json({ error: "Could not update the shift." }, { status: 500 });
  } finally {
    client.release();
  }
}