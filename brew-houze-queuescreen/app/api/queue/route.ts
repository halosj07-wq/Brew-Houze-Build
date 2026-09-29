import { NextResponse } from "next/server";
import pool from "@/lib/db";

// The customer screen. With the bar and the kitchen (order_stations), pickup_mode decides what is
// called: "together" shows an order ready once every part is ready (as before); "separate" calls
// the drinks and the food on their own, so an order can wait for its food while its drinks are
// ready. Deliveries never show here.
const PARTS_SQL = `COALESCE((SELECT json_agg(json_build_object('station', os.station, 'status', os.status, 'ready_at', os.ready_at) ORDER BY os.station) FROM order_stations os WHERE os.order_id = so.order_id),
  json_build_array(json_build_object('station', 'bar', 'status', CASE WHEN so.queue_status = 'served' THEN 'ready' ELSE 'waiting' END, 'ready_at', so.served_at)))`;
type Part = { station: "bar" | "kitchen"; status: "waiting" | "ready" | "picked_up"; ready_at?: string | null };
const PART_NAME = { bar: "Drinks", kitchen: "Food" } as const;

async function pickupMode(): Promise<"together" | "separate"> {
  const result = await pool.query("SELECT setting_value FROM store_settings WHERE setting_key = 'pickup_mode'").catch(() => ({ rows: [] as { setting_value: string }[] }));
  return result.rows[0]?.setting_value === "separate" ? "separate" : "together";
}

export async function GET(request: Request) {
  try {
    const mode = await pickupMode();
    const signatureResult = await pool.query(`
      SELECT COUNT(*)::int AS total,
        COALESCE(MAX(so.order_id), 0)::int AS latest_order_id,
        COALESCE(MAX(so.served_at), TIMESTAMP 'epoch') AS latest_served_at,
        COALESCE(SUM((SELECT COUNT(*) FROM order_stations os WHERE os.order_id = so.order_id AND os.status <> 'waiting')), 0)::int AS parts_done,
        $1::text AS mode
      FROM sales_orders so
      WHERE so.queue_status IN ('waiting', 'served') AND so.service_type IS DISTINCT FROM 'delivery'
    `, [mode]);
    if (new URL(request.url).searchParams.get("signatureOnly") === "1") {
      return NextResponse.json({ signature: signatureResult.rows[0] }, { headers: { "Cache-Control": "no-store" } });
    }
    const result = await pool.query(`
      SELECT
        so.order_id,
        so.queue_number,
        so.queue_status,
        so.served_at,
        ${PARTS_SQL} AS parts,
        TO_CHAR(so.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS created_at,
        COALESCE(
          STRING_AGG(
            p.product_name || CASE
              WHEN pv.size_label IS NULL THEN ''
              ELSE ' (' || pv.size_label || CASE
                WHEN pv.temperature IN ('hot', 'cold') THEN ' · ' || INITCAP(pv.temperature)
                ELSE ''
              END || ')'
            END
            || ' x' || soi.quantity::text,
            ', ' ORDER BY p.product_name, pv.size_label, pv.temperature
          ),
          'Order'
        ) AS items
      FROM sales_orders so
      JOIN sales_order_items soi ON soi.order_id = so.order_id
      JOIN products p ON p.product_id = soi.product_id
      LEFT JOIN product_variants pv ON pv.product_variant_id = soi.product_variant_id
      WHERE so.queue_status IN ('waiting', 'served') AND so.service_type IS DISTINCT FROM 'delivery'
      GROUP BY so.order_id
      ORDER BY so.queue_status DESC, so.queue_number ASC
    `);

    const orders = result.rows as { order_id: number; queue_number: number; queue_status: string; served_at: string | null; parts: Part[]; items: string; created_at: string }[];
    // label: which part, when drinks and food are called separately (null: the whole order).
    // ready_at: when it was called (ready lists show the newest first).
    const entry = (order: (typeof orders)[number], part: Part | null, readyAt: string | null = null) => ({ order_id: order.order_id, queue_number: order.queue_number, created_at: order.created_at, items: order.items, key: `${order.order_id}:${part?.station ?? "all"}`, label: part ? PART_NAME[part.station] : null, ready_at: readyAt });
    const newestFirst = (a: { ready_at: string | null }, b: { ready_at: string | null }) => new Date(b.ready_at ?? 0).getTime() - new Date(a.ready_at ?? 0).getTime();
    const data = mode === "separate"
      ? {
        waiting: orders.flatMap((order) => order.parts.filter((part) => part.status === "waiting").map((part) => entry(order, order.parts.length > 1 ? part : null))),
        ready: orders.flatMap((order) => order.parts.filter((part) => part.status === "ready").map((part) => entry(order, order.parts.length > 1 ? part : null, part.ready_at ?? order.served_at))).sort(newestFirst),
      }
      : {
        waiting: orders.filter((order) => order.queue_status === "waiting").map((order) => entry(order, null)),
        ready: orders.filter((order) => order.queue_status === "served").map((order) => entry(order, null, order.served_at)).sort(newestFirst),
      };

    return NextResponse.json({ data, mode, updatedAt: new Date().toISOString() }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("GET /api/queue failed:", error);
    return NextResponse.json({ error: "Could not retrieve the queue." }, { status: 500 });
  }
}
