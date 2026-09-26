import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { PoolClient } from "pg";
import pool from "@/lib/db";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

// A shift is the café's business day: opened and closed manually by any cashier, and it may
// run past midnight. Totals come from the shift_summaries view (see shift-migration.sql).

type SummaryRow = Record<string, unknown>;

function toNumber(value: unknown): number {
  return Number(value ?? 0);
}

function mapSummary(row: SummaryRow) {
  return {
    shiftId: toNumber(row.shift_id),
    openedAt: row.opened_at,
    closedAt: row.closed_at ?? null,
    openedByName: row.opened_by_name ?? null,
    closedByName: row.closed_by_name ?? null,
    startingCash: toNumber(row.starting_cash),
    countedCash: row.counted_cash === null || row.counted_cash === undefined ? null : toNumber(row.counted_cash),
    orderCount: toNumber(row.order_count),
    mobileOrderCount: toNumber(row.mobile_order_count),
    itemsSold: toNumber(row.items_sold),
    grossSales: toNumber(row.gross_sales),
    cashSales: toNumber(row.cash_sales),
    onlineSales: toNumber(row.online_sales),
    voidCount: toNumber(row.void_count),
    refundCount: toNumber(row.refund_count),
    reversedAmount: toNumber(row.reversed_amount),
    cashReversed: toNumber(row.cash_reversed),
    netSales: toNumber(row.net_sales),
    expectedCash: toNumber(row.expected_cash),
    cashDifference: row.cash_difference === null || row.cash_difference === undefined ? null : toNumber(row.cash_difference),
    hoursOpen: toNumber(row.hours_open),
    openQueueCount: toNumber(row.open_queue_count),
    signedInCount: toNumber(row.signed_in_count),
  };
}

async function loadSummary(client: PoolClient | typeof pool, where: string, params: unknown[]) {
  const result = await client.query(`
    SELECT
      ss.*,
      EXTRACT(EPOCH FROM (COALESCE(ss.closed_at, CURRENT_TIMESTAMP) - ss.opened_at)) / 3600 AS hours_open,
      (SELECT COUNT(*) FROM sales_orders so WHERE so.queue_status IN ('waiting', 'served'))::int AS open_queue_count,
      (SELECT COUNT(*) FROM employee_time_logs t WHERE t.time_out IS NULL)::int AS signed_in_count
    FROM shift_summaries ss
    WHERE ${where}
  `, params);
  return result.rows[0] ? mapSummary(result.rows[0]) : null;
}

function parseAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) / 100 : null;
}

export async function GET() {
  const session = verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  try {
    return NextResponse.json({ data: await loadSummary(pool, "ss.closed_at IS NULL", []) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/shift failed:", error);
    return NextResponse.json({ error: "Could not load the current shift." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
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
      const inserted = await client.query(
        "INSERT INTO shifts (opened_by, starting_cash) VALUES ($1, $2) RETURNING shift_id",
        [session.adminId, startingCash]
      );
      const shiftId = Number(inserted.rows[0].shift_id);
      // Employees already signed in (e.g. the cashier opening the shift) now belong to it.
      await client.query("UPDATE employee_time_logs SET shift_id = $1 WHERE time_out IS NULL AND shift_id IS NULL", [shiftId]);
      // The opener stayed signed in across the previous close (which clocked everyone out),
      // so make sure their attendance for this shift starts now.
      await client.query(`
        INSERT INTO employee_time_logs (admin_id, shift_id)
        SELECT $1, $2
        WHERE NOT EXISTS (SELECT 1 FROM employee_time_logs WHERE admin_id = $1 AND time_out IS NULL)
      `, [session.adminId, shiftId]);
      await client.query("COMMIT");
      return NextResponse.json({ data: await loadSummary(pool, "ss.shift_id = $1", [shiftId]) }, { status: 201 });
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
        return NextResponse.json({ error: "This shift was already closed. Refresh to see the current shift." }, { status: 409 });
      }
      const expected = await client.query("SELECT expected_cash FROM shift_summaries WHERE shift_id = $1", [shiftId]);
      await client.query(`
        UPDATE shifts
        SET closed_at = CURRENT_TIMESTAMP, closed_by = $2, counted_cash = $3, expected_cash = $4, closing_notes = NULLIF($5, '')
        WHERE shift_id = $1
      `, [shiftId, session.adminId, countedCash, Number(expected.rows[0].expected_cash), notes]);
      // Everyone still signed in is clocked out at closing time.
      await client.query("UPDATE employee_time_logs SET time_out = CURRENT_TIMESTAMP WHERE time_out IS NULL");
      // Queue numbers restart with the next shift, so clear leftovers from the queue screens.
      await client.query("UPDATE sales_orders SET queue_status = 'flushed' WHERE queue_status IN ('waiting', 'served')");
      await client.query("COMMIT");
      return NextResponse.json({ data: await loadSummary(pool, "ss.shift_id = $1", [shiftId]) });
    }

    return NextResponse.json({ error: "Unknown shift action." }, { status: 400 });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (error && typeof error === "object" && (error as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "A shift is already open. Refresh to see it." }, { status: 409 });
    }
    console.error("POST /api/shift failed:", error);
    return NextResponse.json({ error: "Could not update the shift." }, { status: 500 });
  } finally {
    client.release();
  }
}
