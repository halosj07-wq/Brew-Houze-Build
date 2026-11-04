import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSession } from "@/lib/sessions";

// Where the rider is: sent by their phone (the Deliveries page) while they have deliveries on the way, so the
// café sees them on the delivery map. Only the deliveries they are carrying are updated, and only their newest
// position is kept (no trail).
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  try {
    const body = await request.json() as { lat?: unknown; lng?: unknown; accuracy?: unknown };
    const lat = Number(body.lat), lng = Number(body.lng), accuracy = Number(body.accuracy);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return NextResponse.json({ error: "A valid position is required." }, { status: 400 });
    const result = await pool.query(`
      UPDATE deliveries SET rider_lat = $2, rider_lng = $3, rider_accuracy = $4, rider_seen_at = CURRENT_TIMESTAMP
      WHERE rider_admin_id = $1 AND status = 'out'
    `, [session.adminId, Math.round(lat * 1e6) / 1e6, Math.round(lng * 1e6) / 1e6, Number.isFinite(accuracy) ? Math.min(99999, Math.round(accuracy)) : null]);
    return NextResponse.json({ data: { deliveries: result.rowCount ?? 0 } });
  } catch (error) {
    const code = error && typeof error === "object" ? (error as { code?: string }).code : undefined;
    if (code === "42703") return NextResponse.json({ data: { deliveries: 0, ready: false } });
    console.error("POST /api/deliveries/location failed:", error);
    return NextResponse.json({ error: "Could not save the position." }, { status: 500 });
  }
}
