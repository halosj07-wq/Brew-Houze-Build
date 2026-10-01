import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { finishStaffLogin, STAFF_PORTAL_ROLES } from "@/lib/login";
import { isTrustedDevice, startChallenge, twoFactorEnabled } from "@/lib/two-factor";

// Step one of signing in: the password. On a device this account has not verified in the last
// 30 days, a code is emailed and the answer is { twoFactor: { challenge, email } }; the code is
// then checked by /api/auth/verify-code. The shared counter tablet is trusted per account.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");
    if (!email || !password) return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    const result = await pool.query(`
      SELECT admin_id
      FROM admin_users
      WHERE LOWER(email) = $1
        AND password_hash = crypt($2, password_hash)
        AND is_active = TRUE
        AND LOWER(role) = ANY($3::text[])
      LIMIT 1
    `, [email, password, STAFF_PORTAL_ROLES]);
    if (result.rowCount === 0) return NextResponse.json({ error: "Invalid cashier email or password." }, { status: 401 });
    const adminId = Number(result.rows[0].admin_id);
    if (twoFactorEnabled() && !(await isTrustedDevice("staff", adminId))) {
      const started = await startChallenge("staff", adminId, "staff");
      if ("error" in started) return NextResponse.json({ error: started.error }, { status: started.status });
      return NextResponse.json({ data: { twoFactor: started } });
    }
    return await finishStaffLogin(adminId, request);
  } catch (error) {
    console.error("POST /api/auth/login failed:", error);
    return NextResponse.json({ error: "Unable to sign in." }, { status: 500 });
  }
}
