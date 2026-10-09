import { after, NextResponse } from "next/server";
import pool from "@/lib/db";
import { isShowing, sortForCustomers, type PromotionKind } from "@/lib/promotions";
import { sendDuePromoEmails } from "@/lib/promo-email";
import { resolveAppUrl } from "@/lib/customers";

// The promotions and events showing now (see lib/promotions.ts; Objective 9), for the banner and
// the bell on the menu. Public, like the menu itself: only what the café chose to show. The menu
// reloads this when the admin saves a post (Supabase Realtime "promos") and every minute, so a
// scheduled post appears, and an ended one disappears, on time. After answering, it emails any post
// that just went live to the customers who asked for promo emails (see lib/promo-email.ts).
type Row = {
  promotion_id: number; kind: PromotionKind; title: string; message: string; has_image: boolean; version: string;
  product_id: number | null; product_name: string | null; event_starts_at: Date | null; event_ends_at: Date | null;
  show_from: Date; show_until: Date | null; updated_at: Date;
};
const iso = (value: Date | null) => (value ? value.toISOString() : null);

export async function GET(request: Request) {
  try {
    // Candidates from the database (on, not archived, show window open); isShowing also ends events.
    const result = await pool.query(`
      SELECT p.promotion_id, p.kind, p.title, p.message, (p.image_data IS NOT NULL) AS has_image, p.xmin::text AS version,
        p.product_id, pr.product_name, p.event_starts_at, p.event_ends_at, p.show_from, p.show_until, p.updated_at
      FROM promotions p
      LEFT JOIN products pr ON pr.product_id = p.product_id AND pr.is_archived = FALSE
      WHERE p.is_active AND p.archived_at IS NULL AND p.show_from <= CURRENT_TIMESTAMP
        AND (p.show_until IS NULL OR p.show_until > CURRENT_TIMESTAMP)
    `);
    const now = new Date();
    const posts = result.rows.map((row: Row) => ({
      id: Number(row.promotion_id), kind: row.kind, title: row.title, message: row.message,
      image: row.has_image ? `/api/promotions/${row.promotion_id}/image?v=${row.version}` : "",
      // The linked menu item, only while it is on the menu.
      productId: row.product_name === null ? null : Number(row.product_id), productName: row.product_name,
      eventStartsAt: iso(row.event_starts_at), eventEndsAt: iso(row.event_ends_at),
      showFrom: row.show_from.toISOString(), showUntil: iso(row.show_until),
      // Changes when the post is edited, so an edited post counts as new on the bell.
      version: `${row.promotion_id}:${row.updated_at.getTime()}`,
    })).filter((post) => isShowing({ ...post, isActive: true, archivedAt: null }, now));
    const appUrl = resolveAppUrl(request.url);
    after(() => sendDuePromoEmails(appUrl).catch((error) => console.error("Promo emails failed:", error)));
    return NextResponse.json({ data: sortForCustomers(posts) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/promotions failed:", error);
    return NextResponse.json({ error: "Could not load the café's news." }, { status: 500 });
  }
}
