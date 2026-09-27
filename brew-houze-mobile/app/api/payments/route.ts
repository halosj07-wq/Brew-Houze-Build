import { NextResponse } from "next/server";
import { parseOrderItems } from "@/lib/orders";
import { startCheckout } from "@/lib/payment-checkouts";
import { paymongoConfigured } from "@/lib/paymongo";
import { getCustomerSession } from "@/lib/customers";

// Starts a GCash payment for a mobile order and returns the GCash page to open. The order is
// only created once PayMongo confirms the payment (see /api/payments/[token]).
export async function POST(request: Request) {
  if (!paymongoConfigured()) return NextResponse.json({ error: "Online payment is not available right now." }, { status: 503 });
  try {
    const body = await request.json() as { items?: unknown };
    // Each add-on is once per cup on the mobile menu.
    const items = parseOrderItems(body.items).map((item) => ({ ...item, additionIds: Array.from(new Set(item.additionIds)) }));
    if (items.length === 0) return NextResponse.json({ error: "Add something to your order first." }, { status: 400 });
    if (items.length > 50) return NextResponse.json({ error: "That order is too large. Please order at the counter." }, { status: 400 });
    const origin = process.env.APP_URL?.replace(/\/$/, "") || new URL(request.url).origin;
    // Signed-in customers get the order saved to their account once the payment goes through.
    const customer = await getCustomerSession();
    const started = await startCheckout({ source: "mobile", items, cashierAdminId: null, customerId: customer?.customerId ?? null, returnUrl: (token) => `${origin}/?payment=${token}` });
    return NextResponse.json({ data: started }, { status: 201 });
  } catch (error) {
    console.error("POST /api/payments (mobile) failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not start the GCash payment." }, { status: 400 });
  }
}
