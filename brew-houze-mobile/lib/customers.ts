import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { PoolClient } from "pg";
import nodemailer from "nodemailer";
import pool from "@/lib/db";

// Customer accounts for the mobile menu (see customer-accounts-migration.sql). An account is
// optional: guests order exactly as before. Signed-in customers get their orders saved to their
// account (and, in a later phase, loyalty stars).
//
// The cookie carries a random id; only its SHA-256 hash is stored, so a database leak does not
// reveal live sessions. Passwords are hashed with bcrypt by pgcrypto, like staff passwords.

type Db = PoolClient | typeof pool;

export const CUSTOMER_COOKIE = "brew_houze_customer";
// Customers stay signed in on their own phone for 90 days of not using it.
const SESSION_DAYS = 90;
const LAST_SEEN_REFRESH_MINUTES = 30;
export const MIN_PASSWORD_LENGTH = 8;
// bcrypt only uses the first 72 bytes, so longer passwords are refused rather than cut short.
export const MAX_PASSWORD_LENGTH = 72;
// Wrong passwords: after this many for one username within the window, sign-in waits.
const MAX_LOGIN_FAILURES = 5;
const LOGIN_FAILURE_WINDOW_MINUTES = 15;
const RESET_LINK_MINUTES = 30;
const MAX_RESETS_PER_WINDOW = 3;
// Shown at sign-up and stored with the consent, so a later change of wording is traceable.
export const PRIVACY_NOTICE_VERSION = "2026-09-28";

export type CustomerSession = { customerId: number; username: string; fullName: string; email: string | null; birthday: string | null };

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// ── Validation ─────────────────────────────────────────────────────────────────────────────────

// 3 to 30 letters, numbers, dots or underscores, starting with a letter or number.
export function usernameProblem(username: string): string | null {
  if (username.length < 3) return "Usernames need at least 3 characters.";
  if (username.length > 30) return "Usernames can have at most 30 characters.";
  if (!/^[A-Za-z0-9][A-Za-z0-9._]*$/.test(username)) return "Use only letters, numbers, dots and underscores, starting with a letter or number.";
  return null;
}

export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Passwords need at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_LENGTH) return `That password is too long (at most ${MAX_PASSWORD_LENGTH} characters).`;
  return null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function emailProblem(email: string): string | null {
  if (!email) return null;
  if (email.length > 254 || !EMAIL_RE.test(email)) return "Enter a valid email address, or leave it empty.";
  return null;
}

// A real calendar date in the past, as YYYY-MM-DD, or empty.
export function birthdayProblem(birthday: string): string | null {
  if (!birthday) return null;
  const match = birthday.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = match ? new Date(`${birthday}T00:00:00Z`) : null;
  if (!match || !date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== birthday) return "Enter a valid birthday, or leave it empty.";
  if (Number(match[1]) < 1900 || date.getTime() > Date.now()) return "Enter a valid birthday, or leave it empty.";
  return null;
}

export function cleanName(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
}

export function isUniqueViolation(error: unknown): error is { code: string; constraint?: string } {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "23505";
}

// ── Sessions ───────────────────────────────────────────────────────────────────────────────────

function describeDevice(userAgent: string | null): string {
  const ua = userAgent ?? "";
  const device = /iPhone/i.test(ua) ? "iPhone" : /iPad/i.test(ua) ? "iPad" : /Android/i.test(ua) ? "Android" : /Windows/i.test(ua) ? "Windows" : /Macintosh/i.test(ua) ? "Mac" : "Browser";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  return `${device} · ${browser}`;
}

// Signs the customer in on this browser: records the session and sets the cookie.
export async function startCustomerSession(customerId: number, userAgent: string | null): Promise<void> {
  const sessionId = randomBytes(32).toString("base64url");
  await pool.query(`
    INSERT INTO customer_sessions (customer_id, token_hash, device_label, expires_at)
    VALUES ($1, $2, $3, CURRENT_TIMESTAMP + make_interval(days => $4))
  `, [customerId, hashToken(sessionId), describeDevice(userAgent), SESSION_DAYS]);
  (await cookies()).set(CUSTOMER_COOKIE, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

// The signed-in customer, or null. Also slides the 90 days forward while the phone is in use.
export async function getCustomerSession(): Promise<CustomerSession | null> {
  const sessionId = (await cookies()).get(CUSTOMER_COOKIE)?.value;
  if (!sessionId || sessionId.length > 100) return null;
  const result = await pool.query(`
    SELECT s.session_id, s.last_seen_at < CURRENT_TIMESTAMP - make_interval(mins => $2) AS stale,
      c.customer_id, c.username, c.full_name, c.email, TO_CHAR(c.birthday, 'YYYY-MM-DD') AS birthday
    FROM customer_sessions s
    JOIN customers c ON c.customer_id = s.customer_id AND c.is_active = TRUE AND c.deleted_at IS NULL AND c.username IS NOT NULL
    WHERE s.token_hash = $1 AND s.ended_at IS NULL AND s.expires_at > CURRENT_TIMESTAMP
  `, [hashToken(sessionId), LAST_SEEN_REFRESH_MINUTES]);
  const row = result.rows[0];
  if (!row) return null;
  if (row.stale) {
    await pool.query("UPDATE customer_sessions SET last_seen_at = CURRENT_TIMESTAMP, expires_at = CURRENT_TIMESTAMP + make_interval(days => $2) WHERE session_id = $1", [row.session_id, SESSION_DAYS]);
  }
  return {
    customerId: Number(row.customer_id),
    username: String(row.username),
    fullName: String(row.full_name),
    email: (row.email as string | null) ?? null,
    birthday: (row.birthday as string | null) ?? null,
  };
}

// Signs out this browser only.
export async function endCurrentCustomerSession(): Promise<void> {
  const store = await cookies();
  const sessionId = store.get(CUSTOMER_COOKIE)?.value;
  if (sessionId) {
    await pool.query("UPDATE customer_sessions SET ended_at = CURRENT_TIMESTAMP, end_reason = 'signed_out' WHERE token_hash = $1 AND ended_at IS NULL", [hashToken(sessionId)]);
  }
  store.delete(CUSTOMER_COOKIE);
}

type EndReason = "password_reset" | "password_changed" | "account_deleted";
// Signs the customer out everywhere, optionally keeping the browser making the request.
export async function endCustomerSessions(customerId: number, reason: EndReason, db: Db = pool, keepCurrent = false): Promise<void> {
  const sessionId = keepCurrent ? (await cookies()).get(CUSTOMER_COOKIE)?.value : undefined;
  await db.query(`
    UPDATE customer_sessions SET ended_at = CURRENT_TIMESTAMP, end_reason = $2
    WHERE customer_id = $1 AND ended_at IS NULL AND ($3::text IS NULL OR token_hash <> $3)
  `, [customerId, reason, sessionId ? hashToken(sessionId) : null]);
}

// ── Passwords and sign-in ──────────────────────────────────────────────────────────────────────

export async function checkCustomerPassword(customerId: number, password: unknown): Promise<boolean> {
  if (typeof password !== "string" || password.length === 0 || password.length > 200) return false;
  const result = await pool.query("SELECT 1 FROM customers WHERE customer_id = $1 AND password_hash IS NOT NULL AND password_hash = crypt($2, password_hash)", [customerId, password]);
  return result.rowCount !== 0;
}

// Returns the customer for a username (or email) and password. Too many wrong passwords for one
// username make it wait, whoever is trying, which slows down guessing.
export async function signInCustomer(login: string, password: string): Promise<{ customerId: number } | { error: string; status: number }> {
  const key = login.trim().toLowerCase();
  if (!key || !password) return { error: "Enter your username and password.", status: 400 };
  const failures = await pool.query(
    "SELECT COUNT(*)::int AS n FROM customer_login_failures WHERE username_key = $1 AND created_at > CURRENT_TIMESTAMP - make_interval(mins => $2)",
    [key, LOGIN_FAILURE_WINDOW_MINUTES]
  );
  if (failures.rows[0].n >= MAX_LOGIN_FAILURES) return { error: `Too many wrong passwords. Please wait ${LOGIN_FAILURE_WINDOW_MINUTES} minutes and try again, or reset your password.`, status: 429 };
  const result = await pool.query(`
    SELECT customer_id FROM customers
    WHERE (LOWER(username) = $1 OR LOWER(email) = $1) AND is_active = TRUE AND deleted_at IS NULL
      AND username IS NOT NULL AND password_hash IS NOT NULL AND password_hash = crypt($2, password_hash)
    LIMIT 1
  `, [key, password.slice(0, 200)]);
  if (result.rowCount === 0) {
    await pool.query("INSERT INTO customer_login_failures (username_key) VALUES ($1)", [key.slice(0, 254)]);
    // Old entries are not needed once they are past the window.
    await pool.query("DELETE FROM customer_login_failures WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '1 day'");
    return { error: "That username or password is incorrect.", status: 401 };
  }
  await pool.query("DELETE FROM customer_login_failures WHERE username_key = $1", [key]);
  return { customerId: Number(result.rows[0].customer_id) };
}

// ── Forgot password (only for accounts with an email) ──────────────────────────────────────────

// Where reset links point. Never taken from the request in production: the Host header can be
// forged. APP_URL, then the Vercel production domain, then (local development) the request.
export function resolveAppUrl(requestUrl: string): string | null {
  const configured = process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const vercelProduction = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelProduction) return `https://${vercelProduction.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  if (process.env.NODE_ENV !== "production") return new URL(requestUrl).origin;
  return null;
}

export function emailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.MAIL_FROM);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

function buildResetEmail(fullName: string, username: string, link: string) {
  const firstName = fullName.trim().split(/\s+/)[0] || "there";
  const text = [
    `Hi ${firstName},`,
    "",
    `Someone asked to reset the password of your Brew Houze account (@${username}).`,
    `Open this link within ${RESET_LINK_MINUTES} minutes to choose a new password:`,
    link,
    "",
    "If you did not ask for this, you can ignore this email. Your password stays the same.",
    "",
    "Brew Houze Cafe",
  ].join("\n");
  const html = `
  <div style="background:#F8F5F1;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#3D2B1F">
    <div style="max-width:480px;margin:0 auto;background:#FFFFFF;border:1px solid #E8DDD5;border-radius:16px;overflow:hidden">
      <div style="background:#3D2B1F;padding:20px 24px">
        <div style="color:#FDF9F5;font-size:18px;font-weight:bold">Brew Houze</div>
        <div style="color:#F59E0B;font-size:11px;letter-spacing:2px;margin-top:2px">CUSTOMER ACCOUNT</div>
      </div>
      <div style="padding:26px 24px">
        <p style="margin:0 0 12px;font-size:15px">Hi ${escapeHtml(firstName)},</p>
        <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#6B4C3B">Someone asked to reset the password of your Brew Houze account <strong>@${escapeHtml(username)}</strong>. Use the button below within <strong>${RESET_LINK_MINUTES} minutes</strong> to choose a new password.</p>
        <a href="${escapeHtml(link)}" style="display:inline-block;background:#D97706;color:#FFFFFF;text-decoration:none;font-weight:bold;font-size:15px;padding:13px 26px;border-radius:10px">Reset password</a>
        <p style="margin:22px 0 0;font-size:12px;line-height:1.6;color:#9C8278">If the button does not work, copy this link into your browser:<br><span style="color:#6B4C3B;word-break:break-all">${escapeHtml(link)}</span></p>
        <p style="margin:18px 0 0;font-size:12px;line-height:1.6;color:#9C8278">If you did not ask for this, ignore this email. Your password stays the same.</p>
      </div>
    </div>
  </div>`;
  return { subject: "Reset your Brew Houze password", text, html };
}

// Behaves the same whatever happens (unknown email, no email on file, rate-limited), so the
// form never reveals who has an account.
export async function sendCustomerResetEmail(login: string, appUrl: string): Promise<void> {
  const key = login.trim().toLowerCase();
  if (!key) return;
  const account = await pool.query(`
    SELECT customer_id, full_name, username, email FROM customers
    WHERE (LOWER(email) = $1 OR LOWER(username) = $1) AND email IS NOT NULL AND is_active = TRUE AND deleted_at IS NULL AND username IS NOT NULL
    LIMIT 1
  `, [key]);
  const row = account.rows[0];
  if (!row) return;
  const recent = await pool.query(
    "SELECT COUNT(*)::int AS n FROM customer_password_resets WHERE customer_id = $1 AND created_at > CURRENT_TIMESTAMP - make_interval(mins => $2)",
    [row.customer_id, LOGIN_FAILURE_WINDOW_MINUTES]
  );
  if (recent.rows[0].n >= MAX_RESETS_PER_WINDOW) return;
  const token = randomBytes(32).toString("base64url");
  await pool.query(
    "INSERT INTO customer_password_resets (customer_id, token_hash, expires_at) VALUES ($1, $2, CURRENT_TIMESTAMP + make_interval(mins => $3))",
    [row.customer_id, hashToken(token), RESET_LINK_MINUTES]
  );
  const link = `${appUrl.replace(/\/$/, "")}/?reset=${encodeURIComponent(token)}`;
  const port = Number(process.env.SMTP_PORT ?? 465);
  const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
  await transport.sendMail({ from: process.env.MAIL_FROM, to: String(row.email), ...buildResetEmail(String(row.full_name), String(row.username), link) });
}

export async function checkCustomerResetToken(token: string): Promise<{ valid: boolean; username?: string }> {
  if (!token || token.length > 100) return { valid: false };
  const result = await pool.query(`
    SELECT c.username FROM customer_password_resets r
    JOIN customers c ON c.customer_id = r.customer_id AND c.is_active = TRUE AND c.deleted_at IS NULL
    WHERE r.token_hash = $1 AND r.used_at IS NULL AND r.expires_at > CURRENT_TIMESTAMP
  `, [hashToken(token)]);
  return result.rowCount === 0 ? { valid: false } : { valid: true, username: String(result.rows[0].username) };
}

export async function resetCustomerPassword(token: string, newPassword: string): Promise<{ ok: true } | { error: string }> {
  const problem = passwordProblem(newPassword);
  if (problem) return { error: problem };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Locked so two tabs submitting at once cannot both use the link.
    const link = await client.query(`
      SELECT r.customer_id FROM customer_password_resets r
      JOIN customers c ON c.customer_id = r.customer_id AND c.is_active = TRUE AND c.deleted_at IS NULL
      WHERE r.token_hash = $1 AND r.used_at IS NULL AND r.expires_at > CURRENT_TIMESTAMP
      FOR UPDATE OF r
    `, [hashToken(token)]);
    if (link.rowCount === 0) {
      await client.query("ROLLBACK");
      return { error: "This reset link is invalid, already used, or expired. Ask for a new one." };
    }
    const customerId = Number(link.rows[0].customer_id);
    await client.query("UPDATE customers SET password_hash = crypt($2, gen_salt('bf')), updated_at = CURRENT_TIMESTAMP WHERE customer_id = $1", [customerId, newPassword]);
    await client.query("UPDATE customer_password_resets SET used_at = CURRENT_TIMESTAMP WHERE customer_id = $1 AND used_at IS NULL", [customerId]);
    await client.query("DELETE FROM customer_login_failures WHERE username_key IN (SELECT LOWER(username) FROM customers WHERE customer_id = $1)", [customerId]);
    // Whoever knew the old password is signed out everywhere.
    await endCustomerSessions(customerId, "password_reset", client);
    await client.query("COMMIT");
    return { ok: true };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
