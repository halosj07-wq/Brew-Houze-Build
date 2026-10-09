import { after, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSession } from "@/lib/sessions";
import { signalChange } from "@/lib/realtime";
import { parsePromotion, promotionStatus, type PromotionKind } from "@/lib/promotions";

// Admin, Promotions & Events (see promotions-migration.sql; Objective 9): posts shown to customers
// on the Mobile Menu while they are scheduled to show. Saving a post signals the open menus
// ("promos"), so customers see it without reloading.
//
//   GET                                       every post (archived ones too), newest first
//   POST  { kind, title, message, ... }       adds a post
//   PATCH { id, kind, title, message, ... }   edits a post
//   PATCH { id, action: "on" | "off" | "archive" | "restore" }
//
// Email (optional, per post): with emailCustomers on, the post is emailed once, when it goes live,
// to the customers who switched promo emails on. The Mobile Menu sends it (it knows its own address
// for the links; see brew-houze-mobile/lib/promo-email.ts). Right after a save, and whenever this
// page loads with an email due, this route asks the menu to send now (MOBILE_APP_URL); otherwise
// the next open menu does it within a minute.

const MAX_IMAGE_BYTES = 1024 * 1024;
const IMAGE_TYPES = ["image/webp", "image/jpeg", "image/png"];

type Row = {
  promotion_id: number; kind: PromotionKind; title: string; message: string; has_image: boolean; version: string;
  product_id: number | null; product_name: string | null; event_starts_at: Date | null; event_ends_at: Date | null;
  show_from: Date; show_until: Date | null; is_active: boolean; archived_at: Date | null; created_by_name: string | null; updated_at: Date;
  email_customers: boolean; emailed_at: Date | null; emailed_count: number | null;
};

// Asks the Mobile Menu to send the emails that are due (its /api/promotions does it after answering).
function nudgeEmails() {
  const base = process.env.MOBILE_APP_URL?.trim().replace(/\/$/, "");
  if (!base) return;
  after(() => fetch(`${base}/api/promotions`, { cache: "no-store", signal: AbortSignal.timeout(8000) }).then(() => undefined).catch(() => undefined));
}

const iso = (value: Date | null) => (value ? value.toISOString() : null);

function toPost(row: Row, now: Date) {
  const timing = {
    kind: row.kind, isActive: row.is_active, archivedAt: iso(row.archived_at), showFrom: row.show_from.toISOString(), showUntil: iso(row.show_until),
    eventStartsAt: iso(row.event_starts_at), eventEndsAt: iso(row.event_ends_at),
  };
  return {
    id: Number(row.promotion_id), ...timing, title: row.title, message: row.message,
    image: row.has_image ? `/api/promotions/${row.promotion_id}/image?v=${row.version}` : "",
    productId: row.product_id === null ? null : Number(row.product_id), productName: row.product_name,
    createdBy: row.created_by_name, updatedAt: row.updated_at.toISOString(), status: promotionStatus(timing, now),
    emailCustomers: row.email_customers, emailedAt: iso(row.emailed_at), emailedCount: row.emailed_count === null ? null : Number(row.emailed_count),
  };
}

async function requireAdmin() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "Not authenticated." }, { status: 401 }) };
  if (String(session.role).toLowerCase() !== "admin") return { error: NextResponse.json({ error: "Only an admin can manage promotions and events." }, { status: 403 }) };
  return { session };
}

// The picture on save: a data: URL is a new upload, "keep" leaves the stored one, anything else removes it.
type ImageChange = { kind: "set"; data: Buffer; mimeType: string } | { kind: "keep" } | { kind: "clear" };
function parseImage(value: unknown): ImageChange {
  const text = String(value ?? "");
  if (text === "keep") return { kind: "keep" };
  const match = text.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return { kind: "clear" };
  if (!IMAGE_TYPES.includes(match[1])) throw new Error("Use a JPG, PNG or WebP image.");
  const data = Buffer.from(match[2], "base64");
  if (data.length > MAX_IMAGE_BYTES) throw new Error("That image is too large. Choose it again so it can be resized.");
  return { kind: "set", data, mimeType: match[1] };
}

const SELECT = `
  SELECT p.promotion_id, p.kind, p.title, p.message, (p.image_data IS NOT NULL) AS has_image, p.xmin::text AS version,
    p.product_id, pr.product_name, p.event_starts_at, p.event_ends_at, p.show_from, p.show_until, p.is_active, p.archived_at,
    u.full_name AS created_by_name, p.updated_at, p.email_customers, p.emailed_at, p.emailed_count
  FROM promotions p
  LEFT JOIN products pr ON pr.product_id = p.product_id
  LEFT JOIN admin_users u ON u.admin_id = p.created_by`;

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  try {
    const [result, subscribers] = await Promise.all([
      pool.query(`${SELECT} ORDER BY p.archived_at IS NOT NULL, p.created_at DESC, p.promotion_id DESC`),
      pool.query("SELECT COUNT(*)::int AS count FROM customers WHERE promo_emails AND is_active AND deleted_at IS NULL AND email IS NOT NULL"),
    ]);
    const now = new Date();
    const posts = result.rows.map((row: Row) => toPost(row, now));
    if (posts.some((post) => post.emailCustomers && !post.emailedAt && post.status === "showing")) nudgeEmails();
    return NextResponse.json({ data: posts, subscribers: Number(subscribers.rows[0].count) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/promotions failed:", error);
    return NextResponse.json({ error: "Could not load the promotions and events." }, { status: 500 });
  }
}

// The linked menu item must exist and not be archived.
async function productProblem(productId: number | null): Promise<string | null> {
  if (productId === null) return null;
  const found = await pool.query("SELECT 1 FROM products WHERE product_id = $1 AND is_archived = FALSE", [productId]);
  return found.rowCount ? null : "That menu item is not available. Choose another, or none.";
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    const parsed = parsePromotion(body ?? {}, new Date());
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const problem = await productProblem(parsed.post.productId);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    let image: ImageChange;
    try { image = parseImage(body?.image); } catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }); }
    const post = parsed.post;
    const inserted = await pool.query(`
      INSERT INTO promotions (kind, title, message, image_data, image_mime_type, product_id, event_starts_at, event_ends_at, show_from, show_until, is_active, created_by, email_customers)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING promotion_id
    `, [post.kind, post.title, post.message, image.kind === "set" ? image.data : null, image.kind === "set" ? image.mimeType : null, post.productId,
      post.eventStartsAt, post.eventEndsAt, post.showFrom, post.showUntil, post.isActive, auth.session.adminId, body?.emailCustomers === true]);
    const row = (await pool.query(`${SELECT} WHERE p.promotion_id = $1`, [inserted.rows[0].promotion_id])).rows[0];
    signalChange("promos");
    if (row.email_customers) nudgeEmails();
    return NextResponse.json({ data: toPost(row, new Date()) }, { status: 201 });
  } catch (error) {
    console.error("POST /api/promotions failed:", error);
    return NextResponse.json({ error: "Could not add the post." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    const id = Number(body?.id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Choose a post." }, { status: 400 });
    const action = body?.action;
    let result;
    if (action === "on" || action === "off") {
      result = await pool.query("UPDATE promotions SET is_active = $2, updated_at = CURRENT_TIMESTAMP WHERE promotion_id = $1 AND archived_at IS NULL RETURNING promotion_id", [id, action === "on"]);
    } else if (action === "archive") {
      result = await pool.query("UPDATE promotions SET archived_at = CURRENT_TIMESTAMP, archived_by = $2, updated_at = CURRENT_TIMESTAMP WHERE promotion_id = $1 AND archived_at IS NULL RETURNING promotion_id", [id, auth.session.adminId]);
    } else if (action === "restore") {
      // A restored post comes back switched off, so it does not reappear on the menu by surprise.
      result = await pool.query("UPDATE promotions SET archived_at = NULL, archived_by = NULL, is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE promotion_id = $1 AND archived_at IS NOT NULL RETURNING promotion_id", [id]);
    } else if (action === undefined) {
      const parsed = parsePromotion(body ?? {}, new Date());
      if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
      const problem = await productProblem(parsed.post.productId);
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
      let image: ImageChange;
      try { image = parseImage(body?.image); } catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }); }
      const post = parsed.post;
      result = await pool.query(`
        UPDATE promotions SET kind = $2, title = $3, message = $4, product_id = $5, event_starts_at = $6, event_ends_at = $7, show_from = $8, show_until = $9, is_active = $10,
          email_customers = CASE WHEN emailed_at IS NULL THEN $14 ELSE email_customers END,
          image_data = CASE WHEN $11 = 'keep' THEN image_data ELSE $12 END,
          image_mime_type = CASE WHEN $11 = 'keep' THEN image_mime_type ELSE $13 END,
          updated_at = CURRENT_TIMESTAMP
        WHERE promotion_id = $1 AND archived_at IS NULL
        RETURNING promotion_id
      `, [id, post.kind, post.title, post.message, post.productId, post.eventStartsAt, post.eventEndsAt, post.showFrom, post.showUntil, post.isActive,
        image.kind, image.kind === "set" ? image.data : null, image.kind === "set" ? image.mimeType : null, body?.emailCustomers === true]);
    } else {
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
    if (!result.rowCount) return NextResponse.json({ error: "That post was not found, or it is archived." }, { status: 404 });
    const row = (await pool.query(`${SELECT} WHERE p.promotion_id = $1`, [id])).rows[0];
    signalChange("promos");
    if (row.email_customers && !row.emailed_at) nudgeEmails();
    return NextResponse.json({ data: toPost(row, new Date()) });
  } catch (error) {
    console.error("PATCH /api/promotions failed:", error);
    return NextResponse.json({ error: "Could not save the post." }, { status: 500 });
  }
}
