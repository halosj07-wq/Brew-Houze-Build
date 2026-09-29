import { NextResponse } from "next/server";
import { refreshCheckout } from "@/lib/payment-checkouts";

// Where the customer's GCash payment stands. The token is the random reference returned when the
// payment started (it becomes the order's tracking token), so only this customer knows it.
// Asking also creates the order as soon as PayMongo reports it paid.
export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  try {
    const view = await refreshCheckout(token);
    if (!view || view.source !== "mobile") return NextResponse.json({ error: "Payment not found." }, { status: 404 });
    return NextResponse.json({ data: { status: view.status, amount: view.amount, queueNumber: view.queueNumber, message: view.message, soldOut: view.soldOut, trackingToken: view.token } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/payments/[token] (mobile) failed:", error);
    return NextResponse.json({ error: "Could not check the payment. Trying again…" }, { status: 502 });
  }
}
