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
      SELECT time_log_id, time_in, time_out, shift_id
      FROM employee_time_logs
      WHERE admin_id = $1 AND is_archived = FALSE
      ORDER BY time_in DESC
      LIMIT 20
    `, [session.adminId]);

    const transactionResult = await pool.query(`
      SELECT order_id, total_amount, status,
        TO_CHAR(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS created_at,
        reversal_type,
        TO_CHAR(reversed_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS reversed_at
      FROM sales_orders
      WHERE cashier_admin_id = $1 AND is_archived = FALSE
      ORDER BY created_at DESC, order_id DESC
      LIMIT 30
    `, [session.adminId]);

    const reversalResult = await pool.query(`
      SELECT order_id, total_amount, status,
        TO_CHAR(reversed_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS reversed_at
      FROM sales_orders
      WHERE reversed_by_admin_id = $1 AND is_archived = FALSE
      ORDER BY reversed_at DESC, order_id DESC
      LIMIT 30
    `, [session.adminId]);

    // Archiving log: everything this admin has personally archived, across every
    // archivable table, merged and sorted by when it was archived. Scoped to
    // archived_by = this admin so it never surfaces another admin's actions.
    const [archivedProducts, archivedVariants, archivedInventory, archivedAdditions, archivedSalesOrders, archivedTimeLogs] = await Promise.all([
      pool.query(`
        SELECT product_name AS name, TO_CHAR(archived_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS archived_at
        FROM products WHERE archived_by = $1 AND is_archived = TRUE ORDER BY archived_at DESC LIMIT 10
      `, [session.adminId]),
      pool.query(`
        SELECT p.product_name || ' · ' || pv.size_label AS name, TO_CHAR(pv.archived_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS archived_at
        FROM product_variants pv JOIN products p ON p.product_id = pv.product_id
        WHERE pv.archived_by = $1 AND pv.is_archived = TRUE ORDER BY pv.archived_at DESC LIMIT 10
      `, [session.adminId]),
      pool.query(`
        SELECT item_name AS name, TO_CHAR(archived_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS archived_at
        FROM inventory WHERE archived_by = $1 AND is_archived = TRUE ORDER BY archived_at DESC LIMIT 10
      `, [session.adminId]),
      pool.query(`
        SELECT addition_name AS name, TO_CHAR(archived_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS archived_at
        FROM additions WHERE archived_by = $1 AND is_active = FALSE ORDER BY archived_at DESC LIMIT 10
      `, [session.adminId]),
      pool.query(`
        SELECT 'Order #' || order_id AS name, TO_CHAR(archived_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS archived_at
        FROM sales_orders WHERE archived_by = $1 AND is_archived = TRUE ORDER BY archived_at DESC LIMIT 10
      `, [session.adminId]),
      pool.query(`
        SELECT au.full_name AS name, TO_CHAR(etl.archived_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS archived_at
        FROM employee_time_logs etl JOIN admin_users au ON au.admin_id = etl.admin_id
        WHERE etl.archived_by = $1 AND etl.is_archived = TRUE ORDER BY etl.archived_at DESC LIMIT 10
      `, [session.adminId]),
    ]);

    const archives = [
      ...archivedProducts.rows.map((row) => ({ kind: "Product", name: row.name as string, archivedAt: row.archived_at as string })),
      ...archivedVariants.rows.map((row) => ({ kind: "Variant", name: row.name as string, archivedAt: row.archived_at as string })),
      ...archivedInventory.rows.map((row) => ({ kind: "Inventory item", name: row.name as string, archivedAt: row.archived_at as string })),
      ...archivedAdditions.rows.map((row) => ({ kind: "Addition", name: row.name as string, archivedAt: row.archived_at as string })),
      ...archivedSalesOrders.rows.map((row) => ({ kind: "Sales record", name: row.name as string, archivedAt: row.archived_at as string })),
      ...archivedTimeLogs.rows.map((row) => ({ kind: "Attendance log", name: row.name as string, archivedAt: row.archived_at as string })),
    ]
      .sort((a, b) => new Date(b.archivedAt).getTime() - new Date(a.archivedAt).getTime())
      .slice(0, 30);

    return NextResponse.json({
      data: {
        fullName: accountResult.rows[0].full_name,
        email: accountResult.rows[0].email,
        timeLogs: logsResult.rows.map((log) => ({ id: Number(log.time_log_id), timeIn: log.time_in, timeOut: log.time_out, shiftId: log.shift_id === null ? null : Number(log.shift_id) })),
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
        archives,
      },
    });
  } catch (error) {
    console.error("GET /api/admin-activity failed:", error);
    return NextResponse.json({ error: "Could not retrieve your cashier activity." }, { status: 500 });
  }
}
