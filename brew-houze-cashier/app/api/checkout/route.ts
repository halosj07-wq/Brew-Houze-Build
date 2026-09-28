import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { parseOrderItems, placeOrder } from "@/lib/orders";
import { getSession, isQueueOnly, QUEUE_ONLY } from "@/lib/sessions";
import { authorizeCounterRewards, CUSTOMER_UNAVAILABLE, linkableCustomerId, markClaimUsed } from "@/lib/customers";

// Cash and manual "online" payments at the counter. GCash through PayMongo goes through
// /api/payments instead, where the order is only created once the payment is confirmed.
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (isQueueOnly(session)) return NextResponse.json(QUEUE_ONLY, { status: 403 });

  const client = await pool.connect();
  try {
    const body = await request.json() as { items?: unknown; received_amount?: unknown; payment_method?: unknown; customer_id?: unknown; claim_id?: unknown; reward_password?: unknown; discount_reward_id?: unknown };
    // Cash only: GCash, the only online payment, goes through /api/payments (paid before the order).
    if (body.payment_method !== undefined && body.payment_method !== "cash") return NextResponse.json({ error: "Only cash orders are punched here. Use GCash for online payments." }, { status: 400 });
    const paymentMethod = "cash";
    const items = parseOrderItems(body.items);
    if (items.length === 0) return NextResponse.json({ error: "At least one valid cart item is required." }, { status: 400 });
    // The customer the cashier attached, if any, so the order shows in their purchases.
    const customerId = await linkableCustomerId(body.customer_id);
    if (customerId === null) return NextResponse.json({ error: CUSTOMER_UNAVAILABLE }, { status: 400 });
    // Rewards need the customer's claim from the Stars sign (or, without an app, the cashier's password).
    const rewards = await authorizeCounterRewards(items, customerId, session.adminId, body);
    if (!rewards.ok) return NextResponse.json({ error: rewards.error, code: rewards.code }, { status: rewards.status });
    const rawDiscount = Number(body.discount_reward_id);
    const discountRewardId = Number.isInteger(rawDiscount) && rawDiscount > 0 ? rawDiscount : null;

    await client.query("BEGIN");
    const placed = await placeOrder(client, {
      items,
      source: "cashier",
      cashierAdminId: session.adminId,
      paymentMethod,
      receivedAmount: Number(body.received_amount),
      customerId: customerId ?? null,
      rewardsAuthorized: rewards.authorized,
      discountRewardId,
    });
    await markClaimUsed(client, rewards.claimId, placed.orderId);
    await client.query("COMMIT");
    return NextResponse.json({ data: { ...placed, paymentMethod } });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("POST /api/checkout failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to complete checkout." }, { status: 400 });
  } finally {
    client.release();
  }
}
