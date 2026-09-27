import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSession } from "@/lib/sessions";

// An uploaded product photo, served on its own so the product list stays small and the browser
// caches each photo. The list links here with ?v=<row version>; a changed product gets a new
// link, so the cached copy can be kept for good.
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { id: rawId } = await context.params;
  const productId = Number(rawId);
  if (!Number.isInteger(productId) || productId <= 0) return NextResponse.json({ error: "A valid product is required." }, { status: 400 });
  try {
    const result = await pool.query("SELECT image_data, image_mime_type, xmin::text AS version FROM products WHERE product_id = $1 AND image_data IS NOT NULL", [productId]);
    const row = result.rows[0];
    if (!row) return NextResponse.json({ error: "No uploaded image." }, { status: 404 });
    const current = new URL(request.url).searchParams.get("v") === row.version;
    return new NextResponse(new Uint8Array(row.image_data as Buffer), {
      headers: {
        "Content-Type": String(row.image_mime_type || "image/webp"),
        "Cache-Control": current ? "private, max-age=31536000, immutable" : "private, max-age=60",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("GET /api/products/[id]/image failed:", error);
    return NextResponse.json({ error: "Could not load the image." }, { status: 500 });
  }
}
