import { NextResponse } from "next/server";
import { getSession } from "@/lib/sessions";
import { deliveryMap } from "@/lib/delivery-map";

// The delivery map (lib/delivery-map.ts) for the Deliveries page: a rider sees their own deliveries on the way
// and the packed ones nobody took yet; cashiers and admins see every one.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const role = String(session.role).toLowerCase();
  if (!["rider", "cashier", "admin"].includes(role)) return NextResponse.json({ error: "Only riders, cashiers and admins see deliveries." }, { status: 403 });
  try {
    return NextResponse.json({ data: await deliveryMap(role === "rider" ? session.adminId : null) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/deliveries/map failed:", error);
    return NextResponse.json({ error: "Could not load the map." }, { status: 500 });
  }
}
