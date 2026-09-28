import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { parseOrderItems, placeOrder } from "@/lib/orders";
import { paymongoConfigured } from "@/lib/paymongo";
import { getCustomerSession } from "@/lib/customers";

// Places a mobile order without an online payment: while GCash (PayMongo) is not set up on this
// server, or when rewards make the whole order free (₱0, nothing to pay). With PayMongo keys
// present, paid orders go through /api/payments and are only created once the payment is
// confirmed, so an unpaid order cannot be sent from here.
export async function POST(request: Request) {
  const client = await pool.connect();
  try {
    const body = await request.json() as { items?: unknown };
    // Each add-on is once per cup on the mobile menu.
    const items = parseOrderItems(body.items).map((item) => ({ ...item, additionIds: Array.from(new Set(item.additionIds)) }));
    if (items.length === 0) return NextResponse.json({ error: "At least one valid order item is required." }, { status: 400 });
    const customerToken = randomUUID();
    // Signed-in customers get the order saved to their account, and can use their own stars.
    const customer = await getCustomerSession();
    if (items.some((item) => item.rewardId) && !customer) return NextResponse.json({ error: "Sign in to use your rewards." }, { status: 401 });
    await client.query("BEGIN");
    const placed = await placeOrder(client, { items, source: "mobile", cashierAdminId: null, paymentMethod: "online", customerToken, customerId: customer?.customerId ?? null, rewardsAuthorized: Boolean(customer) });
    if (paymongoConfigured() && placed.total > 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Please pay with GCash to place your order." }, { status: 409 });
    }
    await client.query("COMMIT");
    return NextResponse.json({ data: { orderId: placed.orderId, queueNumber: placed.queueNumber, trackingToken: customerToken, total: placed.total, createdAt: placed.createdAt, starsRedeemed: placed.starsRedeemed } }, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("POST /api/orders failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to place order." }, { status: 400 });
  } finally {
    client.release();
  }
}
