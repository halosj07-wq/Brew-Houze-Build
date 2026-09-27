import { NextResponse } from "next/server";
import { currentCounterCheckout } from "@/lib/payment-checkouts";
import { paymongoConfigured } from "@/lib/paymongo";

// Public (no sign-in): what the printed GCash sign at the counter should open right now. It only
// reveals the amount and the GCash page of the payment the cashier just started, which lets the
// person at the counter pay it and nothing else.
export async function GET() {
  if (!paymongoConfigured()) return NextResponse.json({ data: { state: "unavailable" } }, { headers: { "Cache-Control": "no-store" } });
  try {
    const checkout = await currentCounterCheckout();
    return NextResponse.json({
      data: checkout ? { state: "ready", token: checkout.token, amount: checkout.amount, redirectUrl: checkout.redirectUrl } : { state: "waiting" },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/payments/counter failed:", error);
    return NextResponse.json({ error: "Could not reach the counter. Trying again…" }, { status: 502 });
  }
}
