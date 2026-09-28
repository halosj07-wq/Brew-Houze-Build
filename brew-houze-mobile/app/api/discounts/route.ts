import { NextResponse } from "next/server";
import { discountTypes, vatSettings } from "@/lib/discounts";

// The ID discounts the café gives (senior, PWD and others switched on in Admin) and its VAT
// setting, so the phone can offer them and preview what the customer saves. The server works the
// real amounts out when the order is placed.
export async function GET() {
  try {
    const [types, vat] = await Promise.all([discountTypes(), vatSettings()]);
    return NextResponse.json({
      data: types.map((type) => ({ id: type.id, code: type.code, name: type.name, discountKind: type.discountKind, discountValue: type.discountValue, maxDiscount: type.maxDiscount, vatExempt: type.vatExempt, requiresId: type.requiresId, idLabel: type.idLabel })),
      vat,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/discounts (mobile) failed:", error);
    return NextResponse.json({ error: "Could not load the discounts." }, { status: 500 });
  }
}
