import { NextResponse } from "next/server";
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";
import pool from "@/lib/db";
import { startSession } from "@/lib/sessions";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");
    if (!email || !password) return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    const result = await pool.query(`
      SELECT admin_id, full_name, email, role,
        COALESCE(can_void_orders, FALSE) AS can_void_orders,
        COALESCE(can_refund_orders, FALSE) AS can_refund_orders
      FROM admin_users
      WHERE LOWER(email) = $1
        AND password_hash = crypt($2, password_hash)
        AND is_active = TRUE
        AND LOWER(role) IN ('cashier', 'admin')
      LIMIT 1
    `, [email, password]);
    if (result.rowCount === 0) return NextResponse.json({ error: "Invalid cashier email or password." }, { status: 401 });
    const admin = result.rows[0];
    const isAdmin = String(admin.role).toLowerCase() === "admin";
    const session = {
      adminId: Number(admin.admin_id), fullName: admin.full_name, email: admin.email, role: admin.role,
      canVoidOrders: isAdmin ? true : Boolean(admin.can_void_orders),
      canRefundOrders: isAdmin ? true : Boolean(admin.can_refund_orders),
    };
    await pool.query(`
      INSERT INTO employee_time_logs (admin_id)
      VALUES ($1)
      ON CONFLICT DO NOTHING
    `, [admin.admin_id]);
    const sessionId = await startSession(Number(admin.admin_id), request.headers.get("user-agent"));
    const response = NextResponse.json({ data: session });
    response.cookies.set(SESSION_COOKIE, createSessionToken({ ...session, sid: sessionId }), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: SESSION_MAX_AGE, path: "/" });
    return response;
  } catch (error) {
    console.error("POST /api/auth/login failed:", error);
    return NextResponse.json({ error: "Unable to sign in." }, { status: 500 });
  }
}
