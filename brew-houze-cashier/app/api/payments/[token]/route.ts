import { NextResponse } from "next/server";
import { cancelCheckout, refreshCheckout } from "@/lib/payment-checkouts";
import { getSession, isQueueOnly, QUEUE_ONLY } from "@/lib/sessions";

// Where a counter GCash payment stands. Asking also creates the order once it is paid.
export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (isQueueOnly(session)) return NextResponse.json(QUEUE_ONLY, { status: 403 });
  const { token } = await context.params;
  try {
    const view = await refreshCheckout(token);
    if (!view) return NextResponse.json({ error: "Payment not found." }, { status: 404 });
    return NextResponse.json({ data: view }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/payments/[token] failed:", error);
    return NextResponse.json({ error: "Could not check the payment. Trying again…" }, { status: 502 });
  }
}

// { action: "cancel" }: the cashier stops waiting. If it was already paid, the order is created.
export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (isQueueOnly(session)) return NextResponse.json(QUEUE_ONLY, { status: 403 });
  const { token } = await context.params;
  const body = await request.json().catch(() => ({})) as { action?: unknown };
  if (body.action !== "cancel") return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  try {
    const view = await cancelCheckout(token);
    if (!view) return NextResponse.json({ error: "Payment not found." }, { status: 404 });
    return NextResponse.json({ data: view });
  } catch (error) {
    console.error("POST /api/payments/[token] failed:", error);
    return NextResponse.json({ error: "Could not cancel the payment." }, { status: 502 });
  }
}
