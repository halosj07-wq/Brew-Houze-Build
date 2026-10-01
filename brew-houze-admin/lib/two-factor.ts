import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import nodemailer from "nodemailer";
import type { PoolClient } from "pg";
import pool from "@/lib/db";

// Two-step sign-in (see two-factor-migration.sql). After the password is right, a device the
// account has not used in the last 30 days must also type a 6-digit code emailed to the account.
// The device is then trusted for that account for 30 days. A device is a random id in an httpOnly
// cookie (only its hash is stored), so one shared tablet can be trusted by several accounts.
// brew-houze-admin, brew-houze-cashier and brew-houze-mobile keep identical copies of this file.
//
// TWO_FACTOR=off in the server environment turns the code step off (an emergency switch, for
// example while email is down). Without email settings during local development, the code is
// printed in the server console instead of emailed.

export type AccountKind = "staff" | "customer";
export type Portal = "admin" | "staff" | "mobile";
type Failure = { error: string; status: number };

const DEVICE_COOKIE = "bh_device";
const TRUST_DAYS = 30;
const CODE_MINUTES = 10;
const MAX_WRONG_CODES = 5;
const MAX_SENDS = 4; // the first email and 3 resends
const RESEND_WAIT_SECONDS = 30;
const MAX_CHALLENGES_PER_WINDOW = 6;
const CHALLENGE_WINDOW_MINUTES = 15;
const PORTAL_NAMES: Record<Portal, string> = { admin: "admin portal", staff: "Staff Portal", mobile: "mobile menu" };

export function twoFactorEnabled(): boolean {
  return (process.env.TWO_FACTOR ?? "").trim().toLowerCase() !== "off";
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

// "ha•••••07@gmail.com": enough to recognise one's own address.
function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!domain) return email;
  const visible = name.length <= 2 ? name.slice(0, 1) : `${name.slice(0, 2)}${"•".repeat(Math.max(3, name.length - 4))}${name.slice(-2)}`;
  return `${visible}@${domain}`;
}

function describeDevice(userAgent: string | null): string {
  const ua = userAgent ?? "";
  const device = /iPhone/i.test(ua) ? "iPhone" : /iPad/i.test(ua) ? "iPad" : /Android/i.test(ua) ? "Android" : /Windows/i.test(ua) ? "Windows" : /Macintosh/i.test(ua) ? "Mac" : "Browser";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  return `${device} · ${browser}`;
}

// This browser's device id, made (and stored in the cookie) when `create` is set.
async function deviceId(create: boolean): Promise<string | null> {
  const store = await cookies();
  const current = store.get(DEVICE_COOKIE)?.value;
  if (current && /^[A-Za-z0-9_-]{20,64}$/.test(current)) return current;
  if (!create) return null;
  const id = randomBytes(24).toString("base64url");
  store.set(DEVICE_COOKIE, id, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 400 * 24 * 60 * 60 });
  return id;
}

export async function isTrustedDevice(kind: AccountKind, accountId: number): Promise<boolean> {
  const id = await deviceId(false);
  if (!id) return false;
  const result = await pool.query(
    "UPDATE trusted_devices SET last_used_at = CURRENT_TIMESTAMP WHERE account_kind = $1 AND account_id = $2 AND device_hash = $3 AND trusted_until > CURRENT_TIMESTAMP RETURNING trusted_id",
    [kind, accountId, sha256(id)]
  );
  return (result.rowCount ?? 0) > 0;
}

// After a password reset (or an admin setting a new password), every device must verify again.
export async function forgetTrustedDevices(kind: AccountKind, accountId: number, db: Pick<PoolClient, "query"> = pool): Promise<void> {
  await db.query("DELETE FROM trusted_devices WHERE account_kind = $1 AND account_id = $2", [kind, accountId]);
}

async function accountContact(kind: AccountKind, accountId: number): Promise<{ email: string | null; name: string }> {
  const result = kind === "staff"
    ? await pool.query("SELECT email, full_name FROM admin_users WHERE admin_id = $1", [accountId])
    : await pool.query("SELECT email, full_name FROM customers WHERE customer_id = $1", [accountId]);
  const row = result.rows[0];
  return { email: (row?.email as string | null) ?? null, name: String(row?.full_name ?? "") };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

async function sendCode(email: string, name: string, code: string, portal: Portal): Promise<void> {
  const configured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.MAIL_FROM);
  if (!configured) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[two-factor] Sign-in code for ${email} (${PORTAL_NAMES[portal]}): ${code}`);
      return;
    }
    throw new Error("Email is not set up on the server, so the sign-in code cannot be sent.");
  }
  const firstName = name.trim().split(/\s+/)[0] || "there";
  const portalName = PORTAL_NAMES[portal];
  const text = [
    `Hi ${firstName},`,
    "",
    `Your Brew Houze sign-in code for the ${portalName} is: ${code}`,
    `It works for ${CODE_MINUTES} minutes. After that, this device is remembered for ${TRUST_DAYS} days.`,
    "",
    "If you did not try to sign in, someone may know your password: change it soon. Do not share this code.",
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
        <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#6B4C3B">Your sign-in code for the Brew Houze ${escapeHtml(portalName)}:</p>
        <div style="display:inline-block;padding:12px 22px;border-radius:12px;background:#FFFBEB;border:1px solid #FCD34D;font-family:'Courier New',monospace;font-size:30px;font-weight:bold;letter-spacing:8px;color:#3D2B1F">${code}</div>
        <p style="margin:18px 0 0;font-size:13px;line-height:1.6;color:#6B4C3B">It works for <strong>${CODE_MINUTES} minutes</strong>. After that, this device is remembered for ${TRUST_DAYS} days.</p>
        <p style="margin:14px 0 0;font-size:12px;line-height:1.6;color:#9C8278">If you did not try to sign in, someone may know your password: change it soon. Never share this code, not even with café staff.</p>
      </div>
    </div>
  </div>`;
  const port = Number(process.env.SMTP_PORT ?? 465);
  const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
  await transport.sendMail({ from: process.env.MAIL_FROM, to: email, subject: `${code} is your Brew Houze sign-in code`, text, html });
}

const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

// The password was right on an untrusted device: emails a code and returns the challenge token the
// browser sends back with it (and the masked email to show).
export async function startChallenge(kind: AccountKind, accountId: number, portal: Portal): Promise<{ challenge: string; email: string } | Failure> {
  const contact = await accountContact(kind, accountId);
  if (!contact.email) {
    return { error: kind === "customer"
      ? "Signing in needs a code sent to your email, and your account has no email yet. Ask the café to add your email to your account."
      : "Signing in needs a code sent to your email, and this account has no email. Ask an admin to add one.", status: 409 };
  }
  const recent = await pool.query(
    "SELECT COUNT(*)::int AS n FROM login_challenges WHERE account_kind = $1 AND account_id = $2 AND created_at > CURRENT_TIMESTAMP - make_interval(mins => $3)",
    [kind, accountId, CHALLENGE_WINDOW_MINUTES]
  );
  if (recent.rows[0].n >= MAX_CHALLENGES_PER_WINDOW) return { error: `Too many sign-in codes were sent. Wait ${CHALLENGE_WINDOW_MINUTES} minutes and try again.`, status: 429 };
  const token = randomBytes(32).toString("base64url");
  const code = newCode();
  await pool.query(
    "INSERT INTO login_challenges (account_kind, account_id, portal, token_hash, code_hash, expires_at) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP + make_interval(mins => $6))",
    [kind, accountId, portal, sha256(token), sha256(`${token}:${code}`), CODE_MINUTES]
  );
  await sendCode(contact.email, contact.name, code, portal);
  return { challenge: token, email: maskEmail(contact.email) };
}

// A new code for the same sign-in (the old one stops working).
export async function resendChallenge(token: string, portal: Portal): Promise<{ email: string } | Failure> {
  if (!token || token.length > 100) return { error: "This sign-in has expired. Sign in again.", status: 410 };
  const result = await pool.query(`
    SELECT challenge_id, account_kind, account_id, sends, last_sent_at > CURRENT_TIMESTAMP - make_interval(secs => $3) AS too_soon
    FROM login_challenges
    WHERE token_hash = $1 AND portal = $2 AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP - INTERVAL '30 minutes'
  `, [sha256(token), portal, RESEND_WAIT_SECONDS]);
  const row = result.rows[0];
  if (!row) return { error: "This sign-in has expired. Sign in again.", status: 410 };
  if (row.too_soon) return { error: `Wait ${RESEND_WAIT_SECONDS} seconds before asking for another code.`, status: 429 };
  if (Number(row.sends) >= MAX_SENDS) return { error: "No more codes can be sent for this sign-in. Sign in again.", status: 429 };
  const contact = await accountContact(row.account_kind as AccountKind, Number(row.account_id));
  if (!contact.email) return { error: "This account has no email for the sign-in code.", status: 409 };
  const code = newCode();
  await pool.query(
    "UPDATE login_challenges SET code_hash = $2, sends = sends + 1, attempts = 0, last_sent_at = CURRENT_TIMESTAMP, expires_at = CURRENT_TIMESTAMP + make_interval(mins => $3) WHERE challenge_id = $1",
    [row.challenge_id, sha256(`${token}:${code}`), CODE_MINUTES]
  );
  await sendCode(contact.email, contact.name, code, portal);
  return { email: maskEmail(contact.email) };
}

// Checks the typed code. When it is right, the challenge is used up and this device becomes
// trusted for the account for 30 days. Returns the account to sign in.
export async function verifyChallenge(token: string, code: string, portal: Portal, userAgent: string | null): Promise<{ kind: AccountKind; accountId: number } | Failure> {
  const digits = code.replace(/\D/g, "");
  if (!token || token.length > 100) return { error: "This sign-in has expired. Sign in again.", status: 410 };
  if (digits.length !== 6) return { error: "Type the 6-digit code from the email.", status: 400 };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(`
      SELECT challenge_id, account_kind, account_id, code_hash, attempts, expires_at <= CURRENT_TIMESTAMP AS expired
      FROM login_challenges WHERE token_hash = $1 AND portal = $2 AND used_at IS NULL
      FOR UPDATE
    `, [sha256(token), portal]);
    const row = result.rows[0];
    if (!row || row.expired) { await client.query("ROLLBACK"); return { error: "This code has expired. Ask for a new one, or sign in again.", status: 410 }; }
    if (Number(row.attempts) >= MAX_WRONG_CODES) { await client.query("ROLLBACK"); return { error: "Too many wrong codes. Sign in again to get a new one.", status: 429 }; }
    const expected = Buffer.from(String(row.code_hash), "hex");
    const given = Buffer.from(sha256(`${token}:${digits}`), "hex");
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      await client.query("UPDATE login_challenges SET attempts = attempts + 1 WHERE challenge_id = $1", [row.challenge_id]);
      await client.query("COMMIT");
      const left = MAX_WRONG_CODES - Number(row.attempts) - 1;
      return { error: left > 0 ? `That code is not right. ${left} ${left === 1 ? "try" : "tries"} left.` : "That code is not right. Sign in again to get a new one.", status: 401 };
    }
    await client.query("UPDATE login_challenges SET used_at = CURRENT_TIMESTAMP WHERE challenge_id = $1", [row.challenge_id]);
    const kind = row.account_kind as AccountKind;
    const accountId = Number(row.account_id);
    const id = await deviceId(true);
    await client.query(`
      INSERT INTO trusted_devices (account_kind, account_id, device_hash, device_label, trusted_until)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP + make_interval(days => $5))
      ON CONFLICT (account_kind, account_id, device_hash) DO UPDATE SET trusted_until = EXCLUDED.trusted_until, device_label = EXCLUDED.device_label, last_used_at = CURRENT_TIMESTAMP
    `, [kind, accountId, sha256(id ?? randomBytes(24).toString("base64url")), describeDevice(userAgent), TRUST_DAYS]);
    // Old challenges are not needed after a day.
    await client.query("DELETE FROM login_challenges WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '1 day'");
    await client.query("COMMIT");
    return { kind, accountId };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
