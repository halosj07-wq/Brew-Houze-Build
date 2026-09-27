import { NextResponse } from "next/server";
import pool from "@/lib/db";

// An uploaded product photo for the menu. The menu links here with ?v=<row version>; a changed
// product gets a new link, so browsers and Vercel's CDN keep each photo for good and the
// database is read about once per photo instead of once per customer.
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await context.params;
  const productId = Number(rawId);
  if (!Number.isInteger(productId) || productId <= 0) return NextResponse.json({ error: "A valid product is required." }, { status: 400 });
  try {
    const result = await pool.query("SELECT image_data, image_mime_type, xmin::text AS version FROM products WHERE product_id = $1 AND is_archived = FALSE AND image_data IS NOT NULL", [productId]);
    const row = result.rows[0];
    if (!row) return NextResponse.json({ error: "No uploaded image." }, { status: 404 });
    const current = new URL(request.url).searchParams.get("v") === row.version;
    return new NextResponse(new Uint8Array(row.image_data as Buffer), {
      headers: {
        "Content-Type": String(row.image_mime_type || "image/webp"),
        "Cache-Control": current ? "public, max-age=31536000, immutable" : "public, max-age=60",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("GET /api/products/[id]/image failed:", error);
    return NextResponse.json({ error: "Could not load the image." }, { status: 500 });
  }
}
