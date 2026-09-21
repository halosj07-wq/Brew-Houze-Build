import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import pool from "@/lib/db";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

async function ensureAttendanceTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS employee_time_logs (
      time_log_id BIGSERIAL PRIMARY KEY,
      admin_id INTEGER NOT NULL REFERENCES admin_users(admin_id) ON DELETE CASCADE,
      time_in TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      time_out TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT employee_time_log_valid_range CHECK (time_out IS NULL OR time_out >= time_in)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS employee_one_open_time_log_idx
      ON employee_time_logs (admin_id) WHERE time_out IS NULL;
  `);
}

export async function POST() {
  const session = verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (session) {
    await ensureAttendanceTable();
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
