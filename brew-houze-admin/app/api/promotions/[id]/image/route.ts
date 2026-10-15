import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSession } from "@/lib/sessions";

// A post's picture (see api/promotions), served on its own like the product photos. The list links
// here with ?v=<row version>, so a changed post gets a new link and the cached copy can be kept.
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { id: rawId } = await context.params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "A valid post is required." }, { status: 400 });
  try {
    const result = await pool.query("SELECT image_data, image_mime_type, xmin::text AS version FROM promotions WHERE promotion_id = $1 AND image_data IS NOT NULL", [id]);
    const row = result.rows[0];
    if (!row) return NextResponse.json({ error: "No picture." }, { status: 404 });
    const current = new URL(request.url).searchParams.get("v") === row.version;
    return new NextResponse(new Uint8Array(row.image_data as Buffer), {
      headers: {
        "Content-Type": String(row.image_mime_type || "image/webp"),
        "Cache-Control": current ? "private, max-age=31536000, immutable" : "private, max-age=60",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("GET /api/promotions/[id]/image failed:", error);
    return NextResponse.json({ error: "Could not load the picture." }, { status: 500 });
  }
}
