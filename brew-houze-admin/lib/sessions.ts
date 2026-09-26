import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { PoolClient } from "pg";
import pool from "@/lib/db";
import { SESSION_COOKIE, SESSION_MAX_AGE, verifySessionToken } from "@/lib/auth";

// Server-side record of every signed-in device (see user-sessions-migration.sql). The signed
// cookie proves who someone claims to be; this table decides whether that sign-in is still live,
// so sign-outs, shift closes, password resets and admins can end it.

const APP = "admin";
// Roles allowed to use this app.
const ALLOWED_ROLES = ["admin"];
// last_seen_at is refreshed at most this often, so checks stay read-only most of the time.
const LAST_SEEN_REFRESH_MINUTES = 5;

type Db = PoolClient | typeof pool;

function hashSessionId(sessionId: string): string {
  return createHash("sha256").update(sessionId).digest("hex");
}

// "iPad · Safari", so admins can recognise which device a session belongs to.
export function describeDevice(userAgent: string | null): string {
  const ua = userAgent ?? "";
  const device = /iPad/i.test(ua) ? "iPad"
    : /iPhone/i.test(ua) ? "iPhone"
    : /Android/i.test(ua) ? (/Mobile/i.test(ua) ? "Android phone" : "Android tablet")
    : /Windows/i.test(ua) ? "Windows PC"
    : /Macintosh/i.test(ua) ? "Mac or iPad"
    : /Linux/i.test(ua) ? "Linux PC"
    : "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  return `${device} · ${browser}`;
}

export function isAllowedRole(role: unknown): boolean {
  return ALLOWED_ROLES.includes(String(role).toLowerCase());
}

// Records a new sign-in and returns the random id that goes into the session cookie.
export async function startSession(adminId: number, userAgent: string | null): Promise<string> {
  const sessionId = randomBytes(32).toString("base64url");
  await pool.query(`
    INSERT INTO user_sessions (admin_id, app, token_hash, device_label, expires_at)
    VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP + make_interval(secs => $5))
  `, [adminId, APP, hashSessionId(sessionId), describeDevice(userAgent), SESSION_MAX_AGE]);
  return sessionId;
}

// The signed-in account for this request, or null. Name, role and permissions are read fresh,
// so changes made by an admin apply immediately.
export async function getSession() {
  const token = verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!token?.sid) return null;
  const result = await pool.query(`
    SELECT s.session_id,
      s.last_seen_at < CURRENT_TIMESTAMP - make_interval(mins => $3) AS stale,
      u.admin_id, u.full_name, u.email, u.role,
      COALESCE(u.can_void_orders, FALSE) AS can_void_orders,
      COALESCE(u.can_refund_orders, FALSE) AS can_refund_orders
    FROM user_sessions s
    JOIN admin_users u ON u.admin_id = s.admin_id AND u.is_active = TRUE AND LOWER(u.role) = ANY($4::text[])
    WHERE s.token_hash = $1 AND s.app = $2 AND s.ended_at IS NULL AND s.expires_at > CURRENT_TIMESTAMP
  `, [hashSessionId(token.sid), APP, LAST_SEEN_REFRESH_MINUTES, ALLOWED_ROLES]);
  if (result.rowCount === 0) return null;
  const row = result.rows[0];
  if (row.stale) await pool.query("UPDATE user_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE session_id = $1", [row.session_id]);
  const isAdmin = String(row.role).toLowerCase() === "admin";
  return {
    adminId: Number(row.admin_id),
    fullName: String(row.full_name),
    email: String(row.email),
    role: String(row.role),
    canVoidOrders: isAdmin || Boolean(row.can_void_orders),
    canRefundOrders: isAdmin || Boolean(row.can_refund_orders),
    sid: token.sid,
    exp: token.exp,
  };
}

// Ends the session of this browser (sign out). Returns the account it belonged to.
export async function endCurrentSession(): Promise<number | null> {
  const token = verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!token?.sid) return null;
  const result = await pool.query(`
    UPDATE user_sessions SET ended_at = CURRENT_TIMESTAMP, end_reason = 'signed_out'
    WHERE token_hash = $1 AND ended_at IS NULL
    RETURNING admin_id
  `, [hashSessionId(token.sid)]);
  return result.rows[0] ? Number(result.rows[0].admin_id) : null;
}

// Attendance follows the person, not the device: the open time log ends only when they are no
// longer signed in to the cashier app anywhere.
export async function closeAttendanceIfSignedOutEverywhere(adminId: number, db: Db = pool): Promise<void> {
  await db.query(`
    UPDATE employee_time_logs SET time_out = CURRENT_TIMESTAMP
    WHERE admin_id = $1 AND time_out IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM user_sessions
        WHERE admin_id = $1 AND app = 'cashier' AND ended_at IS NULL AND expires_at > CURRENT_TIMESTAMP
      )
  `, [adminId]);
}

// Signs an account out of every device in both apps (password reset, or an admin action).
export async function endAllSessions(adminId: number, reason: "password_reset" | "signed_out_by_admin", db: Db = pool): Promise<number> {
  const result = await db.query(`
    UPDATE user_sessions SET ended_at = CURRENT_TIMESTAMP, end_reason = $2
    WHERE admin_id = $1 AND ended_at IS NULL
  `, [adminId, reason]);
  await closeAttendanceIfSignedOutEverywhere(adminId, db);
  return result.rowCount ?? 0;
}
