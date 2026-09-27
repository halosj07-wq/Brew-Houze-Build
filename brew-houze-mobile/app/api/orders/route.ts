import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { parseOrderItems, placeOrder } from "@/lib/orders";
import { paymongoConfigured } from "@/lib/paymongo";

// Places a mobile order without an online payment. Only used while GCash (PayMongo) is not set
// up on this server: with PayMongo keys present, mobile orders go through /api/payments and are
// only created once the payment is confirmed, so an unpaid order cannot be sent from here.
export async function POST(request: Request) {
  if (paymongoConfigured()) {
    return NextResponse.json({ error: "Please pay with GCash to place your order." }, { status: 409 });
  }
  const client = await pool.connect();
  try {
    const body = await request.json() as { items?: unknown };
    // Each add-on is once per cup on the mobile menu.
    const items = parseOrderItems(body.items).map((item) => ({ ...item, additionIds: Array.from(new Set(item.additionIds)) }));
    if (items.length === 0) return NextResponse.json({ error: "At least one valid order item is required." }, { status: 400 });
    const customerToken = randomUUID();
    await client.query("BEGIN");
    const placed = await placeOrder(client, { items, source: "mobile", cashierAdminId: null, paymentMethod: "online", customerToken });
    await client.query("COMMIT");
    return NextResponse.json({ data: { orderId: placed.orderId, queueNumber: placed.queueNumber, trackingToken: customerToken, total: placed.total, createdAt: placed.createdAt } }, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("POST /api/orders failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to place order." }, { status: 400 });
  } finally {
    client.release();
  }
}
