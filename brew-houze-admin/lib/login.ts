import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";
import { isAllowedRole, startSession } from "@/lib/sessions";

// The last step of signing in to the admin portal, shared by the password step (on a trusted
// device) and the emailed-code step (see lib/two-factor.ts): checks the account again, starts the
// session and sets the cookie.
export async function finishAdminLogin(adminId: number, request: Request): Promise<NextResponse> {
  const result = await pool.query("SELECT admin_id, full_name, email, role FROM admin_users WHERE admin_id = $1 AND is_active = TRUE", [adminId]);
  const admin = result.rows[0];
  if (!admin) return NextResponse.json({ error: "This account can no longer sign in." }, { status: 401 });
  // The admin portal manages finance, accounts and inventory, so only admin accounts may use it.
  if (!isAllowedRole(admin.role)) {
    return NextResponse.json({ error: "This account does not have admin access. Use the staff portal instead." }, { status: 403 });
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
}
