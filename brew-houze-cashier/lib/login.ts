import { NextResponse } from "next/server";
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";
import pool from "@/lib/db";
import { startSession } from "@/lib/sessions";

// Roles that may use the Staff Portal.
export const STAFF_PORTAL_ROLES = ["cashier", "barista", "kitchen", "rider", "admin"];

// The last step of signing in to the Staff Portal, shared by the password step (on a trusted
// device) and the emailed-code step (see lib/two-factor.ts): checks the account again, clocks the
// person in, starts the session and sets the cookie.
export async function finishStaffLogin(adminId: number, request: Request): Promise<NextResponse> {
  const result = await pool.query(`
    SELECT admin_id, full_name, email, role,
      COALESCE(can_void_orders, FALSE) AS can_void_orders,
      COALESCE(can_refund_orders, FALSE) AS can_refund_orders,
      COALESCE(can_open_shift, FALSE) AS can_open_shift,
      COALESCE(can_close_shift, FALSE) AS can_close_shift
    FROM admin_users
    WHERE admin_id = $1 AND is_active = TRUE AND LOWER(role) = ANY($2::text[])
  `, [adminId, STAFF_PORTAL_ROLES]);
  const admin = result.rows[0];
  if (!admin) return NextResponse.json({ error: "This account can no longer sign in." }, { status: 401 });
  const isAdmin = String(admin.role).toLowerCase() === "admin";
  const isBarista = ["barista", "kitchen", "rider"].includes(String(admin.role).toLowerCase());
  const session = {
    adminId: Number(admin.admin_id), fullName: admin.full_name, email: admin.email, role: admin.role,
    canVoidOrders: isAdmin ? true : !isBarista && Boolean(admin.can_void_orders),
    canRefundOrders: isAdmin ? true : !isBarista && Boolean(admin.can_refund_orders),
    canOpenShift: isAdmin ? true : !isBarista && Boolean(admin.can_open_shift),
    canCloseShift: isAdmin ? true : !isBarista && Boolean(admin.can_close_shift),
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
}
