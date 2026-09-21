import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

export async function GET() {
  const session = verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  try {
    const columnResult = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'admin_users' AND column_name = 'created_at'
      ) AS available
    `);
    const createdAtExpression = columnResult.rows[0]?.available ? "created_at" : "NULL";
    const result = await pool.query(`
      SELECT full_name, email, role, can_void_orders, can_refund_orders, ${createdAtExpression} AS created_at
      FROM admin_users
      WHERE admin_id = $1 AND LOWER(role) IN ('cashier', 'admin') AND is_active = TRUE
    `, [session.adminId]);
    if (result.rowCount === 0) return NextResponse.json({ error: "Cashier account not found." }, { status: 404 });
    const isAdmin = String(result.rows[0].role).toLowerCase() === "admin";
    return NextResponse.json({ data: { createdAt: result.rows[0].created_at, canVoidOrders: isAdmin ? true : Boolean(result.rows[0].can_void_orders), canRefundOrders: isAdmin ? true : Boolean(result.rows[0].can_refund_orders) } });
  } catch (error) {
    console.error("GET /api/auth/account failed:", error);
    return NextResponse.json({ error: "Unable to retrieve account details." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  try {
    const body = await request.json() as { currentPassword?: unknown; newPassword?: unknown };
    const currentPassword = String(body.currentPassword ?? "");
    const newPassword = String(body.newPassword ?? "");
    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: "Current and new passwords are required." }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ error: "The new password must be at least 8 characters." }, { status: 400 });
    }
    const result = await pool.query(`
      UPDATE admin_users
      SET password_hash = crypt($2, gen_salt('bf'))
      WHERE admin_id = $1
        AND password_hash = crypt($3, password_hash)
        AND LOWER(role) IN ('cashier', 'admin')
        AND is_active = TRUE
      RETURNING admin_id
    `, [session.adminId, newPassword, currentPassword]);
    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
    }
    return NextResponse.json({ data: true });
  } catch (error) {
    console.error("PATCH /api/auth/account failed:", error);
    return NextResponse.json({ error: "Unable to change password." }, { status: 500 });
  }
}
