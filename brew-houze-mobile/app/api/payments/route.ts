import { NextResponse } from "next/server";
import { parseOrderItems, parseServiceType, isSoldOut } from "@/lib/orders";
import { startCheckout } from "@/lib/payment-checkouts";
import { paymongoConfigured } from "@/lib/paymongo";
import { getCustomerSession } from "@/lib/customers";
import { mobileIdDiscount } from "@/lib/mobile-id-discount";
import { planDelivery } from "@/lib/delivery";
import pool from "@/lib/db";

// Starts a GCash payment for a mobile order and returns the GCash page to open. The order is
// only created once PayMongo confirms the payment (see /api/payments/[token]).
export async function POST(request: Request) {
  if (!paymongoConfigured()) return NextResponse.json({ error: "Online payment is not available right now." }, { status: 503 });
  try {
    const body = await request.json() as { items?: unknown; discount_reward_id?: unknown; service_type?: unknown; verification_token?: unknown; saved_id?: unknown; delivery?: unknown };
    const signedIn = await getCustomerSession();
    // An ID discount the café approved (a photo, or the ID remembered on the account).
    const idDiscount = await mobileIdDiscount(body, signedIn?.customerId ?? null);
    // Each add-on is once per cup on the mobile menu.
    const items = idDiscount?.items ?? parseOrderItems(body.items).map((item) => ({ ...item, additionIds: Array.from(new Set(item.additionIds)) }));
    if (items.length === 0) return NextResponse.json({ error: "Add something to your order first." }, { status: 400 });
    if (items.length > 50) return NextResponse.json({ error: "That order is too large. Please order at the counter." }, { status: 400 });
    const origin = process.env.APP_URL?.replace(/\/$/, "") || new URL(request.url).origin;
    // Signed-in customers get the order saved to their account once the payment goes through.
    const customer = signedIn;
    const rawDiscount = Number(body.discount_reward_id);
    const discountRewardId = Number.isInteger(rawDiscount) && rawDiscount > 0 ? rawDiscount : null;
    if ((items.some((item) => item.rewardId) || discountRewardId !== null) && !customer) return NextResponse.json({ error: "Sign in to use your rewards." }, { status: 401 });
    // Delivery: the address and fee rules are checked now and kept with the payment.
    const serviceType = idDiscount?.serviceType ?? parseServiceType(body.service_type);
    const delivery = serviceType === "delivery" ? await planDelivery(pool, customer?.customerId ?? null, { ...(body.delivery as object ?? {}), payment: "gcash" }) : null;
    // Rewards are the customer's own stars (their signed-in account); they are spent once paid.
    const started = await startCheckout({ source: "mobile", items, cashierAdminId: null, customerId: idDiscount?.customerId ?? customer?.customerId ?? null, rewardsAuthorized: Boolean(customer), discountRewardId, idDiscounts: idDiscount?.idDiscounts ?? [], idVerificationId: idDiscount?.verificationId ?? null, serviceType, delivery, returnUrl: (token) => `${origin}/?payment=${token}` });
    return NextResponse.json({ data: started }, { status: 201 });
  } catch (error) {
    if (isSoldOut(error)) return NextResponse.json({ error: "Some items in your cart just sold out.", code: "sold_out" }, { status: 409 });
    console.error("POST /api/payments (mobile) failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not start the GCash payment." }, { status: 400 });
  }
}
