import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { isSoldOut, parseOrderItems, parsePickupChoice, parseServiceType, placeOrder } from "@/lib/orders";
import { getSession, isQueueOnly, QUEUE_ONLY } from "@/lib/sessions";
import { signalChange } from "@/lib/realtime";

// Counter orders the Staff Portal took while the café was offline (see offline-orders-migration.sql
// and lib/offline.ts): sent one at a time once the internet is back, and saved as ordinary cash
// sales at the time they were taken, in the shift they were taken in, already handed over. Each
// carries the id the tablet gave it, so one sent twice (the connection dropped mid-send) is saved
// once. Stock it no longer covers goes down to zero and comes back in stockShort for a recount.
// The sale keeps the price charged (total): a menu price that went up since comes off as an
// "Offline price" discount, and menuTotal says what the menu asks now.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_AGE_DAYS = 14;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (isQueueOnly(session)) return NextResponse.json(QUEUE_ONLY, { status: 403 });

  let body: { id?: unknown; created_at?: unknown; shift_id?: unknown; ticket?: unknown; cashier_id?: unknown; items?: unknown; service_type?: unknown; pickup_mode?: unknown; received_amount?: unknown; total?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A valid request is required." }, { status: 400 });
  }
  const id = String(body.id ?? "");
  const createdAt = new Date(String(body.created_at ?? ""));
  const ticket = String(body.ticket ?? "").slice(0, 20);
  const items = parseOrderItems(body.items).map((item) => ({ ...item, rewardId: null }));
  const serviceType = parseServiceType(body.service_type);
  const received = Number(body.received_amount);
  const offlineTotal = Number(body.total);
  if (!UUID_RE.test(id) || !ticket) return NextResponse.json({ error: "This offline order is missing its id or ticket." }, { status: 400 });
  if (Number.isNaN(createdAt.getTime()) || createdAt.getTime() > Date.now() + 5 * 60_000 || createdAt.getTime() < Date.now() - MAX_AGE_DAYS * 86_400_000) {
    return NextResponse.json({ error: `The time this order was taken is not valid (more than ${MAX_AGE_DAYS} days ago, or in the future).` }, { status: 400 });
  }
  if (items.length === 0) return NextResponse.json({ error: "This offline order has no items." }, { status: 400 });
  if (serviceType === "delivery") return NextResponse.json({ error: "Deliveries are not taken offline." }, { status: 400 });
  if (!Number.isFinite(received) || received < 0) return NextResponse.json({ error: "This offline order has no cash amount." }, { status: 400 });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Already saved (sent before, and the answer was lost): the same answer again.
    const existing = await client.query("SELECT order_id, queue_number, total_amount FROM sales_orders WHERE offline_id = $1::uuid", [id]);
    if (existing.rowCount) {
      await client.query("COMMIT");
      const row = existing.rows[0];
      return NextResponse.json({ data: { orderId: Number(row.order_id), queueNumber: Number(row.queue_number), total: Number(row.total_amount), menuTotal: Number(row.total_amount), stockShort: [], duplicate: true } });
    }
    // The cashier who took it, when still an active account (else whoever is sending it now).
    const cashierId = Number(body.cashier_id);
    const cashier = Number.isInteger(cashierId) && cashierId > 0
      ? await client.query("SELECT admin_id FROM admin_users WHERE admin_id = $1 AND is_active = TRUE", [cashierId])
      : { rowCount: 0 };
    const shiftId = Number(body.shift_id);
    const placed = await placeOrder(client, {
      items,
      source: "cashier",
      cashierAdminId: cashier.rowCount ? cashierId : session.adminId,
      paymentMethod: "cash",
      receivedAmount: received,
      serviceType: serviceType ?? "dine_in",
      pickupChoice: parsePickupChoice(body.pickup_mode),
      offline: { id, createdAt: createdAt.toISOString(), shiftId: Number.isInteger(shiftId) && shiftId > 0 ? shiftId : null, ticket, chargedTotal: Number.isFinite(offlineTotal) ? offlineTotal : null },
    });
    await client.query("COMMIT");
    signalChange("queue");
    return NextResponse.json({ data: { orderId: placed.orderId, queueNumber: placed.queueNumber, total: placed.total, menuTotal: Math.round((placed.total + placed.offlineGap) * 100) / 100, stockShort: placed.stockShort, duplicate: false } }, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    // Sent twice at the same moment: the other one saved it.
    if ((error as { code?: string }).code === "23505") return NextResponse.json({ error: "This offline order was just saved. Sync again to see it." }, { status: 409 });
    if ((error as { code?: string }).code === "42703") return NextResponse.json({ error: "Offline orders are not set up in the database yet. Run offline-orders-migration.sql, then sync again." }, { status: 503 });
    const message = isSoldOut(error) ? "A product in this order no longer exists on the menu." : error instanceof Error ? error.message : "Could not save this offline order.";
    console.error("POST /api/offline-orders failed:", error);
    return NextResponse.json({ error: message }, { status: 422 });
  } finally {
    client.release();
  }
}
