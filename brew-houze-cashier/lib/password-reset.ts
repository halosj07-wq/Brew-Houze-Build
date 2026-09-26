import { createHash, randomBytes } from "node:crypto";
import nodemailer from "nodemailer";
import pool from "@/lib/db";
import { endAllSessions } from "@/lib/sessions";

// "Forgot password?" for staff accounts. A single-use link is emailed to the account address.
// Only a SHA-256 hash of the link token is stored, the link expires after 30 minutes, and using
// it cancels every other pending link for that account. See password-reset-migration.sql.

const RESET_LINK_MINUTES = 30;
const MAX_REQUESTS_PER_WINDOW = 3;
const REQUEST_WINDOW_MINUTES = 15;
export const MIN_PASSWORD_LENGTH = 8;
// bcrypt only uses the first 72 bytes of a password, so longer ones are refused rather than
// silently truncated.
export const MAX_PASSWORD_LENGTH = 72;

// Where reset links point. Never taken from the incoming request in production: the Host header
// can be forged ("password reset poisoning"), and Vercel also serves each deployment on its own
// URL. Order: APP_URL, then the Vercel production domain, then (local development only) the
// address the request came in on. Returns null when no trustworthy address is configured.
export function resolveAppUrl(requestUrl: string): string | null {
  const configured = process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const vercelProduction = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelProduction) return `https://${vercelProduction.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  if (process.env.NODE_ENV !== "production") return new URL(requestUrl).origin;
  return null;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

// "ha•••••07@gmail.com": enough for someone to recognise their own address on the reset page.
export function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!domain) return email;
  const visible = name.length <= 2 ? name.slice(0, 1) : `${name.slice(0, 2)}${"•".repeat(Math.max(3, name.length - 4))}${name.slice(-2)}`;
  return `${visible}@${domain}`;
}

function createTransport() {
  const port = Number(process.env.SMTP_PORT ?? 465);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

function buildEmail(fullName: string, link: string, portalName: string) {
  const firstName = fullName.trim().split(/\s+/)[0] || "there";
  const text = [
    `Hi ${firstName},`,
    "",
    `Someone asked to reset the password of your Brew Houze ${portalName} account.`,
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
        <div style="color:#F59E0B;font-size:11px;letter-spacing:2px;margin-top:2px">${escapeHtml(portalName.toUpperCase())}</div>
      </div>
      <div style="padding:26px 24px">
        <p style="margin:0 0 12px;font-size:15px">Hi ${escapeHtml(firstName)},</p>
        <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#6B4C3B">Someone asked to reset the password of your Brew Houze ${escapeHtml(portalName)} account. Use the button below within <strong>${RESET_LINK_MINUTES} minutes</strong> to choose a new password.</p>
        <a href="${escapeHtml(link)}" style="display:inline-block;background:#D97706;color:#FFFFFF;text-decoration:none;font-weight:bold;font-size:15px;padding:13px 26px;border-radius:10px">Reset password</a>
        <p style="margin:22px 0 0;font-size:12px;line-height:1.6;color:#9C8278">If the button does not work, copy this link into your browser:<br><span style="color:#6B4C3B;word-break:break-all">${escapeHtml(link)}</span></p>
        <p style="margin:18px 0 0;font-size:12px;line-height:1.6;color:#9C8278">If you did not ask for this, ignore this email. Your password stays the same.</p>
      </div>
    </div>
  </div>`;
  return { subject: "Reset your Brew Houze password", text, html };
}

// Always behaves the same from the outside: unknown emails, inactive accounts and rate-limited
// requests quietly send nothing, so the form never reveals which emails have accounts.
export async function sendPasswordResetEmail(email: string, appUrl: string, portalName: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return;
  const account = await pool.query(
    "SELECT admin_id, full_name, email FROM admin_users WHERE LOWER(email) = $1 AND is_active = TRUE LIMIT 1",
    [normalized]
  );
  if (account.rowCount === 0) return;
  const { admin_id: adminId, full_name: fullName, email: accountEmail } = account.rows[0];

  const recent = await pool.query(
    "SELECT COUNT(*)::int AS n FROM password_reset_tokens WHERE admin_id = $1 AND created_at > CURRENT_TIMESTAMP - make_interval(mins => $2)",
    [adminId, REQUEST_WINDOW_MINUTES]
  );
  if (recent.rows[0].n >= MAX_REQUESTS_PER_WINDOW) return;

  const token = randomBytes(32).toString("base64url");
  await pool.query(
    "INSERT INTO password_reset_tokens (admin_id, token_hash, expires_at) VALUES ($1, $2, CURRENT_TIMESTAMP + make_interval(mins => $3))",
    [adminId, hashToken(token), RESET_LINK_MINUTES]
  );

  const link = `${appUrl.replace(/\/$/, "")}/?reset_token=${encodeURIComponent(token)}`;
  const message = buildEmail(String(fullName), link, portalName);
  await createTransport().sendMail({ from: process.env.MAIL_FROM, to: accountEmail, ...message });
}

// Checks a link before showing the "choose a new password" form.
export async function checkResetToken(token: string): Promise<{ valid: boolean; email?: string }> {
  if (!token) return { valid: false };
  const result = await pool.query(`
    SELECT u.email
    FROM password_reset_tokens t
    JOIN admin_users u ON u.admin_id = t.admin_id AND u.is_active = TRUE
    WHERE t.token_hash = $1 AND t.used_at IS NULL AND t.expires_at > CURRENT_TIMESTAMP
  `, [hashToken(token)]);
  return result.rowCount === 0 ? { valid: false } : { valid: true, email: maskEmail(String(result.rows[0].email)) };
}

export async function resetPasswordWithToken(token: string, newPassword: string): Promise<{ ok: true } | { error: string }> {
  if (newPassword.length < MIN_PASSWORD_LENGTH) return { error: `The new password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  if (Buffer.byteLength(newPassword, "utf8") > MAX_PASSWORD_LENGTH) return { error: `The new password is too long (max ${MAX_PASSWORD_LENGTH} characters).` };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Lock the link so two tabs submitting at once cannot both use it.
    const link = await client.query(`
      SELECT t.admin_id
      FROM password_reset_tokens t
      JOIN admin_users u ON u.admin_id = t.admin_id AND u.is_active = TRUE
      WHERE t.token_hash = $1 AND t.used_at IS NULL AND t.expires_at > CURRENT_TIMESTAMP
      FOR UPDATE OF t
    `, [hashToken(token)]);
    if (link.rowCount === 0) {
      await client.query("ROLLBACK");
      return { error: "This reset link is invalid, already used, or expired. Request a new one from the login screen." };
    }
    const adminId = link.rows[0].admin_id;
    await client.query("UPDATE admin_users SET password_hash = crypt($2, gen_salt('bf')) WHERE admin_id = $1", [adminId, newPassword]);
    // This link and any other pending links for the account stop working.
    await client.query("UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE admin_id = $1 AND used_at IS NULL", [adminId]);
    // Whoever knew the old password is signed out of every device.
    await endAllSessions(Number(adminId), "password_reset", client);
    await client.query("COMMIT");
    return { ok: true };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
