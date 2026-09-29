import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSession } from "@/lib/sessions";

// The bar and the kitchen (see kitchen-stations-migration.sql): how an order with drinks and food
// is called at the counter. "together": once, when every part is ready. "separate": each part
// on its own. Stored as store_settings.pickup_mode.

async function requireAdmin() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "Not authenticated." }, { status: 401 }) };
  if (String(session.role).toLowerCase() !== "admin") return { error: NextResponse.json({ error: "Only an admin can change this." }, { status: 403 }) };
  return { session };
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  try {
    const result = await pool.query("SELECT setting_value FROM store_settings WHERE setting_key = 'pickup_mode'");
    return NextResponse.json({ data: { pickupMode: result.rows[0]?.setting_value === "separate" ? "separate" : "together" } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/stations failed:", error);
    return NextResponse.json({ error: "Could not load the pickup setting." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  try {
    const body = await request.json() as { pickupMode?: unknown };
    if (body.pickupMode !== "together" && body.pickupMode !== "separate") return NextResponse.json({ error: "Choose together or separate." }, { status: 400 });
    await pool.query(`
      INSERT INTO store_settings (setting_key, setting_value, updated_by, updated_at) VALUES ('pickup_mode', $1, $2, CURRENT_TIMESTAMP)
      ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = CURRENT_TIMESTAMP
    `, [body.pickupMode, auth.session.adminId]);
    return NextResponse.json({ data: { pickupMode: body.pickupMode } });
  } catch (error) {
    console.error("PATCH /api/stations failed:", error);
    return NextResponse.json({ error: "Could not save the pickup setting." }, { status: 500 });
  }
}
