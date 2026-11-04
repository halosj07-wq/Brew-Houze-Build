import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSession } from "@/lib/sessions";

// The photo a rider took at the door as proof of delivery (?id= the delivery).
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const id = Number(params.get("id") ?? params.get("order"));
  const byOrder = !params.get("id");
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "A valid delivery is required." }, { status: 400 });
  try {
    const result = await pool.query(`SELECT proof_photo, proof_mime FROM deliveries WHERE ${byOrder ? "order_id" : "delivery_id"} = $1 ORDER BY delivery_id DESC LIMIT 1`, [id]);
    const row = result.rows[0];
    
    if (!row?.proof_photo) return NextResponse.json({ error: "No photo for this delivery." }, { status: 404 });
    return new NextResponse(new Uint8Array(row.proof_photo as Buffer), { headers: { "Content-Type": String(row.proof_mime ?? "image/jpeg"), "Cache-Control": "private, max-age=3600" } });
  } catch (error) {
    console.error("GET /api/delivery/proof failed:", error);
    return NextResponse.json({ error: "Could not load the photo." }, { status: 500 });
  }
}
