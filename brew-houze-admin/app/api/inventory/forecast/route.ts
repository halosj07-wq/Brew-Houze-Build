import { NextResponse } from "next/server";
import { getSession } from "@/lib/sessions";
import { eventPlans, itemForecasts, manilaToday } from "@/lib/forecast";

// Restock dates and holiday/event plans, worked out from the café's own records (lib/forecast.ts): no AI
// service, so it is free and runs on every visit.
export async function GET() {
  if (!(await getSession())) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  try {
    const today = manilaToday();
    const forecasts = await itemForecasts(today);
    const plans = await eventPlans(today, forecasts);
    return NextResponse.json({
      data: {
        today,
        items: forecasts.map((item) => ({
          inventoryId: item.inventoryId, item: item.item, category: item.category, unit: item.unit, onHand: item.onHand, lowAt: item.lowAt,
          perDay: item.perDay, daysOfData: item.daysOfData, confidence: item.confidence, restockBy: item.restockBy, runsOut: item.runsOut, daysLeft: item.daysLeft,
          packName: item.packName, packSize: item.packSize,
        })),
        rush: plans.rush,
        rushBasis: plans.basis,
        events: plans.events,
      },
    });
  } catch (error) {
    console.error("GET /api/inventory/forecast failed:", error);
    return NextResponse.json({ error: "Could not work out the forecast." }, { status: 500 });
  }
}
