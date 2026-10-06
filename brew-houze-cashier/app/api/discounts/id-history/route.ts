import { NextResponse } from "next/server";
import { idHistory } from "@/lib/id-history";
import { getSession, isQueueOnly, QUEUE_ONLY } from "@/lib/sessions";

// GET ?type=<discount type id>&code=<its code>&number=<ID number>: whether this ID was used for the
// discount before (see lib/id-history.ts), for the warning on the POS's ID discount form.
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (isQueueOnly(session)) return NextResponse.json(QUEUE_ONLY, { status: 403 });
  const params = new URL(request.url).searchParams;
  const typeId = Number.parseInt(params.get("type") ?? "", 10);
  const code = String(params.get("code") ?? "").slice(0, 40);
  const number = String(params.get("number") ?? "").slice(0, 40);
  if (!Number.isInteger(typeId) || !code) return NextResponse.json({ error: "Choose a discount." }, { status: 400 });
  try {
    return NextResponse.json({ data: await idHistory(typeId, code, number) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/discounts/id-history failed:", error);
    return NextResponse.json({ error: "Could not check the ID." }, { status: 500 });
  }
}
