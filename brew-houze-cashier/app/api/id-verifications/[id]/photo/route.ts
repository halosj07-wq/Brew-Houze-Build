import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSession, isQueueOnly, QUEUE_ONLY } from "@/lib/sessions";

// The ID photo of a request still waiting to be checked, for the cashier's eyes only: signed-in
// staff, never cached. Once the request is decided the photo no longer exists (404).
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (isQueueOnly(session)) return NextResponse.json(QUEUE_ONLY, { status: 403 });
  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  try {
    const result = await pool.query("SELECT photo, photo_type FROM id_verifications WHERE verification_id = $1 AND status = 'pending' AND photo IS NOT NULL", [id]);
    const row = result.rows[0];
    if (!row) return NextResponse.json({ error: "This photo is no longer available." }, { status: 404 });
    return new NextResponse(new Uint8Array(row.photo as Buffer), {
      headers: { "Content-Type": String(row.photo_type ?? "image/jpeg"), "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) {
    console.error("GET /api/id-verifications/[id]/photo failed:", error);
    return NextResponse.json({ error: "Could not load the photo." }, { status: 500 });
  }
}
