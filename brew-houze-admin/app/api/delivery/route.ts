import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSession } from "@/lib/sessions";

// Admin, Delivery (see delivery-setup-migration.sql): the delivery rules and the zones.
//   GET                                 rules, every zone (with how many addresses use it), and the
//                                       deliveries that are open now (in progress, failed and not
//                                       voided, or cash on delivery still with a rider)
//   PATCH { action: "settings", ... }   save the rules
//   POST / PATCH { id, ... }            add or edit a zone
//   DELETE ?id=                         delete a zone no address uses (otherwise switch it off)

const RULE_KEYS = ["delivery_enabled", "delivery_start", "delivery_end", "delivery_max_active", "delivery_free_above", "cod_enabled", "cod_max_amount", "cod_min_orders"];
type Body = { action?: unknown; id?: unknown; enabled?: unknown; start?: unknown; end?: unknown; maxActive?: unknown; freeAbove?: unknown; codEnabled?: unknown; codMaxAmount?: unknown; codMinOrders?: unknown; name?: unknown; description?: unknown; fee?: unknown; minOrder?: unknown; isActive?: unknown };

async function requireAdmin() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "Not authenticated." }, { status: 401 }) };
  if (String(session.role).toLowerCase() !== "admin") return { error: NextResponse.json({ error: "Only an admin can change delivery." }, { status: 403 }) };
  return { session };
}
const time = (value: unknown) => typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : "";
const money = (value: unknown): number | null | "bad" => {
  if (value === null || value === undefined || value === "") return null;
  const amount = Math.round(Number(value) * 100) / 100;
  return Number.isFinite(amount) && amount >= 0 && amount <= 100000 ? amount : "bad";
};

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  try {
    const [settings, zones, live] = await Promise.all([
      pool.query("SELECT setting_key, setting_value FROM store_settings WHERE setting_key = ANY($1::text[])", [RULE_KEYS]),
      pool.query(`
        SELECT z.zone_id, z.name, z.description, z.fee, z.min_order, z.is_active, z.sort_order,
          (SELECT COUNT(*)::int FROM customer_addresses a WHERE a.zone_id = z.zone_id) AS addresses
        FROM delivery_zones z ORDER BY z.sort_order, z.name, z.zone_id
      `),
      pool.query(`
        SELECT d.delivery_id, d.order_id, so.queue_number, d.status, d.payment, d.zone_name, d.recipient_name, so.total_amount, d.cod_collected, d.failure_reason,
          rider.full_name AS rider_name,
          TO_CHAR(COALESCE(d.failed_at, d.delivered_at, d.picked_up_at, d.ready_at, d.created_at) AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS since
        FROM deliveries d
        JOIN sales_orders so ON so.order_id = d.order_id
        LEFT JOIN admin_users rider ON rider.admin_id = d.rider_admin_id
        WHERE (d.status IN ('preparing', 'ready', 'out') AND so.status = 'completed')
          OR (d.status = 'failed' AND so.status = 'completed')
          OR (d.payment = 'cod' AND d.cod_collected IS NOT NULL AND d.cod_remitted_at IS NULL)
        ORDER BY d.created_at ASC LIMIT 100
      `).catch(() => ({ rows: [] as Record<string, unknown>[] })),
    ]);
    const value = new Map(settings.rows.map((row) => [String(row.setting_key), String(row.setting_value)]));
    return NextResponse.json({
      data: {
        rules: {
          enabled: value.get("delivery_enabled") === "true", start: value.get("delivery_start") ?? "", end: value.get("delivery_end") ?? "",
          maxActive: value.get("delivery_max_active") ?? "", freeAbove: value.get("delivery_free_above") ?? "",
          codEnabled: value.get("cod_enabled") === "true", codMaxAmount: value.get("cod_max_amount") ?? "", codMinOrders: value.get("cod_min_orders") ?? "0",
        },
        live: live.rows.map((row) => ({
          id: Number(row.delivery_id), orderId: Number(row.order_id), queueNumber: row.queue_number === null ? null : Number(row.queue_number),
          status: String(row.status), payment: String(row.payment), zone: String(row.zone_name), recipient: String(row.recipient_name), total: Number(row.total_amount),
          codCollected: row.cod_collected === null ? null : Number(row.cod_collected), failureReason: (row.failure_reason as string | null) ?? null,
          rider: (row.rider_name as string | null) ?? null, since: String(row.since),
        })),
        zones: zones.rows.map((row) => ({ id: Number(row.zone_id), name: String(row.name), description: (row.description as string | null) ?? "", fee: Number(row.fee), minOrder: row.min_order === null ? null : Number(row.min_order), isActive: Boolean(row.is_active), addresses: Number(row.addresses) })),
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/delivery failed:", error);
    return NextResponse.json({ error: "Could not load the delivery settings." }, { status: 500 });
  }
}

function cleanZone(body: Body) {
  const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ").slice(0, 60) : "";
  if (!name) return "Enter the zone name.";
  const fee = money(body.fee);
  if (fee === "bad" || fee === null) return "Enter the delivery fee (0 for free).";
  const minOrder = money(body.minOrder);
  if (minOrder === "bad") return "The minimum order must be an amount, or left empty.";
  const description = typeof body.description === "string" && body.description.trim() ? body.description.trim().slice(0, 200) : null;
  return { name, description, fee, minOrder: minOrder === 0 ? null : minOrder, isActive: body.isActive !== false };
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  try {
    const zone = cleanZone(await request.json() as Body);
    if (typeof zone === "string") return NextResponse.json({ error: zone }, { status: 400 });
    const result = await pool.query(`
      INSERT INTO delivery_zones (name, description, fee, min_order, is_active, sort_order)
      VALUES ($1, $2, $3, $4, $5, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM delivery_zones)) RETURNING zone_id
    `, [zone.name, zone.description, zone.fee, zone.minOrder, zone.isActive]);
    return NextResponse.json({ data: { id: Number(result.rows[0].zone_id) } }, { status: 201 });
  } catch (error) {
    console.error("POST /api/delivery failed:", error);
    return NextResponse.json({ error: "Could not add the zone." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  try {
    const body = await request.json() as Body;
    if (body.action === "settings") {
      const start = time(body.start);
      const end = time(body.end);
      if (Boolean(start) !== Boolean(end)) return NextResponse.json({ error: "Set both delivery hours, or leave both empty." }, { status: 400 });
      const maxActive = body.maxActive === "" || body.maxActive === null || body.maxActive === undefined ? "" : Number(body.maxActive);
      if (maxActive !== "" && (!Number.isInteger(maxActive) || maxActive < 1 || maxActive > 100)) return NextResponse.json({ error: "Deliveries at once must be 1 to 100, or empty for no limit." }, { status: 400 });
      const freeAbove = money(body.freeAbove);
      const codMax = money(body.codMaxAmount);
      const codMinOrders = Number(body.codMinOrders ?? 0);
      if (freeAbove === "bad") return NextResponse.json({ error: "Free delivery must be an amount, or empty." }, { status: 400 });
      if (codMax === "bad" || (body.codEnabled === true && !codMax)) return NextResponse.json({ error: "Enter the largest order that can be paid on delivery." }, { status: 400 });
      if (!Number.isInteger(codMinOrders) || codMinOrders < 0 || codMinOrders > 50) return NextResponse.json({ error: "Completed orders before COD must be 0 to 50." }, { status: 400 });
      const values: [string, string][] = [
        ["delivery_enabled", String(body.enabled === true)], ["delivery_start", start], ["delivery_end", end], ["delivery_max_active", String(maxActive)],
        ["delivery_free_above", freeAbove === null ? "" : String(freeAbove)], ["cod_enabled", String(body.codEnabled === true)],
        ["cod_max_amount", codMax === null ? "" : String(codMax)], ["cod_min_orders", String(codMinOrders)],
      ];
      for (const [key, value] of values) {
        await pool.query(`
          INSERT INTO store_settings (setting_key, setting_value, updated_by, updated_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
          ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = CURRENT_TIMESTAMP
        `, [key, value, auth.session.adminId]);
      }
      return NextResponse.json({ data: { saved: true } });
    }
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Choose a zone." }, { status: 400 });
    if (body.name === undefined && typeof body.isActive === "boolean") {
      await pool.query("UPDATE delivery_zones SET is_active = $2, updated_at = CURRENT_TIMESTAMP WHERE zone_id = $1", [id, body.isActive]);
      return NextResponse.json({ data: { id } });
    }
    const zone = cleanZone(body);
    if (typeof zone === "string") return NextResponse.json({ error: zone }, { status: 400 });
    await pool.query("UPDATE delivery_zones SET name = $2, description = $3, fee = $4, min_order = $5, is_active = $6, updated_at = CURRENT_TIMESTAMP WHERE zone_id = $1", [id, zone.name, zone.description, zone.fee, zone.minOrder, zone.isActive]);
    return NextResponse.json({ data: { id } });
  } catch (error) {
    console.error("PATCH /api/delivery failed:", error);
    return NextResponse.json({ error: "Could not save." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Choose a zone." }, { status: 400 });
  try {
    const used = await pool.query("SELECT COUNT(*)::int AS n FROM customer_addresses WHERE zone_id = $1", [id]);
    if (Number(used.rows[0].n) > 0) return NextResponse.json({ error: `${used.rows[0].n} customer address${Number(used.rows[0].n) === 1 ? " is" : "es are"} in this zone. Switch it off instead.` }, { status: 409 });
    await pool.query("DELETE FROM delivery_zones WHERE zone_id = $1", [id]);
    return NextResponse.json({ data: { id } });
  } catch (error) {
    console.error("DELETE /api/delivery failed:", error);
    return NextResponse.json({ error: "Could not delete the zone." }, { status: 500 });
  }
}
