import { NextResponse } from "next/server";
import { cancelDirectPayment, refreshCheckout, submitDirectPayment } from "@/lib/payment-checkouts";
import { normalizeGcashReference } from "@/lib/gcash";
import { signalChange } from "@/lib/realtime";

// Where the customer's GCash payment stands. The token is the random reference returned when the
// payment started (it becomes the order's tracking token), so only this customer knows it.
// Asking also creates the order as soon as PayMongo reports it paid.
export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  try {
    const view = await refreshCheckout(token);
    if (!view || view.source !== "mobile") return NextResponse.json({ error: "Payment not found." }, { status: 404 });
    return NextResponse.json({ data: { status: view.status, provider: view.provider, payBy: view.payBy, amount: view.amount, queueNumber: view.queueNumber, message: view.message, soldOut: view.soldOut, trackingToken: view.token } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/payments/[token] (mobile) failed:", error);
    return NextResponse.json({ error: "Could not check the payment. Trying again…" }, { status: 502 });
  }
}

// Direct GCash (the café's own QR):
//   { action: "submit", reference, proof }   sends the 13-digit reference number and a screenshot
//                                             of the GCash receipt (a data URL) for the cashier
//   { action: "cancel" }                      the customer did not pay after all
const MAX_PROOF_BYTES = 3 * 1024 * 1024;

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  let body: { action?: unknown; reference?: unknown; proof?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A valid request is required." }, { status: 400 });
  }
  try {
    if (body.action === "cancel") {
      const view = await cancelDirectPayment(token);
      if (!view) return NextResponse.json({ error: "Payment not found." }, { status: 404 });
      return NextResponse.json({ data: { status: view.status } });
    }
    if (body.action !== "submit") return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    const reference = normalizeGcashReference(body.reference);
    if (!reference) return NextResponse.json({ error: "Enter the 13-digit reference number from your GCash receipt." }, { status: 400 });
    const proof = typeof body.proof === "string" ? /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(body.proof) : null;
    if (!proof) return NextResponse.json({ error: "Add a screenshot of your GCash receipt." }, { status: 400 });
    const bytes = Buffer.from(proof[2], "base64");
    if (bytes.length < 2000 || bytes.length > MAX_PROOF_BYTES) return NextResponse.json({ error: "That screenshot could not be used. Please choose it again." }, { status: 400 });
    const view = await submitDirectPayment(token, { reference, proof: { mime: proof[1], bytes } });
    // The Staff Portal shows it to the cashier right away.
    signalChange("line");
    return NextResponse.json({ data: { status: view.status } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not send the payment." }, { status: 400 });
  }
}
