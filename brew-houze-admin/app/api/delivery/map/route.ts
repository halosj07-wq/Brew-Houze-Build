import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSession } from "@/lib/sessions";
import { deliveryMap } from "@/lib/delivery-map";
import { audited } from "@/lib/audit";

// The delivery map (lib/delivery-map.ts) on the Delivery page: every delivery packed or on its way and each rider
// where their phone last was. PUT { lat, lng } sets where the café is (a store setting).
export async function GET() {
  if (!(await getSession())) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  try {
    return NextResponse.json({ data: await deliveryMap(null) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/delivery/map failed:", error);
    return NextResponse.json({ error: "Could not load the map." }, { status: 500 });
  }
}

async function putHandler(request: Request) {
  const session = await getSession();
  if (!session || String(session.role).toLowerCase() !== "admin") return NextResponse.json({ error: "Only an admin can set the café's place." }, { status: 403 });
  try {
    const body = await request.json() as { lat?: unknown; lng?: unknown };
    const lat = Number(body.lat), lng = Number(body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return NextResponse.json({ error: "Tap the café's place on the map." }, { status: 400 });
    for (const [key, value] of [["cafe_lat", lat], ["cafe_lng", lng]] as const) {
      await pool.query(`
        INSERT INTO store_settings (setting_key, setting_value, updated_by, updated_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = CURRENT_TIMESTAMP
      `, [key, String(Math.round(value * 1e6) / 1e6), session.adminId]);
    }
    return NextResponse.json({ data: { lat, lng } });
  } catch (error) {
    console.error("PUT /api/delivery/map failed:", error);
    return NextResponse.json({ error: "Could not save the café's place." }, { status: 500 });
  }
}

// Every change made here goes in the audit log (lib/audit.ts).
export const PUT = audited("Delivery", putHandler);
