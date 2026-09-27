import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { PoolClient } from "pg";
import pool from "@/lib/db";
import { SESSION_COOKIE, SESSION_MAX_AGE, verifySessionToken } from "@/lib/auth";

// Server-side record of every signed-in device (see user-sessions-migration.sql). The signed
// cookie proves who someone claims to be; this table decides whether that sign-in is still live,
// so sign-outs, shift closes, password resets and admins can end it.

const APP = "cashier";
// Roles allowed to use this app. Baristas only see and manage the queue (see isQueueOnly).
const ALLOWED_ROLES = ["cashier", "barista", "admin"];
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
      COALESCE(u.can_refund_orders, FALSE) AS can_refund_orders,
      COALESCE(u.can_open_shift, FALSE) AS can_open_shift
    FROM user_sessions s
    JOIN admin_users u ON u.admin_id = s.admin_id AND u.is_active = TRUE AND LOWER(u.role) = ANY($4::text[])
    WHERE s.token_hash = $1 AND s.app = $2 AND s.ended_at IS NULL AND s.expires_at > CURRENT_TIMESTAMP
  `, [hashSessionId(token.sid), APP, LAST_SEEN_REFRESH_MINUTES, ALLOWED_ROLES]);
  if (result.rowCount === 0) return null;
  const row = result.rows[0];
  if (row.stale) await pool.query("UPDATE user_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE session_id = $1", [row.session_id]);
  const isAdmin = String(row.role).toLowerCase() === "admin";
  // A barista never has cashier permissions, even if the flags were left on from an earlier role.
  const isBarista = String(row.role).toLowerCase() === "barista";
  return {
    adminId: Number(row.admin_id),
    fullName: String(row.full_name),
    email: String(row.email),
    role: String(row.role),
    canVoidOrders: isAdmin || (!isBarista && Boolean(row.can_void_orders)),
    canRefundOrders: isAdmin || (!isBarista && Boolean(row.can_refund_orders)),
    // Opening the store is an admin decision unless an admin grants it to this cashier.
    canOpenShift: isAdmin || (!isBarista && Boolean(row.can_open_shift)),
    sid: token.sid,
    exp: token.exp,
  };
}

// Re-checks the signed-in account's password before a sensitive action (opening or closing the
// shift, voids and refunds), since the counter tablet stays signed in and is shared.
export const WRONG_PASSWORD = { error: "That password is incorrect.", code: "wrong_password" };
export async function confirmPassword(adminId: number, password: unknown): Promise<boolean> {
  if (typeof password !== "string" || password.length === 0 || password.length > 200) return false;
  const result = await pool.query(
    "SELECT 1 FROM admin_users WHERE admin_id = $1 AND is_active = TRUE AND password_hash = crypt($2, password_hash)",
    [adminId, password]
  );
  return result.rowCount !== 0;
}

// Baristas can only view and manage the queue. Every other staff-app action (taking orders and
// payments, voids and refunds, the cash drawer, opening or closing the shift, products and
// receipts) refuses them on the server, not just in the screens.
export const QUEUE_ONLY = { error: "Your account can only view and manage the queue.", code: "queue_only" };
export function isQueueOnly(session: { role: string } | null | undefined): boolean {
  return String(session?.role ?? "").toLowerCase() === "barista";
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

// This account's signed-in devices, with the one making the request marked as current.
export async function listSessions(adminId: number, currentSessionId: string) {
  const result = await pool.query(`
    SELECT session_id, app, device_label, created_at, last_seen_at, token_hash = $2 AS is_current
    FROM user_sessions
    WHERE admin_id = $1 AND ended_at IS NULL AND expires_at > CURRENT_TIMESTAMP
    ORDER BY (token_hash = $2) DESC, last_seen_at DESC
  `, [adminId, hashSessionId(currentSessionId)]);
  return result.rows.map((row) => ({
    id: Number(row.session_id),
    app: String(row.app),
    device: String(row.device_label ?? "Unknown device"),
    signedInAt: row.created_at as string,
    lastSeenAt: row.last_seen_at as string,
    isCurrent: Boolean(row.is_current),
  }));
}

// Signs the account out everywhere except the device making the request (after a password
// change, or "Sign out other devices"). Attendance continues, since this device is still signed in.
export async function endOtherSessions(adminId: number, currentSessionId: string, reason: "signed_out" | "password_reset"): Promise<number> {
  const result = await pool.query(`
    UPDATE user_sessions SET ended_at = CURRENT_TIMESTAMP, end_reason = $3
    WHERE admin_id = $1 AND token_hash <> $2 AND ended_at IS NULL
  `, [adminId, hashSessionId(currentSessionId), reason]);
  return result.rowCount ?? 0;
}
