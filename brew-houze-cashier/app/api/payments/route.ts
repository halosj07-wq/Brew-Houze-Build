import { NextResponse } from "next/server";
import { parseOrderItems } from "@/lib/orders";
import { startCheckout } from "@/lib/payment-checkouts";
import { paymongoConfigured, paymongoTestMode, PAYMONGO_MIN_AMOUNT } from "@/lib/paymongo";
import { getSession, isQueueOnly, QUEUE_ONLY } from "@/lib/sessions";
import { CUSTOMER_UNAVAILABLE, linkableCustomerId } from "@/lib/customers";

// Whether GCash is available at the counter (PayMongo keys set on the server).
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (isQueueOnly(session)) return NextResponse.json(QUEUE_ONLY, { status: 403 });
  return NextResponse.json({ data: { gcash: paymongoConfigured(), testMode: paymongoTestMode(), minimumAmount: PAYMONGO_MIN_AMOUNT } }, { headers: { "Cache-Control": "no-store" } });
}

// Starts a GCash payment for the cart. The order is created only once PayMongo confirms it.
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (isQueueOnly(session)) return NextResponse.json(QUEUE_ONLY, { status: 403 });
  if (!paymongoConfigured()) return NextResponse.json({ error: "GCash is not set up on this server." }, { status: 503 });
  try {
    const body = await request.json() as { items?: unknown; split?: { cash_amount?: unknown; received_amount?: unknown } | null; customer_id?: unknown };
    const items = parseOrderItems(body.items);
    if (items.length === 0) return NextResponse.json({ error: "At least one valid cart item is required." }, { status: 400 });
    const customerId = await linkableCustomerId(body.customer_id);
    if (customerId === null) return NextResponse.json({ error: CUSTOMER_UNAVAILABLE }, { status: 400 });
    // After paying, the customer's phone lands on a public page of this app (no sign-in needed).
    const origin = process.env.APP_URL?.replace(/\/$/, "") || new URL(request.url).origin;
    // Split ticket: the cash part is collected at the counter, GCash charges the rest.
    const split = body.split ? { cashAmount: Number(body.split.cash_amount), receivedAmount: Number(body.split.received_amount) } : null;
    const started = await startCheckout({ source: "cashier", items, cashierAdminId: session.adminId, customerId: customerId ?? null, returnUrl: (token) => `${origin}/pay/done?ref=${token}`, split });
    return NextResponse.json({ data: started }, { status: 201 });
  } catch (error) {
    console.error("POST /api/payments failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not start the GCash payment." }, { status: 400 });
  }
}
