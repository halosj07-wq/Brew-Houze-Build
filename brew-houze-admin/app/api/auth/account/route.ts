import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { endOtherSessions, getSession, listSessions } from "@/lib/sessions";

// The signed-in admin's own account page: profile, store status (open shift), signed-in devices,
// and password change.
export async function GET() {
  const session = await getSession();
  if (!session?.sid) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  try {
    const columnResult = await pool.query(`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'admin_users'
          AND column_name = 'created_at'
      ) AS available
    `);
    const createdAtExpression = columnResult.rows[0]?.available ? "created_at" : "NULL";
    const result = await pool.query(`
      SELECT full_name, email, role, ${createdAtExpression} AS created_at
      FROM admin_users
      WHERE admin_id = $1
        AND LOWER(role) = 'admin'
        AND is_active = TRUE
    `, [session.adminId]);

    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Admin account not found." }, { status: 404 });
    }

    // The shift open right now, if any, so the admin can see at a glance whether the café is open.
    const shiftResult = await pool.query(`
      SELECT shift_id, opened_at, opened_by_name, order_count, net_sales, void_count, refund_count
      FROM shift_summaries
      WHERE closed_at IS NULL
    `);
    const shift = shiftResult.rows[0];

    const account = result.rows[0];
    return NextResponse.json({
      data: {
        fullName: account.full_name,
        email: account.email,
        role: account.role,
        createdAt: account.created_at,
        shift: shift ? {
          shiftId: Number(shift.shift_id),
          openedAt: shift.opened_at,
          openedByName: shift.opened_by_name ?? null,
          orders: Number(shift.order_count),
          netSales: Number(shift.net_sales),
          reversals: Number(shift.void_count) + Number(shift.refund_count),
        } : null,
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
        AND LOWER(role) = 'admin'
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
