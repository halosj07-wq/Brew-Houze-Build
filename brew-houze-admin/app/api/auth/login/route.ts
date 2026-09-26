import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";
import { isAllowedRole, startSession } from "@/lib/sessions";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    const result = await pool.query(`
      SELECT admin_id, full_name, email, role
      FROM admin_users
      WHERE LOWER(email) = $1
        AND password_hash = crypt($2, password_hash)
        AND is_active = TRUE
      LIMIT 1
    `, [email, password]);

    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    const admin = result.rows[0];
    // The admin portal manages finance, accounts and inventory, so only admin accounts may use it.
    if (!isAllowedRole(admin.role)) {
      return NextResponse.json({ error: "This account does not have admin access. Use the cashier portal instead." }, { status: 403 });
    }

    const sessionId = await startSession(Number(admin.admin_id), request.headers.get("user-agent"));
    const response = NextResponse.json({
      data: { adminId: Number(admin.admin_id), fullName: admin.full_name, email: admin.email, role: admin.role },
    });

    response.cookies.set(SESSION_COOKIE, createSessionToken({
      adminId: Number(admin.admin_id),
      email: admin.email,
      fullName: admin.full_name,
      role: admin.role,
      sid: sessionId,
    }), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: SESSION_MAX_AGE,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("POST /api/auth/login failed:", error);
    return NextResponse.json({ error: "Unable to sign in." }, { status: 500 });
  }
}
