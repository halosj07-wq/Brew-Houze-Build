import { NextResponse } from "next/server";
import { parseOrderItems, parseServiceType } from "@/lib/orders";
import { startCheckout } from "@/lib/payment-checkouts";
import { parseIdDiscounts } from "@/lib/discounts";
import { counterCartProblem, parseCounterCartId } from "@/lib/counter-carts";
import { paymongoConfigured, paymongoTestMode, PAYMONGO_MIN_AMOUNT } from "@/lib/paymongo";
import { gcashAccount, gcashMethod } from "@/lib/gcash";
import { getSession, isQueueOnly, QUEUE_ONLY } from "@/lib/sessions";
import { authorizeCounterRewards, CUSTOMER_UNAVAILABLE, linkableCustomerId } from "@/lib/customers";
import { planDelivery } from "@/lib/delivery";
import pool from "@/lib/db";

// Whether GCash is available at the counter, and how: through PayMongo (its keys set on the
// server), or straight to the café's GCash QR (GCASH_METHOD=direct_qr, see lib/gcash.ts), where the
// cashier confirms each payment and the order goes through /api/checkout.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (isQueueOnly(session)) return NextResponse.json(QUEUE_ONLY, { status: 403 });
  if (gcashMethod() === "direct_qr") {
    const account = await gcashAccount();
    return NextResponse.json({ data: { gcash: account.hasQr, direct: true, accountName: account.name, accountNumber: account.number, qrVersion: account.version, testMode: false, minimumAmount: 0 } }, { headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ data: { gcash: paymongoConfigured(), direct: false, testMode: paymongoTestMode(), minimumAmount: PAYMONGO_MIN_AMOUNT } }, { headers: { "Cache-Control": "no-store" } });
}

// Starts a GCash payment for the cart. The order is created only once PayMongo confirms it.
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (isQueueOnly(session)) return NextResponse.json(QUEUE_ONLY, { status: 403 });
  if (gcashMethod() === "direct_qr") return NextResponse.json({ error: "GCash is paid to the café's QR here: confirm the payment and its reference number instead." }, { status: 409 });
  if (!paymongoConfigured()) return NextResponse.json({ error: "GCash is not set up on this server." }, { status: 503 });
  try {
    const body = await request.json() as { items?: unknown; split?: { cash_amount?: unknown; received_amount?: unknown } | null; customer_id?: unknown; claim_id?: unknown; reward_password?: unknown; discount_reward_id?: unknown; service_type?: unknown; id_discounts?: unknown; counter_cart_id?: unknown; delivery?: unknown };
    const items = parseOrderItems(body.items);
    if (items.length === 0) return NextResponse.json({ error: "At least one valid cart item is required." }, { status: 400 });
    const customerId = await linkableCustomerId(body.customer_id);
    if (customerId === null) return NextResponse.json({ error: CUSTOMER_UNAVAILABLE }, { status: 400 });
    const rewards = await authorizeCounterRewards(items, customerId, session.adminId, body);
    if (!rewards.ok) return NextResponse.json({ error: rewards.error, code: rewards.code }, { status: rewards.status });
    const cartProblem = await counterCartProblem(pool, parseCounterCartId(body.counter_cart_id));
    if (cartProblem) return NextResponse.json({ error: cartProblem, code: "COUNTER_CART_GONE" }, { status: 409 });
    const rawDiscount = Number(body.discount_reward_id);
    const discountRewardId = Number.isInteger(rawDiscount) && rawDiscount > 0 ? rawDiscount : null;
    // After paying, the customer's phone lands on a public page of this app (no sign-in needed).
    const origin = process.env.APP_URL?.replace(/\/$/, "") || new URL(request.url).origin;
    // Split ticket: the cash part is collected at the counter, GCash charges the rest.
    const split = body.split ? { cashAmount: Number(body.split.cash_amount), receivedAmount: Number(body.split.received_amount) } : null;
    // A delivery the counter takes (a Messenger order), paid before it goes out.
    const serviceType = parseServiceType(body.service_type);
    if (serviceType === "delivery" && split) return NextResponse.json({ error: "A delivery is paid in full, by GCash or cash. Split payment isn't available." }, { status: 400 });
    const delivery = serviceType === "delivery" ? await planDelivery(pool, customerId ?? null, { ...(body.delivery as object ?? {}), payment: "gcash" }, { staff: true }) : null;
    // The claim stays open (it expires on its own), so a cancelled GCash payment can be retried.
    // The stars are only spent when the payment goes through and the order is placed.
    const started = await startCheckout({ source: "cashier", items, cashierAdminId: session.adminId, customerId: customerId ?? null, rewardsAuthorized: rewards.authorized, discountRewardId, idDiscounts: parseIdDiscounts(body.id_discounts), counterCartId: parseCounterCartId(body.counter_cart_id), serviceType, delivery, returnUrl: (token) => `${origin}/pay/done?ref=${token}`, split });
    return NextResponse.json({ data: started }, { status: 201 });
  } catch (error) {
    console.error("POST /api/payments failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not start the GCash payment." }, { status: 400 });
  }
}
