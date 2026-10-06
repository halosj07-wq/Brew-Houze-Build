import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { parseOrderItems, parseServiceType, placeOrder } from "@/lib/orders";
import { parseIdDiscounts } from "@/lib/discounts";
import { claimCounterCart, completeCounterCart, counterCartProblem, parseCounterCartId } from "@/lib/counter-carts";
import { getSession, isQueueOnly, QUEUE_ONLY } from "@/lib/sessions";
import { authorizeCounterRewards, CUSTOMER_UNAVAILABLE, linkableCustomerId, markClaimUsed } from "@/lib/customers";
import { planDelivery } from "@/lib/delivery";
import { directGcashReady, gcashMethod, gcashReferenceUsed, GCASH_REFERENCE_USED, normalizeGcashReference } from "@/lib/gcash";

// Cash and manual "online" payments at the counter. GCash through PayMongo goes through
// /api/payments instead, where the order is only created once the payment is confirmed.
// A delivery the counter takes (a Messenger order) is paid in cash now, or cash on delivery.
//
// Direct GCash (the café's own QR, GCASH_METHOD=direct_qr): payment_method "gcash" with the
// gcash_reference the cashier read off the customer's GCash receipt, after seeing the payment.
// The reference number pays for this order only. With split, the cash part is paid first and GCash
// pays the rest, as with PayMongo.
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (isQueueOnly(session)) return NextResponse.json(QUEUE_ONLY, { status: 403 });

  const client = await pool.connect();
  try {
    const body = await request.json() as { items?: unknown; received_amount?: unknown; payment_method?: unknown; gcash_reference?: unknown; split?: { cash_amount?: unknown; received_amount?: unknown } | null; customer_id?: unknown; claim_id?: unknown; reward_password?: unknown; discount_reward_id?: unknown; service_type?: unknown; id_discounts?: unknown; counter_cart_id?: unknown; delivery?: unknown };
    const directGcash = body.payment_method === "gcash";
    // Cash, or direct GCash on the café's QR. GCash through PayMongo goes through /api/payments.
    if (body.payment_method !== undefined && body.payment_method !== "cash" && body.payment_method !== "cod" && !directGcash) return NextResponse.json({ error: "Only cash orders are punched here. Use GCash for online payments." }, { status: 400 });
    if (directGcash && !(gcashMethod() === "direct_qr" && await directGcashReady())) return NextResponse.json({ error: "GCash to the café's QR is not set up. Ask an admin to add the QR in Treasury." }, { status: 503 });
    const reference = directGcash ? normalizeGcashReference(body.gcash_reference) : null;
    if (directGcash && !reference) return NextResponse.json({ error: "Enter the 13-digit reference number from the customer's GCash receipt." }, { status: 400 });
    const split = directGcash && body.split ? { cashAmount: Number(body.split.cash_amount), receivedAmount: Number(body.split.received_amount) } : null;
    const paymentMethod = directGcash ? (split ? "split" : "online") : body.payment_method === "cod" ? "cod" : "cash";
    const serviceType = parseServiceType(body.service_type);
    if (paymentMethod === "cod" && serviceType !== "delivery") return NextResponse.json({ error: "Cash on delivery is only for delivery orders." }, { status: 400 });
    if (serviceType === "delivery" && split) return NextResponse.json({ error: "A delivery is paid in full, by GCash or cash. Split payment isn't available." }, { status: 400 });
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

    const counterCartId = parseCounterCartId(body.counter_cart_id);
    const cartProblem = await counterCartProblem(pool, counterCartId);
    if (cartProblem) return NextResponse.json({ error: cartProblem, code: "COUNTER_CART_GONE" }, { status: 409 });

    await client.query("BEGIN");
    if (reference && await gcashReferenceUsed(client, reference)) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: GCASH_REFERENCE_USED }, { status: 409 });
    }
    // Paid now (cash or GCash): the delivery goes out already paid ("gcash" on the delivery means prepaid).
    const delivery = serviceType === "delivery" ? await planDelivery(client, customerId ?? null, { ...(body.delivery as object ?? {}), payment: paymentMethod === "cod" ? "cod" : "gcash" }, { staff: true }) : null;
    // A cart sent from the mobile menu: the order takes its token so the customer's phone follows it.
    const counterCartToken = await claimCounterCart(client, counterCartId);
    const placed = await placeOrder(client, {
      items,
      source: "cashier",
      cashierAdminId: session.adminId,
      paymentMethod,
      receivedAmount: split ? split.receivedAmount : Number(body.received_amount),
      cashAmount: split?.cashAmount,
      customerId: customerId ?? null,
      rewardsAuthorized: rewards.authorized,
      discountRewardId,
      // Senior, PWD and other ID discounts: the cashier checked the ID at the counter.
      idDiscounts: parseIdDiscounts(body.id_discounts),
      serviceType,
      delivery,
      customerToken: counterCartToken,
      paymentReference: reference,
      paymentProvider: directGcash ? "gcash_direct" : null,
    });
    // No fees on the café's own GCash.
    if (directGcash) await client.query("UPDATE sales_orders SET payment_fee = 0 WHERE order_id = $1", [placed.orderId]);
    await markClaimUsed(client, rewards.claimId, placed.orderId);
    if (counterCartId !== null && counterCartToken !== null) await completeCounterCart(client, counterCartId, placed.orderId);
    await client.query("COMMIT");
    return NextResponse.json({ data: { ...placed, paymentMethod: directGcash ? "gcash" : paymentMethod, gcashReference: reference } });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if ((error as { code?: string }).code === "23505") return NextResponse.json({ error: GCASH_REFERENCE_USED }, { status: 409 });
    console.error("POST /api/checkout failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to complete checkout." }, { status: 400 });
  } finally {
    client.release();
  }
}
