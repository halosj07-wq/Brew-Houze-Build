import { NextResponse } from "next/server";
import { deliverySettings, deliveryZones } from "@/lib/delivery";
import { getSession, isQueueOnly, QUEUE_ONLY } from "@/lib/sessions";

// The café's delivery zones and free delivery amount, for a delivery the counter takes (a
// Messenger order) at the register.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (isQueueOnly(session)) return NextResponse.json(QUEUE_ONLY, { status: 403 });
  try {
    const [settings, zones] = await Promise.all([deliverySettings(), deliveryZones()]);
    return NextResponse.json({ data: { freeAbove: settings.freeAbove, zones: zones.map(({ id, name, fee, minOrder }) => ({ id, name, fee, minOrder })) } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/delivery-zones failed:", error);
    return NextResponse.json({ error: "Could not load the delivery areas." }, { status: 500 });
  }
}
