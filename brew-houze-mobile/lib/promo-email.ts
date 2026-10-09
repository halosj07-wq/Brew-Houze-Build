import { createHmac, timingSafeEqual } from "node:crypto";
import nodemailer from "nodemailer";
import pool from "@/lib/db";
import { emailConfigured } from "@/lib/customers";
import { isShowing, manilaWhen, type PromotionKind } from "@/lib/promotions";

// Promotion and event emails (Objective 9; see promotions-migration.sql). When the admin asks for
// it, a post is emailed once, when it goes live, to the customers who switched promo emails on in
// their account. Sending starts from the menu's own /api/promotions request (after the response,
// so no customer waits for it): the Admin Portal calls it right after saving, and every open menu
// calls it each minute, so a scheduled post is emailed as soon as it starts showing. A post is
// claimed (emailed_at) before sending, so two requests never send it twice.

const MAX_RECIPIENTS = 400; // Gmail allows about 500 emails a day
const MAX_POSTS_PER_RUN = 3;

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is not configured.");
  return value;
}

// The token in a customer's unsubscribe link: proves the link was made by the café for them.
export function unsubscribeToken(customerId: number): string {
  return createHmac("sha256", secret()).update(`promo-unsubscribe:${customerId}`).digest("base64url").slice(0, 32);
}

export function validUnsubscribe(customerId: number, token: string): boolean {
  if (!Number.isInteger(customerId) || customerId <= 0 || typeof token !== "string") return false;
  const expected = Buffer.from(unsubscribeToken(customerId));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

type DuePost = {
  promotion_id: number; kind: PromotionKind; title: string; message: string; has_image: boolean; version: string;
  event_starts_at: Date | null; event_ends_at: Date | null; show_from: Date; show_until: Date | null; product_name: string | null;
};
type Recipient = { customer_id: number; full_name: string; email: string };

export function promoEmail(post: DuePost, recipient: Recipient, appUrl: string): { subject: string; text: string; html: string; unsubscribeUrl: string } {
  const firstName = recipient.full_name.trim().split(/\s+/)[0] || "there";
  const label = post.kind === "event" ? "EVENT" : "PROMO";
  const when = post.kind === "event" && post.event_starts_at ? manilaWhen(post.event_starts_at.toISOString()) + (post.event_ends_at ? ` to ${manilaWhen(post.event_ends_at.toISOString())}` : "") : null;
  const unsubscribeUrl = `${appUrl}/api/promotions/unsubscribe?c=${recipient.customer_id}&t=${unsubscribeToken(recipient.customer_id)}`;
  const menuUrl = `${appUrl}/?news=${post.promotion_id}`;
  const imageUrl = post.has_image ? `${appUrl}/api/promotions/${post.promotion_id}/image?v=${post.version}` : null;
  const subject = post.kind === "event" ? `Brew Houze event: ${post.title}` : `Brew Houze: ${post.title}`;
  const text = [
    `Hi ${firstName},`,
    "",
    post.title,
    ...(when ? [`When: ${when}`] : []),
    "",
    post.message,
    ...(post.product_name ? ["", `Featured: ${post.product_name}`] : []),
    "",
    `See it on the menu: ${menuUrl}`,
    "",
    "Brew Houze Cafe",
    `You get this because you switched on promo emails in your Brew Houze account. Stop them: ${unsubscribeUrl}`,
  ].join("\n");
  const html = `
  <div style="background:#F8F5F1;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#3D2B1F">
    <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border:1px solid #E8DDD5;border-radius:16px;overflow:hidden">
      <div style="background:#3D2B1F;padding:20px 24px">
        <div style="color:#FDF9F5;font-size:18px;font-weight:bold">Brew Houze</div>
        <div style="color:#F59E0B;font-size:11px;letter-spacing:2px;margin-top:2px">${label}</div>
      </div>
      ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="" width="520" style="display:block;width:100%;max-width:520px;height:auto" />` : ""}
      <div style="padding:24px">
        <p style="margin:0 0 12px;font-size:15px">Hi ${escapeHtml(firstName)},</p>
        <h1 style="margin:0 0 8px;font-size:22px;line-height:1.25;color:#3D2B1F">${escapeHtml(post.title)}</h1>
        ${when ? `<p style="margin:0 0 12px;font-size:13px;font-weight:bold;color:#B45309">${escapeHtml(when)}</p>` : ""}
        <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#6B4C3B">${escapeHtml(post.message).replace(/\n/g, "<br />")}</p>
        ${post.product_name ? `<p style="margin:0 0 18px;font-size:13px;color:#6B4C3B">Featured: <strong>${escapeHtml(post.product_name)}</strong></p>` : ""}
        <a href="${escapeHtml(menuUrl)}" style="display:inline-block;padding:12px 20px;border-radius:12px;background:#D97706;color:#FFFFFF;font-size:14px;font-weight:bold;text-decoration:none">See it on the menu</a>
      </div>
      <div style="padding:14px 24px;border-top:1px solid #E8DDD5;font-size:11px;line-height:1.6;color:#9C8278">
        You get this email because you switched on promo emails in your Brew Houze account.
        <a href="${escapeHtml(unsubscribeUrl)}" style="color:#9C8278">Stop these emails</a>.
      </div>
    </div>
  </div>`;
  return { subject, text, html, unsubscribeUrl };
}

// Emails the posts that are due (asked for, live now, not sent yet). Returns how many emails went out.
export async function sendDuePromoEmails(appUrl: string | null): Promise<number> {
  if (!appUrl) return 0;
  const configured = emailConfigured();
  if (!configured && process.env.NODE_ENV === "production") return 0;
  const claimed = await pool.query(`
    UPDATE promotions p SET emailed_at = CURRENT_TIMESTAMP
    FROM (
      SELECT promotion_id FROM promotions
      WHERE email_customers AND emailed_at IS NULL AND is_active AND archived_at IS NULL AND show_from <= CURRENT_TIMESTAMP
        AND (show_until IS NULL OR show_until > CURRENT_TIMESTAMP)
      ORDER BY show_from LIMIT ${MAX_POSTS_PER_RUN}
      FOR UPDATE SKIP LOCKED
    ) due
    WHERE p.promotion_id = due.promotion_id
    RETURNING p.promotion_id, p.kind, p.title, p.message, (p.image_data IS NOT NULL) AS has_image, p.xmin::text AS version,
      p.event_starts_at, p.event_ends_at, p.show_from, p.show_until,
      (SELECT product_name FROM products WHERE product_id = p.product_id AND is_archived = FALSE) AS product_name
  `);
  if (!claimed.rowCount) return 0;
  const recipients = (await pool.query(`
    SELECT customer_id, full_name, email FROM customers
    WHERE promo_emails AND is_active AND deleted_at IS NULL AND email IS NOT NULL
    ORDER BY customer_id LIMIT ${MAX_RECIPIENTS}
  `)).rows as Recipient[];
  const port = Number(process.env.SMTP_PORT ?? 465);
  const transport = configured
    ? nodemailer.createTransport({ pool: true, maxConnections: 3, host: process.env.SMTP_HOST, port, secure: port === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } })
    : null;
  let total = 0;
  try {
    for (const post of claimed.rows as DuePost[]) {
      // An event that ended while it waited is not emailed.
      const timing = { kind: post.kind, isActive: true, archivedAt: null, showFrom: post.show_from.toISOString(), showUntil: post.show_until?.toISOString() ?? null, eventStartsAt: post.event_starts_at?.toISOString() ?? null, eventEndsAt: post.event_ends_at?.toISOString() ?? null };
      let sent = 0;
      if (isShowing(timing, new Date())) {
        const results = await Promise.allSettled(recipients.map(async (recipient) => {
          const email = promoEmail(post, recipient, appUrl);
          if (!transport) { console.log(`[promo-email] ${recipient.email}: ${email.subject}`); return; }
          await transport.sendMail({ from: process.env.MAIL_FROM, to: recipient.email, subject: email.subject, text: email.text, html: email.html,
            headers: { "List-Unsubscribe": `<${email.unsubscribeUrl}>` } });
        }));
        sent = results.filter((result) => result.status === "fulfilled").length;
        const failed = results.length - sent;
        if (failed) console.error(`[promo-email] post ${post.promotion_id}: ${failed} of ${results.length} emails failed`);
      }
      await pool.query("UPDATE promotions SET emailed_count = $2 WHERE promotion_id = $1", [post.promotion_id, sent]);
      total += sent;
    }
  } finally {
    transport?.close();
  }
  return total;
}
