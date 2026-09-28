import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSession } from "@/lib/sessions";

// Barista Featured Specials on the mobile menu (see featured-products-migration.sql): which
// products are featured, their badge (optional) and their order. GET lists every product with
// these fields; PUT saves the whole list at once.

async function requireAdmin() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (String(session.role).toLowerCase() !== "admin") return NextResponse.json({ error: "Only an admin can change the featured products." }, { status: 403 });
  return null;
}

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const result = await pool.query(`
      SELECT product_id, product_name, product_category, is_featured, badge_label, featured_order
      FROM products WHERE is_archived = FALSE
      ORDER BY is_featured DESC, featured_order, product_category NULLS LAST, product_name
    `);
    return NextResponse.json({
      data: result.rows.map((row) => ({
        id: Number(row.product_id), name: String(row.product_name), category: (row.product_category as string | null) ?? "",
        isFeatured: Boolean(row.is_featured), badgeLabel: (row.badge_label as string | null) ?? "", order: Number(row.featured_order),
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/products/featured failed:", error);
    return NextResponse.json({ error: "Could not load the featured products." }, { status: 500 });
  }
}

// Body: { featured: [{ id, badgeLabel }] } in the order they should show. Every other product is
// no longer featured.
export async function PUT(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const client = await pool.connect();
  try {
    const body = await request.json() as { featured?: unknown };
    if (!Array.isArray(body.featured) || body.featured.length > 30) return NextResponse.json({ error: "Feature up to 30 products." }, { status: 400 });
    const featured = body.featured.map((entry) => {
      const item = (entry ?? {}) as { id?: unknown; badgeLabel?: unknown };
      const badge = typeof item.badgeLabel === "string" ? item.badgeLabel.trim().replace(/\s+/g, " ").slice(0, 30) : "";
      return { id: Number(item.id), badge: badge || null };
    });
    if (featured.some((entry) => !Number.isInteger(entry.id) || entry.id <= 0) || new Set(featured.map((entry) => entry.id)).size !== featured.length) return NextResponse.json({ error: "Check the featured products." }, { status: 400 });
    await client.query("BEGIN");
    await client.query("UPDATE products SET is_featured = FALSE, featured_order = 0 WHERE is_featured = TRUE");
    for (const [index, entry] of featured.entries()) {
      await client.query("UPDATE products SET is_featured = TRUE, badge_label = $2, featured_order = $3 WHERE product_id = $1 AND is_archived = FALSE", [entry.id, entry.badge, index + 1]);
    }
    await client.query("COMMIT");
    return NextResponse.json({ data: { featured: featured.length } });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("PUT /api/products/featured failed:", error);
    return NextResponse.json({ error: "Could not save the featured products." }, { status: 500 });
  } finally {
    client.release();
  }
}
