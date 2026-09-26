import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { endOtherSessions, getSession, listSessions } from "@/lib/sessions";

// The signed-in person's own account page: profile, attendance and sales in the open shift,
// signed-in devices, and password change.
export async function GET() {
  const session = await getSession();
  if (!session?.sid) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  try {
    const columnResult = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'admin_users' AND column_name = 'created_at'
      ) AS available
    `);
    const createdAtExpression = columnResult.rows[0]?.available ? "created_at" : "NULL";
    const accountResult = await pool.query(`SELECT ${createdAtExpression} AS created_at FROM admin_users WHERE admin_id = $1`, [session.adminId]);

    const attendanceResult = await pool.query(
      "SELECT time_in FROM employee_time_logs WHERE admin_id = $1 AND time_out IS NULL ORDER BY time_in DESC LIMIT 1",
      [session.adminId]
    );

    // What this person did in the shift that is open right now.
    const shiftResult = await pool.query(`
      SELECT s.shift_id, s.opened_at,
        (SELECT COUNT(*) FROM sales_orders so WHERE so.shift_id = s.shift_id AND so.cashier_admin_id = $1)::int AS orders,
        (SELECT COALESCE(SUM(so.total_amount), 0) FROM sales_orders so WHERE so.shift_id = s.shift_id AND so.cashier_admin_id = $1 AND so.status = 'completed') AS sales,
        (SELECT COUNT(*) FROM sales_orders so WHERE so.reversed_shift_id = s.shift_id AND so.reversed_by_admin_id = $1)::int AS reversals
      FROM shifts s
      WHERE s.closed_at IS NULL
    `, [session.adminId]);
    const shift = shiftResult.rows[0];

    return NextResponse.json({
      data: {
        createdAt: accountResult.rows[0]?.created_at ?? null,
        clockedInAt: attendanceResult.rows[0]?.time_in ?? null,
        shift: shift ? { shiftId: Number(shift.shift_id), openedAt: shift.opened_at, orders: Number(shift.orders), sales: Number(shift.sales), reversals: Number(shift.reversals) } : null,
        devices: await listSessions(session.adminId, session.sid),
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/auth/account failed:", error);
    return NextResponse.json({ error: "Unable to retrieve account details." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session?.sid) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  try {
    const body = await request.json() as { action?: unknown; currentPassword?: unknown; newPassword?: unknown };

    if (body.action === "sign_out_other_devices") {
      const ended = await endOtherSessions(session.adminId, session.sid, "signed_out");
      return NextResponse.json({ data: { signedOutDevices: ended } });
    }

    const currentPassword = String(body.currentPassword ?? "");
    const newPassword = String(body.newPassword ?? "");
    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: "Current and new passwords are required." }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ error: "The new password must be at least 8 characters." }, { status: 400 });
    }
    if (Buffer.byteLength(newPassword, "utf8") > 72) {
      return NextResponse.json({ error: "The new password is too long (max 72 characters)." }, { status: 400 });
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
    // Anyone else who knew the old password is signed out; this device stays signed in.
    const ended = await endOtherSessions(session.adminId, session.sid, "password_reset");
    return NextResponse.json({ data: { signedOutDevices: ended } });
  } catch (error) {
    console.error("PATCH /api/auth/account failed:", error);
    return NextResponse.json({ error: "Unable to change password." }, { status: 500 });
  }
}
