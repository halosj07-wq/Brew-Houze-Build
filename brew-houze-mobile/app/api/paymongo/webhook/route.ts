import { NextResponse } from "next/server";
import { handlePaymentEvent } from "@/lib/payment-checkouts";
import { feeInPesos, verifyWebhookSignature } from "@/lib/paymongo";

// PayMongo webhook (payment.paid, payment.failed), a backup to the status checks the apps make
// while waiting. Register it in the PayMongo dashboard with this deployment's address, then put
// its signing secret in PAYMONGO_WEBHOOK_SECRET. Unsigned or wrongly signed calls are refused.
// brew-houze-cashier and brew-houze-mobile carry the same handler; register only one of them.
export async function POST(request: Request) {
  const secret = process.env.PAYMONGO_WEBHOOK_SECRET ?? "";
  const rawBody = await request.text();
  if (!verifyWebhookSignature(rawBody, request.headers.get("paymongo-signature"), secret)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }
  try {
    const event = JSON.parse(rawBody) as { data?: { attributes?: { type?: string; data?: { id?: string; attributes?: { payment_intent_id?: string; fee?: number; last_payment_error?: { failed_message?: string } | null } } } } };
    const type = event.data?.attributes?.type;
    const payment = event.data?.attributes?.data;
    const intentId = payment?.attributes?.payment_intent_id;
    if ((type === "payment.paid" || type === "payment.failed") && intentId) {
      await handlePaymentEvent(intentId, type === "payment.paid", payment?.id ?? null, payment?.attributes?.last_payment_error?.failed_message ?? null, feeInPesos(payment?.attributes?.fee));
    }
    // Always acknowledge, so PayMongo does not retry events this app does not handle.
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("PayMongo webhook failed:", error);
    // A 500 makes PayMongo retry later, which is what we want if the database hiccuped.
    return NextResponse.json({ error: "Could not process the event." }, { status: 500 });
  }
}
