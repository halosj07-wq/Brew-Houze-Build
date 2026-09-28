import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSession } from "@/lib/sessions";

// The delivery queue (see delivery-orders-migration.sql), for riders, cashiers and admins.
//   GET    deliveries in progress, today's finished ones, and cash on delivery still with a rider
//   PATCH  { id, action }
//     pickup      ready -> out (the rider taking it). A cashier or admin marking it for a rider
//                 sends riderId: an active rider, or themselves when the café has no rider.
//     delivered   out -> delivered; cash on delivery records what the rider collected
//     failed      could not deliver, with a reason. Cash on delivery: the customer loses COD
//                 until an admin allows it again. The order is then voided in Void & Refund.
//     remit       the cashier received a rider's COD cash (counts in this shift's drawer)
// The barista marks an order packed from the queue (ready). Baristas do not use this page.

const RIDER_ACTIONS = ["pickup", "delivered", "failed"];

async function staff() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "Not authenticated." }, { status: 401 }) };
  const role = String(session.role).toLowerCase();
  if (role !== "rider" && role !== "cashier" && role !== "admin") return { error: NextResponse.json({ error: "Only riders, cashiers and admins handle deliveries." }, { status: 403 }) };
  return { session, role };
}

const iso = (column: string) => `TO_CHAR(${column} AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"')`;

export async function GET() {
  const auth = await staff();
  if (auth.error) return auth.error;
  try {
    const result = await pool.query(`
      SELECT d.delivery_id, d.order_id, so.queue_number, so.total_amount, so.delivery_fee, so.status AS order_status, so.discount_label,
        d.status, d.payment, d.recipient_name, d.phone, d.street, d.landmark, d.rider_notes, d.zone_name, d.check_id,
        d.cod_amount, d.cod_collected, d.failure_reason, d.rider_admin_id, rider.full_name AS rider_name, receiver.full_name AS remitted_to,
        ${iso("d.created_at")} AS created_at, ${iso("d.ready_at")} AS ready_at, ${iso("d.picked_up_at")} AS picked_up_at,
        ${iso("d.delivered_at")} AS delivered_at, ${iso("d.failed_at")} AS failed_at, ${iso("d.cod_remitted_at")} AS remitted_at,
        COALESCE((SELECT STRING_AGG(soi.quantity || 'x ' || p.product_name || COALESCE(' (' || NULLIF(pv.size_label, 'Regular') || ')', ''), ', ' ORDER BY soi.order_item_id)
          FROM sales_order_items soi JOIN products p ON p.product_id = soi.product_id LEFT JOIN product_variants pv ON pv.product_variant_id = soi.product_variant_id
          WHERE soi.order_id = d.order_id), '') AS items
      FROM deliveries d
      JOIN sales_orders so ON so.order_id = d.order_id
      LEFT JOIN admin_users rider ON rider.admin_id = d.rider_admin_id
      LEFT JOIN admin_users receiver ON receiver.admin_id = d.cod_remitted_to
      WHERE d.status IN ('preparing', 'ready', 'out')
        OR (d.payment = 'cod' AND d.cod_collected IS NOT NULL AND d.cod_remitted_at IS NULL)
        OR (d.status = 'failed' AND so.status = 'completed')
        OR so.shift_id = (SELECT shift_id FROM shifts WHERE closed_at IS NULL LIMIT 1)
      ORDER BY d.created_at DESC
      LIMIT 200
    `);
    // Rider accounts for "Picked up by", on duty first.
    const riders = auth.role === "rider" ? { rows: [] as Record<string, unknown>[] } : await pool.query(`
      SELECT u.admin_id, u.full_name,
        EXISTS (SELECT 1 FROM employee_time_logs t WHERE t.admin_id = u.admin_id AND t.time_out IS NULL AND t.is_archived = FALSE) AS on_duty
      FROM admin_users u
      WHERE LOWER(u.role) = 'rider' AND u.is_active = TRUE
      ORDER BY on_duty DESC, u.full_name
    `);
    return NextResponse.json({
      role: auth.role,
      adminId: auth.session.adminId,
      riders: riders.rows.map((row) => ({ id: Number(row.admin_id), name: String(row.full_name), onDuty: Boolean(row.on_duty) })),
      data: result.rows.map((row) => ({
        id: Number(row.delivery_id), orderId: Number(row.order_id), queueNumber: row.queue_number === null ? null : Number(row.queue_number),
        total: Number(row.total_amount), fee: Number(row.delivery_fee), orderStatus: String(row.order_status), discountLabel: (row.discount_label as string | null) ?? null,
        status: String(row.status), payment: String(row.payment), recipientName: String(row.recipient_name), phone: String(row.phone), street: String(row.street),
        landmark: (row.landmark as string | null) ?? null, riderNotes: (row.rider_notes as string | null) ?? null, zoneName: String(row.zone_name), checkId: Boolean(row.check_id),
        codAmount: row.cod_amount === null ? null : Number(row.cod_amount), codCollected: row.cod_collected === null ? null : Number(row.cod_collected),
        failureReason: (row.failure_reason as string | null) ?? null, riderId: row.rider_admin_id === null ? null : Number(row.rider_admin_id), riderName: (row.rider_name as string | null) ?? null,
        remittedTo: (row.remitted_to as string | null) ?? null, items: String(row.items),
        createdAt: String(row.created_at), readyAt: (row.ready_at as string | null) ?? null, pickedUpAt: (row.picked_up_at as string | null) ?? null,
        deliveredAt: (row.delivered_at as string | null) ?? null, failedAt: (row.failed_at as string | null) ?? null, remittedAt: (row.remitted_at as string | null) ?? null,
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/deliveries failed:", error);
    return NextResponse.json({ error: "Could not load the deliveries." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await staff();
  if (auth.error) return auth.error;
  const client = await pool.connect();
  try {
    const body = await request.json() as { id?: unknown; action?: unknown; collected?: unknown; reason?: unknown; riderId?: unknown };
    const id = Number(body.id);
    const action = String(body.action ?? "");
    if (!Number.isInteger(id) || id <= 0 || ![...RIDER_ACTIONS, "remit"].includes(action)) return NextResponse.json({ error: "Unknown request." }, { status: 400 });
    if (action === "remit" && auth.role === "rider") return NextResponse.json({ error: "The cashier records the cash you hand in." }, { status: 403 });
    await client.query("BEGIN");
    const current = await client.query(`
      SELECT d.status, d.payment, d.cod_amount, d.cod_collected, d.cod_remitted_at, d.rider_admin_id, d.customer_id, so.status AS order_status, so.queue_number
      FROM deliveries d JOIN sales_orders so ON so.order_id = d.order_id WHERE d.delivery_id = $1 FOR UPDATE OF d
    `, [id]);
    const row = current.rows[0];
    const fail = async (message: string, status = 409) => { await client.query("ROLLBACK"); return NextResponse.json({ error: message }, { status }); };
    if (!row) return await fail("That delivery is no longer on the list.", 404);
    if (row.order_status !== "completed" && action !== "remit") return await fail("This order was voided or refunded.");
    // A rider only works on deliveries they picked up (or ones nobody has yet).
    if (auth.role === "rider" && action !== "pickup" && row.rider_admin_id !== null && Number(row.rider_admin_id) !== auth.session.adminId) return await fail("Another rider has this delivery.", 403);

    if (action === "pickup") {
      if (row.status !== "ready") return await fail(row.status === "preparing" ? "The barista has not packed this order yet." : "This delivery was already picked up.");
      // A rider takes it themselves. A cashier or admin names the rider (or themselves).
      let riderId = auth.session.adminId;
      if (auth.role !== "rider" && body.riderId !== undefined && body.riderId !== null && Number(body.riderId) !== auth.session.adminId) {
        riderId = Number(body.riderId);
        const rider = await client.query("SELECT 1 FROM admin_users WHERE admin_id = $1 AND LOWER(role) = 'rider' AND is_active = TRUE", [riderId]);
        if (!Number.isInteger(riderId) || rider.rowCount === 0) return await fail("Choose a rider who can take deliveries.", 400);
      }
      await client.query("UPDATE deliveries SET status = 'out', rider_admin_id = $2, picked_up_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE delivery_id = $1", [id, riderId]);
    } else if (action === "delivered") {
      if (row.status !== "out") return await fail("Only a delivery on its way can be marked delivered.");
      let collected: number | null = null;
      if (row.payment === "cod") {
        collected = Math.round(Number(body.collected) * 100) / 100;
        if (!Number.isFinite(collected) || collected + 0.005 < Number(row.cod_amount)) return await fail(`Collect ₱${Number(row.cod_amount).toFixed(2)} for this order.`, 400);
        collected = Number(row.cod_amount);
        await client.query("UPDATE sales_orders SET received_amount = $2, change_amount = 0 WHERE order_id = (SELECT order_id FROM deliveries WHERE delivery_id = $1)", [id, collected]);
      }
      await client.query("UPDATE deliveries SET status = 'delivered', delivered_at = CURRENT_TIMESTAMP, cod_collected = $2, updated_at = CURRENT_TIMESTAMP WHERE delivery_id = $1", [id, collected]);
    } else if (action === "failed") {
      if (!["ready", "out"].includes(String(row.status))) return await fail("Only a packed or outgoing delivery can be marked failed.");
      const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 200) : "";
      if (!reason) return await fail("Say why it could not be delivered.", 400);
      await client.query("UPDATE deliveries SET status = 'failed', failed_at = CURRENT_TIMESTAMP, failure_reason = $2, updated_at = CURRENT_TIMESTAMP WHERE delivery_id = $1", [id, reason]);
      if (row.payment === "cod" && row.customer_id !== null) {
        await client.query("UPDATE customers SET cod_blocked = TRUE, cod_block_reason = $2, updated_at = CURRENT_TIMESTAMP WHERE customer_id = $1", [row.customer_id, `Cash on delivery order #${row.queue_number ?? ""} was not delivered: ${reason}`]);
      }
    } else {
      if (row.payment !== "cod" || row.cod_collected === null) return await fail("There is no cash to receive for this delivery.");
      if (row.cod_remitted_at !== null) return await fail("This cash was already received.");
      const shift = await client.query("SELECT shift_id FROM shifts WHERE closed_at IS NULL FOR SHARE");
      if (shift.rowCount === 0) return await fail("Open a shift first: the cash goes into its drawer.");
      await client.query("UPDATE deliveries SET cod_remitted_at = CURRENT_TIMESTAMP, cod_remitted_to = $2, cod_remitted_shift_id = $3, updated_at = CURRENT_TIMESTAMP WHERE delivery_id = $1", [id, auth.session.adminId, Number(shift.rows[0].shift_id)]);
    }
    await client.query("COMMIT");
    return NextResponse.json({ data: { id, action } });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("PATCH /api/deliveries failed:", error);
    return NextResponse.json({ error: "Could not update the delivery." }, { status: 500 });
  } finally {
    client.release();
  }
}
