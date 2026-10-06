import { NextResponse } from "next/server";
import { confirmDirectPayment, directPaymentsToCheck, markDirectRefunded, rejectDirectPayment } from "@/lib/payment-checkouts";
import { gcashMethod } from "@/lib/gcash";
import { getSession, isQueueOnly, QUEUE_ONLY } from "@/lib/sessions";
import { signalChange } from "@/lib/realtime";

// GCash payments from the mobile menu, sent straight to the café's QR (direct GCash, see
// lib/gcash.ts and lib/payment-checkouts.ts), for the cashier to check against the café's GCash.
//   GET                                   the payments to check, and those to send back
//   PATCH { id, action: "confirm" }       found it: the order is made
//   PATCH { id, action: "reject", reason }  not found (or wrong amount): the customer sees why
//   PATCH { id, action: "refunded" }      confirmed but the order could not be made: the money was
//                                         sent back by GCash
// The screenshots come from ./[id]/proof.

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (isQueueOnly(session)) return NextResponse.json(QUEUE_ONLY, { status: 403 });
  if (gcashMethod() !== "direct_qr") return NextResponse.json({ data: [] }, { headers: { "Cache-Control": "no-store" } });
  try {
    return NextResponse.json({ data: await directPaymentsToCheck() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/gcash-payments failed:", error);
    return NextResponse.json({ error: "Could not load the GCash payments." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (isQueueOnly(session)) return NextResponse.json(QUEUE_ONLY, { status: 403 });
  let body: { id?: unknown; action?: unknown; reason?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A valid request is required." }, { status: 400 });
  }
  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Choose a payment." }, { status: 400 });
  // Live screens (and the customer's phone) update once this is saved.
  signalChange("line", "queue", "stock");
  try {
    if (body.action === "confirm") {
      const view = await confirmDirectPayment(id, session.adminId);
      if (!view) return NextResponse.json({ error: "That payment was not found." }, { status: 404 });
      if (view.status === "completed") return NextResponse.json({ data: { status: view.status, queueNumber: view.queueNumber } });
      if (view.status === "needs_attention") return NextResponse.json({ data: { status: view.status, message: `The payment is confirmed, but the order could not be made${view.message?.match(/\((.*)\)/)?.[1] ? ` (${view.message.match(/\((.*)\)/)![1]})` : ""}. Send the money back to the customer by GCash, then mark it sent back.` } });
      return NextResponse.json({ error: "Someone already decided this payment." }, { status: 409 });
    }
    if (body.action === "reject") {
      const reason = String(body.reason ?? "").trim().slice(0, 160);
      if (reason.length < 3) return NextResponse.json({ error: "Choose or type the reason. The customer sees it." }, { status: 400 });
      const view = await rejectDirectPayment(id, session.adminId, reason);
      if (!view) return NextResponse.json({ error: "That payment was not found." }, { status: 404 });
      return NextResponse.json({ data: { status: view.status } });
    }
    if (body.action === "refunded") {
      if (!await markDirectRefunded(id, session.adminId)) return NextResponse.json({ error: "That payment is not waiting to be sent back." }, { status: 409 });
      return NextResponse.json({ data: { status: "refunded" } });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    console.error("PATCH /api/gcash-payments failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save the decision." }, { status: 500 });
  }
}
