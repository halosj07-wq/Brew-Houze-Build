import { after } from "next/server";
import nodemailer from "nodemailer";
import pool from "@/lib/db";

// The security log and the staff sign-in lockout (see security-log-migration.sql).
// brew-houze-admin, brew-houze-cashier and brew-houze-mobile keep identical copies of this file.
//
// Logging never gets in the way: if writing the log fails (or the table is not there yet), the
// sign-in or change still goes through and the problem is only printed in the server log.
//
// Lockout: 5 wrong passwords for one email within 15 minutes lock that email for 15 minutes, in
// the Admin Portal and the Staff Portal together. While locked, even the right password is
// refused, so guessing cannot go on. A successful sign-in, a password reset, a password set by
// the admin, or the admin's Unlock (Security page) starts the count again. The account's owner is
// emailed when it locks.

export type SecurityPortal = "admin" | "staff" | "mobile";
export type SecurityEvent =
  | "login_success" | "login_failed" | "login_refused" | "account_locked" | "account_unlocked"
  | "new_device_code_sent" | "new_device_verified"
  | "password_changed" | "password_reset_requested" | "password_reset" | "password_set_by_admin"
  | "signed_out_other_devices" | "signed_out_everywhere"
  | "account_created" | "account_updated" | "role_changed" | "permissions_changed" | "account_deactivated" | "account_reactivated";

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;
// Events after which wrong passwords are counted from zero again.
const CLEARING_EVENTS = ["login_success", "password_reset", "password_set_by_admin", "account_unlocked"];

type Entry = {
  event: SecurityEvent;
  portal: SecurityPortal;
  accountKind?: "staff" | "customer" | null;
  accountId?: number | null;
  loginKey?: string | null;
  actorAdminId?: number | null;
  detail?: string | null;
  request?: Request | null;
};

// "Android · Chrome", enough to recognise a device in the log.
export function describeDevice(userAgent: string | null): string {
  const ua = userAgent ?? "";
  const device = /iPhone/i.test(ua) ? "iPhone" : /iPad/i.test(ua) ? "iPad" : /Android/i.test(ua) ? "Android" : /Windows/i.test(ua) ? "Windows" : /Macintosh/i.test(ua) ? "Mac" : "Browser";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  return `${device} · ${browser}`;
}

// The visitor's address: Vercel puts it first in x-forwarded-for.
function clientIp(request: Request | null | undefined): string | null {
  if (!request) return null;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwarded || request.headers.get("x-real-ip") || "").slice(0, 64) || null;
}

const isMissingTable = (error: unknown) => Boolean(error && typeof error === "object" && (error as { code?: string }).code === "42P01");

// Writes one row. For a staff account without a login key, the account's email is used, so a
// reset or an unlock clears the lockout of the email people sign in with.
export async function logSecurityEvent(entry: Entry): Promise<void> {
  try {
    const kind = entry.accountKind ?? null;
    const accountId = entry.accountId ?? null;
    await pool.query(`
      INSERT INTO security_events (event, portal, account_kind, account_id, login_key, actor_admin_id, detail, ip, device)
      VALUES ($1, $2, $3::text, $4::int, COALESCE($5::text,
        CASE WHEN $3::text = 'staff' THEN (SELECT LOWER(email) FROM admin_users WHERE admin_id = $4::int)
             WHEN $3::text = 'customer' THEN (SELECT LOWER(username) FROM customers WHERE customer_id = $4::int) END), $6, $7, $8, $9)
    `, [entry.event, entry.portal, kind, accountId, entry.loginKey ? entry.loginKey.trim().toLowerCase().slice(0, 254) : null, entry.actorAdminId ?? null,
      entry.detail ? entry.detail.slice(0, 300) : null, clientIp(entry.request), entry.request ? describeDevice(entry.request.headers.get("user-agent")) : null]);
  } catch (error) {
    if (!isMissingTable(error)) console.error("Security log write failed:", error);
  }
}

// When a staff email is locked, until when; null when it is not.
export async function staffLockedUntil(loginKey: string): Promise<Date | null> {
  try {
    const result = await pool.query(`
      SELECT created_at FROM security_events
      WHERE login_key = $1 AND event = 'login_failed' AND portal IN ('admin', 'staff')
        AND created_at > CURRENT_TIMESTAMP - make_interval(mins => $2)
        AND created_at > COALESCE((SELECT MAX(created_at) FROM security_events WHERE login_key = $1 AND event = ANY($3::text[])), '-infinity')
      ORDER BY created_at DESC
      LIMIT $4
    `, [loginKey, LOCK_MINUTES, CLEARING_EVENTS, MAX_FAILED_LOGINS]);
    if ((result.rowCount ?? 0) < MAX_FAILED_LOGINS) return null;
    // The lock lifts when the oldest of the last five wrong passwords is 15 minutes old.
    return new Date(new Date(result.rows[MAX_FAILED_LOGINS - 1].created_at).getTime() + LOCK_MINUTES * 60_000);
  } catch (error) {
    if (!isMissingTable(error)) console.error("Lockout check failed:", error);
    return null;
  }
}

// "Too many wrong passwords…" with the time it unlocks, in Manila time.
export function lockedMessage(until: Date): string {
  const minutes = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60_000));
  const time = until.toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
  return `Too many wrong passwords. This account is locked for ${minutes} more minute${minutes === 1 ? "" : "s"} (until ${time}). Reset your password, or ask an admin to unlock it.`;
}

// A wrong staff password: logs it, and when it is the fifth in a row, locks the email, logs that
// and emails the account's owner. Returns the lock's end when this attempt locked it.
export async function recordStaffLoginFailure(loginKey: string, portal: "admin" | "staff", request: Request): Promise<Date | null> {
  const account = await pool.query("SELECT admin_id, full_name, email FROM admin_users WHERE LOWER(email) = $1 LIMIT 1", [loginKey]).catch(() => null);
  const row = account?.rows[0];
  const accountId = row ? Number(row.admin_id) : null;
  await logSecurityEvent({ event: "login_failed", portal, accountKind: accountId ? "staff" : null, accountId, loginKey, detail: "Wrong password", request });
  const until = await staffLockedUntil(loginKey);
  if (!until) return null;
  await logSecurityEvent({ event: "account_locked", portal, accountKind: accountId ? "staff" : null, accountId, loginKey, detail: `${MAX_FAILED_LOGINS} wrong passwords; locked for ${LOCK_MINUTES} minutes`, request });
  if (row?.email) sendSecurityAlert({ kind: "locked", email: String(row.email), name: String(row.full_name ?? ""), portal, request });
  return until;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

const PORTAL_NAMES: Record<SecurityPortal, string> = { admin: "Admin Portal", staff: "Staff Portal", mobile: "mobile menu" };

// Tells the owner of an account that it was locked, or that its password changed, so that someone
// else doing it is noticed. Sent after the response has gone out, so it never slows the request.
export function sendSecurityAlert(alert: { kind: "locked" | "password_changed"; email: string; name: string; portal: SecurityPortal; request?: Request | null; byAdmin?: boolean }): void {
  const device = alert.request ? describeDevice(alert.request.headers.get("user-agent")) : null;
  const send = async () => {
    const firstName = alert.name.trim().split(/\s+/)[0] || "there";
    const portalName = PORTAL_NAMES[alert.portal];
    const when = new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });
    const subject = alert.kind === "locked" ? "Your Brew Houze account was locked" : "Your Brew Houze password was changed";
    const lines = alert.kind === "locked"
      ? [`Someone typed the wrong password for your account ${MAX_FAILED_LOGINS} times on the ${portalName} (${when}${device ? `, ${device}` : ""}).`,
        `To keep it safe, signing in is locked for ${LOCK_MINUTES} minutes.`,
        "If this was you, wait and try again, or reset your password. If it was not you, reset your password now: someone may be trying to guess it."]
      : [alert.byAdmin
          ? `An admin set a new password for your account (${when}). Ask them for it, and change it after you sign in.`
          : `The password of your account was changed on the ${portalName} (${when}${device ? `, ${device}` : ""}).`,
        alert.byAdmin ? "Your other devices were signed out." : "If this was you, you don't need to do anything. If it was not you, reset your password now and tell the café owner."];
    const configured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.MAIL_FROM);
    if (!configured) {
      if (process.env.NODE_ENV !== "production") console.log(`[security alert] to ${alert.email}: ${subject}`);
      return;
    }
    const text = [`Hi ${firstName},`, "", ...lines, "", "Brew Houze Cafe"].join("\n");
    const html = `
  <div style="background:#F8F5F1;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#3D2B1F">
    <div style="max-width:480px;margin:0 auto;background:#FFFFFF;border:1px solid #E8DDD5;border-radius:16px;overflow:hidden">
      <div style="background:#3D2B1F;padding:20px 24px">
        <div style="color:#FDF9F5;font-size:18px;font-weight:bold">Brew Houze</div>
        <div style="color:#F59E0B;font-size:11px;letter-spacing:2px;margin-top:2px">SECURITY ALERT</div>
      </div>
      <div style="padding:26px 24px">
        <p style="margin:0 0 12px;font-size:15px">Hi ${escapeHtml(firstName)},</p>
        ${lines.map((line) => `<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#6B4C3B">${escapeHtml(line)}</p>`).join("")}
      </div>
    </div>
  </div>`;
    const port = Number(process.env.SMTP_PORT ?? 465);
    const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
    await transport.sendMail({ from: process.env.MAIL_FROM, to: alert.email, subject, text, html });
  };
  after(async () => {
    try { await send(); } catch (error) { console.error("Security alert email failed:", error); }
  });
}
