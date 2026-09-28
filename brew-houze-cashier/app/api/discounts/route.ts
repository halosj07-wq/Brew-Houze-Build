import { NextResponse } from "next/server";
import { discountTypes, vatSettings } from "@/lib/discounts";
import { getSession, isQueueOnly, QUEUE_ONLY } from "@/lib/sessions";

// The ID discounts switched on in Admin → Discounts (senior, PWD and others) and the shop's VAT
// setting, so the POS can preview what each person saves. The order route has the final say.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (isQueueOnly(session)) return NextResponse.json(QUEUE_ONLY, { status: 403 });
  try {
    const [types, vat] = await Promise.all([discountTypes(), vatSettings()]);
    return NextResponse.json({ data: { types, vat } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/discounts failed:", error);
    return NextResponse.json({ error: "Could not load the discounts." }, { status: 500 });
  }
}
