import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import pool from "@/lib/db";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

export async function POST() {
  const session = verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (session) {
    await pool.query(`
      UPDATE employee_time_logs
      SET time_out = CURRENT_TIMESTAMP
      WHERE admin_id = $1 AND time_out IS NULL
    `, [session.adminId]);
  }
  const response = NextResponse.json({ data: true });
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, expires: new Date(0), path: "/" });
  return response;
}
