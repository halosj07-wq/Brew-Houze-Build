import { NextResponse } from "next/server";
import { parseOrderItems } from "@/lib/orders";
import { startCheckout } from "@/lib/payment-checkouts";
import { paymongoConfigured, paymongoTestMode, PAYMONGO_MIN_AMOUNT } from "@/lib/paymongo";
import { getSession } from "@/lib/sessions";

// Whether GCash is available at the counter (PayMongo keys set on the server).
export async function GET() {
  if (!(await getSession())) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  return NextResponse.json({ data: { gcash: paymongoConfigured(), testMode: paymongoTestMode(), minimumAmount: PAYMONGO_MIN_AMOUNT } }, { headers: { "Cache-Control": "no-store" } });
}

// Starts a GCash payment for the cart. The order is created only once PayMongo confirms it.
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (!paymongoConfigured()) return NextResponse.json({ error: "GCash is not set up on this server." }, { status: 503 });
  try {
    const body = await request.json() as { items?: unknown };
    const items = parseOrderItems(body.items);
    if (items.length === 0) return NextResponse.json({ error: "At least one valid cart item is required." }, { status: 400 });
    // After paying, the customer's phone lands on a public page of this app (no sign-in needed).
    const origin = process.env.APP_URL?.replace(/\/$/, "") || new URL(request.url).origin;
    const started = await startCheckout({ source: "cashier", items, cashierAdminId: session.adminId, returnUrl: (token) => `${origin}/pay/done?ref=${token}` });
    return NextResponse.json({ data: started }, { status: 201 });
  } catch (error) {
    console.error("POST /api/payments failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not start the GCash payment." }, { status: 400 });
  }
}
