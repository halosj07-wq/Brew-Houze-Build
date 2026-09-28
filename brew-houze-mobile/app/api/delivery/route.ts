import { NextResponse } from "next/server";
import { deliverySettings, deliveryZones, withinDeliveryHours } from "@/lib/delivery";

// What the mobile menu needs to know about delivery: whether it is on and open right now, the
// hours, the zones with their fees, free delivery, and cash on delivery rules.
export async function GET() {
  try {
    const [settings, zones] = await Promise.all([deliverySettings(), deliveryZones()]);
    return NextResponse.json({
      data: {
        enabled: settings.enabled && zones.length > 0,
        openNow: settings.enabled && withinDeliveryHours(settings),
        hours: settings.start && settings.end ? { start: settings.start, end: settings.end } : null,
        freeAbove: settings.freeAbove,
        cod: settings.cod,
        zones: zones.map((zone) => ({ id: zone.id, name: zone.name, description: zone.description, fee: zone.fee, minOrder: zone.minOrder })),
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/delivery (mobile) failed:", error);
    return NextResponse.json({ error: "Could not load the delivery details." }, { status: 500 });
  }
}
