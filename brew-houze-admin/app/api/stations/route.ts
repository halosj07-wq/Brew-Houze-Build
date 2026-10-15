import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSession } from "@/lib/sessions";

// The bar and the kitchen (see kitchen-stations-migration.sql): how an order with drinks and food
// is called at the counter. "together": once, when every part is ready. "separate": each part
// on its own. "per_order": each order chooses at checkout, on the Staff Portal or the mobile menu
// (kept on the order, see pickup-choice-migration.sql). Stored as store_settings.pickup_mode.
const MODES = ["together", "separate", "per_order"] as const;

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
    const value = result.rows[0]?.setting_value;
    return NextResponse.json({ data: { pickupMode: MODES.includes(value) ? value : "together" } }, { headers: { "Cache-Control": "no-store" } });
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
    if (!MODES.includes(body.pickupMode as (typeof MODES)[number])) return NextResponse.json({ error: "Choose together, separate, or let each order choose." }, { status: 400 });
    // Each order's choice needs its columns (pickup-choice-migration.sql).
    if (body.pickupMode === "per_order") {
      const ready = await pool.query("SELECT COUNT(*)::int AS n FROM information_schema.columns WHERE table_schema = current_schema() AND column_name = 'pickup_mode' AND table_name IN ('sales_orders', 'payment_checkouts', 'counter_carts')");
      if (Number(ready.rows[0].n) < 3) return NextResponse.json({ error: "Letting each order choose needs a database update first: run pickup-choice-migration.sql, then try again." }, { status: 409 });
    }
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
