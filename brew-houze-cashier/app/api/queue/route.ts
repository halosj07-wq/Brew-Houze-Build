import { customTextSql } from "@/lib/orders";
import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSession } from "@/lib/sessions";
import { canHandOff, handOver, markReady, parseStation, pickupMode, stationForRole, StationError } from "@/lib/stations";
import { signalChange } from "@/lib/realtime";

// An order's parts (bar, kitchen) and their progress; an order from before stations is one bar part.
const PARTS_SQL = `COALESCE((SELECT json_agg(json_build_object('station', os.station, 'status', os.status) ORDER BY os.station) FROM order_stations os WHERE os.order_id = so.order_id),
  json_build_array(json_build_object('station', 'bar', 'status', CASE WHEN so.queue_status = 'served' THEN 'ready' ELSE 'waiting' END)))`;
type Part = { station: "bar" | "kitchen"; status: "waiting" | "ready" | "picked_up" };

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  try {
    // Counts for this person: what their station has to make, and (at the counter) what is
    // ready to hand over (whole orders, or parts when drinks and food are picked up separately).
    const station = stationForRole(session.role);
    const mode = await pickupMode();
    const handsOff = canHandOff(session.role);
    const signatureResult = await pool.query(`
      WITH open_orders AS (
        SELECT so.order_id, so.queue_status, so.served_at, so.service_type, ${PARTS_SQL} AS parts
        FROM sales_orders so
        WHERE (so.queue_status = 'waiting' OR (so.queue_status = 'served' AND so.service_type IS DISTINCT FROM 'delivery'))
      ), parts AS (
        SELECT o.order_id, o.queue_status, o.service_type, part->>'station' AS station, part->>'status' AS status FROM open_orders o, json_array_elements(o.parts) part
      )
      SELECT (SELECT COUNT(*) FROM open_orders)::int AS total,
        (SELECT COALESCE(MAX(order_id), 0) FROM open_orders)::int AS latest_order_id,
        (SELECT COALESCE(MAX(served_at), TIMESTAMP 'epoch') FROM open_orders) AS latest_served_at,
        (SELECT COUNT(DISTINCT order_id) FROM parts WHERE queue_status = 'waiting' AND status = 'waiting' AND ($1::text IS NULL OR station = $1::text))::int AS waiting_count,
        (CASE WHEN NOT $2::boolean THEN 0
          WHEN $3::text = 'separate' THEN (SELECT COUNT(*) FROM parts WHERE status = 'ready' AND service_type IS DISTINCT FROM 'delivery')
          ELSE (SELECT COUNT(*) FROM open_orders WHERE queue_status = 'served') END)::int AS ready_count
    `, [station, handsOff, mode]);
    if (new URL(request.url).searchParams.get("signatureOnly") === "1") {
      // For the Deliveries badge: packed orders waiting for a rider, failed deliveries to void, and
      // cash on delivery not handed in (mine_cash: what this rider still has to hand in).
      const deliveries = await pool.query(`
        SELECT COUNT(*) FILTER (WHERE d.status = 'ready' AND so.status = 'completed')::int AS ready,
          COUNT(*) FILTER (WHERE d.status = 'failed' AND so.status = 'completed')::int AS failed,
          COUNT(*) FILTER (WHERE d.payment = 'cod' AND d.cod_collected IS NOT NULL AND d.cod_remitted_at IS NULL)::int AS cash,
          COUNT(*) FILTER (WHERE d.payment = 'cod' AND d.cod_collected IS NOT NULL AND d.cod_remitted_at IS NULL AND d.rider_admin_id = $1)::int AS mine_cash
        FROM deliveries d JOIN sales_orders so ON so.order_id = d.order_id
        WHERE d.status IN ('ready', 'failed') OR (d.payment = 'cod' AND d.cod_collected IS NOT NULL AND d.cod_remitted_at IS NULL)
      `, [session.adminId]).then((result) => result.rows[0]).catch(() => null);
      // The counter line (the cashier's badge): carts sent to pay at the counter, ID photos to check,
      // and Stars sign scans, still in time. Not for staff who only see a queue.
      const line = session.role && ["barista", "kitchen", "rider"].includes(String(session.role).toLowerCase()) ? null : await pool.query(`
        SELECT (SELECT COUNT(*) FROM counter_carts WHERE status = 'waiting' AND expires_at > CURRENT_TIMESTAMP)
          + (SELECT COUNT(*) FROM id_verifications WHERE status = 'pending' AND expires_at > CURRENT_TIMESTAMP)
          + (SELECT COUNT(*) FROM loyalty_claims WHERE status = 'pending' AND expires_at > CURRENT_TIMESTAMP) AS n
      `).then((result) => Number(result.rows[0].n)).catch(() => null);
      return NextResponse.json({ signature: signatureResult.rows[0], deliveries, line }, { headers: { "Cache-Control": "no-store" } });
    }
    const result = await pool.query(`
      SELECT
        so.order_id,
        so.queue_number,
        so.queue_status,
        so.order_source,
        -- Dine in (mug) or take out (cup), and the customer with the café's notes, for the barista.
        so.service_type,
        ${PARTS_SQL} AS parts,
        cu.full_name AS customer_name,
        cu.notes AS customer_notes,
        -- A mobile order with an ID discount (senior, PWD...): the barista checks the real ID at pickup.
        (SELECT STRING_AGG(DISTINCT od.type_name, ', ') FROM order_discounts od WHERE od.order_id = so.order_id AND so.order_source = 'online') AS id_check,
        TO_CHAR(so.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS created_at,
        COALESCE((
          SELECT json_agg(json_build_object(
            'product_name', detail_product.product_name,
            'size_label', detail_variant.size_label,
            'temperature', detail_variant.temperature,
            'quantity', detail_item.quantity,
            'custom', ${customTextSql("detail_item")},
            'station', COALESCE(detail_item.station, 'bar'),
            'additions', COALESCE((
              SELECT json_agg(json_build_object(
                'name', detail_addition.addition_name,
                'quantity', detail_addition_link.quantity
              ) ORDER BY detail_addition.addition_name)
              FROM sales_order_item_additions detail_addition_link
              JOIN additions detail_addition ON detail_addition.addition_id = detail_addition_link.addition_id
              WHERE detail_addition_link.order_item_id = detail_item.order_item_id
            ), '[]'::json)
          ) ORDER BY detail_item.order_item_id)
          FROM sales_order_items detail_item
          JOIN products detail_product ON detail_product.product_id = detail_item.product_id
          LEFT JOIN product_variants detail_variant ON detail_variant.product_variant_id = detail_item.product_variant_id
          WHERE detail_item.order_id = so.order_id
        ), '[]'::json) AS order_details,
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
      LEFT JOIN customers cu ON cu.customer_id = so.customer_id AND cu.deleted_at IS NULL
      WHERE (so.queue_status = 'waiting' OR (so.queue_status = 'served' AND so.service_type IS DISTINCT FROM 'delivery'))
      GROUP BY so.order_id, cu.customer_id
      ORDER BY so.queue_status DESC, so.queue_number ASC
    `);
    const recentResult = await pool.query(`
      SELECT so.order_id, so.queue_number, so.status, so.total_amount, so.order_source, so.payment_method, so.payment_provider, so.cash_portion, so.reversal_type,
        so.discount_label, so.discount_amount + so.vat_exempt_amount AS discount_total, so.service_type,
        -- Cash on delivery the rider never collected: nothing to hand back on a void.
        (so.payment_method = 'cod' AND NOT EXISTS (SELECT 1 FROM deliveries d WHERE d.order_id = so.order_id AND d.cod_collected IS NOT NULL)) AS cod_unpaid,
        so.return_method, so.return_gcash_name, so.return_gcash_number, so.return_reference, reverser.full_name AS reversed_by, cu.full_name AS customer_name,
        TO_CHAR(so.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS created_at,
        TO_CHAR(so.reversed_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS reversed_at,
        COALESCE((
          SELECT json_agg(json_build_object(
            'product_name', detail_product.product_name,
            'size_label', detail_variant.size_label,
            'temperature', detail_variant.temperature,
            'quantity', detail_item.quantity,
            'custom', ${customTextSql("detail_item")},
            'additions', COALESCE((
              SELECT json_agg(json_build_object(
                'name', detail_addition.addition_name,
                'quantity', detail_addition_link.quantity
              ) ORDER BY detail_addition.addition_name)
              FROM sales_order_item_additions detail_addition_link
              JOIN additions detail_addition ON detail_addition.addition_id = detail_addition_link.addition_id
              WHERE detail_addition_link.order_item_id = detail_item.order_item_id
            ), '[]'::json)
          ) ORDER BY detail_item.order_item_id)
          FROM sales_order_items detail_item
          JOIN products detail_product ON detail_product.product_id = detail_item.product_id
          LEFT JOIN product_variants detail_variant ON detail_variant.product_variant_id = detail_item.product_variant_id
          WHERE detail_item.order_id = so.order_id
        ), '[]'::json) AS order_details,
        COALESCE(
          STRING_AGG(
            p.product_name || CASE
              WHEN pv.size_label IS NULL THEN ''
              ELSE ' (' || pv.size_label || CASE
                WHEN pv.temperature IN ('hot', 'cold') THEN ' · ' || INITCAP(pv.temperature)
                ELSE ''
              END || ')'
            END || ' x' || soi.quantity::text,
            ', ' ORDER BY p.product_name, pv.size_label, pv.temperature
          ), 'Order'
        ) AS items
      FROM sales_orders so
      LEFT JOIN admin_users reverser ON reverser.admin_id = so.reversed_by_admin_id
      LEFT JOIN customers cu ON cu.customer_id = so.customer_id AND cu.deleted_at IS NULL
      JOIN sales_order_items soi ON soi.order_id = so.order_id
      JOIN products p ON p.product_id = soi.product_id
      LEFT JOIN product_variants pv ON pv.product_variant_id = soi.product_variant_id
      -- Order history lists the orders of the shift that is open now, the only ones that can be reversed.
      WHERE so.status IN ('completed', 'voided', 'refunded') AND so.is_archived = FALSE
        AND so.shift_id = (SELECT shift_id FROM shifts WHERE closed_at IS NULL LIMIT 1)
      GROUP BY so.order_id, reverser.full_name, cu.customer_id
      ORDER BY so.created_at DESC, so.order_id DESC
      LIMIT 500
    `);
    // This person's view: what to make (their station's parts still being made; the counter sees
    // every order with a part being made), and what to hand over (whole ready orders, or ready
    // parts when picked up separately). The kitchen sees what it sent to the counter.
    const open = result.rows as (Record<string, unknown> & { parts: Part[]; queue_status: string; service_type: string | null })[];
    const waiting = open.filter((order) => order.queue_status === "waiting" && order.parts.some((part) => part.status === "waiting" && (!station || part.station === station)));
    const ready = !handsOff
      ? open.filter((order) => order.parts.some((part) => part.station === station && part.status === "ready")).map((order) => ({ ...order, handoff_station: station }))
      : mode === "separate"
        ? open.filter((order) => order.service_type !== "delivery").flatMap((order) => order.parts.filter((part) => part.status === "ready").map((part) => ({ ...order, handoff_station: order.parts.length > 1 ? part.station : null })))
        : open.filter((order) => order.queue_status === "served").map((order) => ({ ...order, handoff_station: null }));
    return NextResponse.json({
      view: { station, canHandOff: handsOff, pickupMode: mode },
      data: { waiting, ready, recent: recentResult.rows },
    });
  } catch (error) {
    console.error("GET /api/queue failed:", error);
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "42703") {
      return NextResponse.json({ error: "The queue query does not match the current sales table schema. Check the cashier queue setup." }, { status: 500 });
    }
    return NextResponse.json({ error: "Could not retrieve the queue." }, { status: 500 });
  }
}

// action "ready": a station finished its part (baristas the bar, kitchen staff the kitchen; the
// counter can mark either, or every part with no station). action "pickup": the counter handed
// the order over (or one part, when drinks and food are picked up separately). The old "serve"
// and "flush" still work.
export async function PATCH(request: Request) {
  // Live screens reload once this is saved (a failed request only causes an extra reload).
  signalChange("queue");
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const client = await pool.connect();
  try {
    const body = await request.json() as { order_id?: unknown; action?: unknown; station?: unknown };
    const orderId = Number(body.order_id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return NextResponse.json({ error: "A valid order_id is required." }, { status: 400 });
    }
    const action = body.action === "flush" || body.action === "pickup" ? "pickup" : "ready";
    const own = stationForRole(session.role);
    const asked = parseStation(body.station);
    if (own && asked && asked !== own) return NextResponse.json({ error: `You work at the ${own}, so you can only update the ${own} part.` }, { status: 403 });
    if (action === "pickup" && !canHandOff(session.role)) return NextResponse.json({ error: "The counter hands orders over. Mark your part ready instead." }, { status: 403 });

    await client.query("BEGIN");
    if (action === "ready") await markReady(client, orderId, own ?? asked, session.adminId);
    else await handOver(client, orderId, asked, await pickupMode(client));
    const order = await client.query("SELECT order_id, queue_number, queue_status FROM sales_orders WHERE order_id = $1", [orderId]);
    await client.query("COMMIT");
    return NextResponse.json({ data: order.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (error instanceof StationError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("PATCH /api/queue failed:", error);
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "42P01" || code === "42703") {
      return NextResponse.json({ error: "The kitchen stations are not set up in the database yet. Run kitchen-stations-migration.sql, then reload." }, { status: 500 });
    }
    return NextResponse.json({ error: "Could not update the order." }, { status: 500 });
  } finally {
    client.release();
  }
}
