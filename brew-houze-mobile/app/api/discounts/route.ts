import { NextResponse } from "next/server";
import { discountTypes } from "@/lib/discounts";

// The ID discounts the café gives (senior, PWD and others switched on in Admin), so a customer can
// say which one they will claim when they send their cart to the counter.
export async function GET() {
  try {
    const types = await discountTypes();
    return NextResponse.json({ data: types.map((type) => ({ id: type.id, code: type.code, name: type.name, requiresId: type.requiresId })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/discounts (mobile) failed:", error);
    return NextResponse.json({ error: "Could not load the discounts." }, { status: 500 });
  }
}
