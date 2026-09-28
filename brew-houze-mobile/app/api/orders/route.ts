import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { parseOrderItems, parseServiceType, placeOrder } from "@/lib/orders";
import { paymongoConfigured } from "@/lib/paymongo";
import { getCustomerSession } from "@/lib/customers";
import { mobileIdDiscount } from "@/lib/mobile-id-discount";
import { markVerificationUsed } from "@/lib/id-verifications";
import { planDelivery } from "@/lib/delivery";

// Places a mobile order without an online payment: while GCash (PayMongo) is not set up on this
// server, when rewards make the whole order free (₱0, nothing to pay), or a delivery order paid
// with cash on delivery (delivery: { address_id, payment: "cod" }). With PayMongo keys
// present, paid orders go through /api/payments and are only created once the payment is
// confirmed, so an unpaid order cannot be sent from here.
export async function POST(request: Request) {
  const client = await pool.connect();
  try {
    const body = await request.json() as { items?: unknown; discount_reward_id?: unknown; service_type?: unknown; verification_token?: unknown; saved_id?: unknown; delivery?: unknown };
    const customerToken = randomUUID();
    // Signed-in customers get the order saved to their account, and can use their own stars.
    const customer = await getCustomerSession();
    // An ID discount the café approved (a photo, or the ID remembered on the account).
    const idDiscount = await mobileIdDiscount(body, customer?.customerId ?? null);
    // Each add-on is once per cup on the mobile menu.
    const items = idDiscount?.items ?? parseOrderItems(body.items).map((item) => ({ ...item, additionIds: Array.from(new Set(item.additionIds)) }));
    if (items.length === 0) return NextResponse.json({ error: "At least one valid order item is required." }, { status: 400 });
    const rawDiscount = Number(body.discount_reward_id);
    const discountRewardId = Number.isInteger(rawDiscount) && rawDiscount > 0 ? rawDiscount : null;
    if ((items.some((item) => item.rewardId) || discountRewardId !== null) && !customer) return NextResponse.json({ error: "Sign in to use your rewards." }, { status: 401 });
    const serviceType = idDiscount?.serviceType ?? parseServiceType(body.service_type);
    await client.query("BEGIN");
    // Delivery: the address, fee rules and (cash on delivery) whether this customer may use it.
    const delivery = serviceType === "delivery" ? await planDelivery(client, customer?.customerId ?? null, body.delivery) : null;
    const paymentMethod = delivery?.payment === "cod" ? "cod" : "online";
    const placed = await placeOrder(client, { items, source: "mobile", cashierAdminId: null, paymentMethod, customerToken, customerId: idDiscount?.customerId ?? customer?.customerId ?? null, rewardsAuthorized: Boolean(customer), discountRewardId, idDiscounts: idDiscount?.idDiscounts ?? [], serviceType, delivery });
    if (paymongoConfigured() && placed.total > 0 && paymentMethod !== "cod") {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Please pay with GCash to place your order." }, { status: 409 });
    }
    if (idDiscount?.verificationId) await markVerificationUsed(client, idDiscount.verificationId, placed.orderId);
    await client.query("COMMIT");
    return NextResponse.json({ data: { orderId: placed.orderId, queueNumber: placed.queueNumber, trackingToken: customerToken, total: placed.total, createdAt: placed.createdAt, starsRedeemed: placed.starsRedeemed, discountAmount: placed.discountAmount, deliveryFee: placed.deliveryFee } }, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("POST /api/orders failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to place order." }, { status: 400 });
  } finally {
    client.release();
  }
}
