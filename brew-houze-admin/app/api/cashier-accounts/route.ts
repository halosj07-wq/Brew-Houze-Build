import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

export async function GET() {
  try {
    const result = await pool.query(`
      SELECT admin_id, full_name, email, role, is_active, can_void_orders, can_refund_orders
      FROM admin_users
      WHERE LOWER(role) = 'cashier'
      ORDER BY is_active DESC, full_name ASC
    `);
    const logsResult = await pool.query(`
      SELECT time_log_id, admin_id, time_in, time_out
      FROM employee_time_logs
      WHERE admin_id = ANY($1::int[]) AND is_archived = FALSE
      ORDER BY time_in DESC
    `, [result.rows.map((account) => Number(account.admin_id))]);
    const logsByAccount = new Map<number, { id: number; timeIn: string; timeOut: string | null }[]>();
    for (const log of logsResult.rows) {
      const accountLogs = logsByAccount.get(Number(log.admin_id)) ?? [];
      if (accountLogs.length < 20) accountLogs.push({ id: Number(log.time_log_id), timeIn: log.time_in, timeOut: log.time_out });
      logsByAccount.set(Number(log.admin_id), accountLogs);
    }
    const transactionResult = await pool.query(`
      SELECT order_id, cashier_admin_id, total_amount, status,
        TO_CHAR(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS created_at,
        reversal_type,
        TO_CHAR(reversed_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS reversed_at
      FROM sales_orders
      WHERE cashier_admin_id = ANY($1::int[]) AND is_archived = FALSE
      ORDER BY created_at DESC, order_id DESC
    `, [result.rows.map((account) => Number(account.admin_id))]);
    const transactionsByAccount = new Map<number, {
      id: number;
      amount: number;
      status: string;
      createdAt: string;
      reversalType: string | null;
      reversedAt: string | null;
    }[]>();
    for (const transaction of transactionResult.rows) {
      const accountTransactions = transactionsByAccount.get(Number(transaction.cashier_admin_id)) ?? [];
      if (accountTransactions.length < 30) {
        accountTransactions.push({
          id: Number(transaction.order_id),
          amount: Number(transaction.total_amount),
          status: transaction.status,
          createdAt: transaction.created_at,
          reversalType: transaction.reversal_type,
          reversedAt: transaction.reversed_at,
        });
      }
      transactionsByAccount.set(Number(transaction.cashier_admin_id), accountTransactions);
    }
    const reversalResult = await pool.query(`
      SELECT order_id, reversed_by_admin_id, total_amount, status,
        TO_CHAR(reversed_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS reversed_at
      FROM sales_orders
      WHERE reversed_by_admin_id = ANY($1::int[])
      ORDER BY reversed_at DESC, order_id DESC
    `, [result.rows.map((account) => Number(account.admin_id))]);
    const reversalsByAccount = new Map<number, { id: number; amount: number; status: string; reversedAt: string | null }[]>();
    for (const reversal of reversalResult.rows) {
      const accountReversals = reversalsByAccount.get(Number(reversal.reversed_by_admin_id)) ?? [];
      if (accountReversals.length < 30) {
        accountReversals.push({
          id: Number(reversal.order_id),
          amount: Number(reversal.total_amount),
          status: reversal.status,
          reversedAt: reversal.reversed_at,
        });
      }
      reversalsByAccount.set(Number(reversal.reversed_by_admin_id), accountReversals);
    }

    return NextResponse.json({
      data: result.rows.map((account) => ({
        id: Number(account.admin_id),
        fullName: account.full_name,
        email: account.email,
        role: account.role,
        isActive: Boolean(account.is_active),
        canVoidOrders: Boolean(account.can_void_orders),
        canRefundOrders: Boolean(account.can_refund_orders),
        timeLogs: logsByAccount.get(Number(account.admin_id)) ?? [],
        transactions: transactionsByAccount.get(Number(account.admin_id)) ?? [],
        reversals: reversalsByAccount.get(Number(account.admin_id)) ?? [],
      })),
    });
  } catch (error) {
    console.error("GET /api/cashier-accounts failed:", error);
    return NextResponse.json({ error: "Could not retrieve cashier accounts." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session || String(session.role).toLowerCase() !== "admin") {
    return NextResponse.json({ error: "Only an admin can change cashier permissions." }, { status: 403 });
  }

  try {
    const body = await request.json() as { id?: unknown; canVoidOrders?: unknown; canRefundOrders?: unknown };
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "A valid cashier account is required." }, { status: 400 });
    const result = await pool.query(`
      UPDATE admin_users
      SET can_void_orders = $2, can_refund_orders = $3
      WHERE admin_id = $1 AND LOWER(role) = 'cashier'
      RETURNING admin_id, can_void_orders, can_refund_orders
    `, [id, body.canVoidOrders === true, body.canRefundOrders === true]);
    if (result.rowCount === 0) return NextResponse.json({ error: "Cashier account not found." }, { status: 404 });
    return NextResponse.json({ data: result.rows[0] });
  } catch (error) {
    console.error("PATCH /api/cashier-accounts failed:", error);
    return NextResponse.json({ error: "Could not update cashier permissions." }, { status: 500 });
  }

}

export async function DELETE(request: Request) {
  const session = verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session || String(session.role).toLowerCase() !== "admin") {
    return NextResponse.json({ error: "Only an admin can clear employee logs." }, { status: 403 });
  }
  try {
    const body = await request.json() as { id?: unknown; confirmation?: unknown };
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0 || body.confirmation !== "CLEAR_EMPLOYEE_LOGS") {
      return NextResponse.json({ error: "Explicit employee log confirmation is required." }, { status: 400 });
    }
    const result = await pool.query("DELETE FROM employee_time_logs WHERE admin_id = $1 RETURNING time_log_id", [id]);
    return NextResponse.json({ data: { deletedCount: result.rowCount ?? 0 } });
  } catch (error) {
    console.error("DELETE /api/cashier-accounts failed:", error);
    return NextResponse.json({ error: "Could not clear employee log history." }, { status: 500 });
  }
}
