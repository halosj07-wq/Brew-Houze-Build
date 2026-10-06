import { directPaymentProof } from "@/lib/payment-checkouts";
import { getSession, isQueueOnly } from "@/lib/sessions";

// The screenshot of the GCash receipt a mobile customer sent, for the cashier checking it.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || isQueueOnly(session)) return new Response("Not allowed", { status: 403 });
  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) return new Response("Not found", { status: 404 });
  try {
    const proof = await directPaymentProof(id);
    if (!proof) return new Response("Not found", { status: 404 });
    return new Response(new Uint8Array(proof.bytes), { headers: { "Content-Type": proof.mime, "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("GET /api/gcash-payments/[id]/proof failed:", error);
    return new Response("Could not load the screenshot", { status: 500 });
  }
}
