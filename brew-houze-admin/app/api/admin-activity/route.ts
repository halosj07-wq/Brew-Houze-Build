import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

// Returns the signed-in admin's own attendance, transaction, and reversal
// history only. Scoped strictly to session.adminId so an admin can never
// see another admin's activity through this endpoint.
export async function GET() {
  const session = verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  try {
    const accountResult = await pool.query(`
      SELECT admin_id, full_name, email
      FROM admin_users
      WHERE admin_id = $1 AND LOWER(role) = 'admin' AND is_active = TRUE
    `, [session.adminId]);
    if (accountResult.rowCount === 0) {
      return NextResponse.json({ error: "Admin account not found." }, { status: 404 });
    }

    const logsResult = await pool.query(`
      SELECT time_log_id, time_in, time_out
      FROM employee_time_logs
      WHERE admin_id = $1
      ORDER BY time_in DESC
      LIMIT 20
    `, [session.adminId]);

    const transactionResult = await pool.query(`
      SELECT order_id, total_amount, status,
        TO_CHAR(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS created_at,
        reversal_type,
        TO_CHAR(reversed_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS reversed_at
      FROM sales_orders
      WHERE cashier_admin_id = $1
      ORDER BY created_at DESC, order_id DESC
      LIMIT 30
    `, [session.adminId]);

    const reversalResult = await pool.query(`
      SELECT order_id, total_amount, status,
        TO_CHAR(reversed_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS reversed_at
      FROM sales_orders
      WHERE reversed_by_admin_id = $1
      ORDER BY reversed_at DESC, order_id DESC
      LIMIT 30
    `, [session.adminId]);

    return NextResponse.json({
      data: {
        fullName: accountResult.rows[0].full_name,
        email: accountResult.rows[0].email,
        timeLogs: logsResult.rows.map((log) => ({ id: Number(log.time_log_id), timeIn: log.time_in, timeOut: log.time_out })),
        transactions: transactionResult.rows.map((transaction) => ({
          id: Number(transaction.order_id),
          amount: Number(transaction.total_amount),
          status: transaction.status,
          createdAt: transaction.created_at,
          reversalType: transaction.reversal_type,
          reversedAt: transaction.reversed_at,
        })),
        reversals: reversalResult.rows.map((reversal) => ({
          id: Number(reversal.order_id),
          amount: Number(reversal.total_amount),
          status: reversal.status,
          reversedAt: reversal.reversed_at,
        })),
      },
    });
  } catch (error) {
    console.error("GET /api/admin-activity failed:", error);
    return NextResponse.json({ error: "Could not retrieve your cashier activity." }, { status: 500 });
  }
}
