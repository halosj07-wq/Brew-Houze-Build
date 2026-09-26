import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

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
  const session = verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
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
