import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { validUnsubscribe } from "@/lib/promo-email";

// The "Stop these emails" link in every promo email (see lib/promo-email.ts): switches the
// customer's promo emails off with one tap, no sign-in needed. The link carries a token only the
// café can make, so nobody can unsubscribe someone else.
function page(title: string, body: string, status = 200) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head>
<body style="margin:0;background:#F8F5F1;font-family:Arial,Helvetica,sans-serif;color:#3D2B1F">
<div style="max-width:440px;margin:48px auto;padding:28px 24px;background:#FFFFFF;border:1px solid #E8DDD5;border-radius:16px">
<div style="font-weight:bold;font-size:18px;margin-bottom:10px">Brew Houze</div><h1 style="font-size:20px;margin:0 0 10px">${title}</h1>
<p style="font-size:14px;line-height:1.6;color:#6B4C3B;margin:0 0 18px">${body}</p>
<a href="/" style="display:inline-block;padding:11px 18px;border-radius:12px;background:#D97706;color:#FFFFFF;font-weight:bold;text-decoration:none;font-size:14px">Open the menu</a>
</div></body></html>`;
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

async function unsubscribe(request: Request) {
  const params = new URL(request.url).searchParams;
  const customerId = Number(params.get("c"));
  if (!validUnsubscribe(customerId, params.get("t") ?? "")) return page("This link does not work", "It may be incomplete. You can also switch promo emails off in your account on the menu.", 400);
  try {
    await pool.query("UPDATE customers SET promo_emails = FALSE, promo_emails_changed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE customer_id = $1 AND promo_emails", [customerId]);
    return page("You won't get promo emails anymore", "We stopped emailing you about promos and events. You still see them on the menu, and you can switch emails back on in your account anytime.");
  } catch (error) {
    console.error("Unsubscribe failed:", error);
    return page("Something went wrong", "Please try the link again in a moment.", 500);
  }
}

// GET: the link in the email. POST: one-click unsubscribe from the email app (List-Unsubscribe).
export const GET = unsubscribe;
export const POST = unsubscribe;
