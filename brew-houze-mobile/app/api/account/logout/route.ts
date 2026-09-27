import { NextResponse } from "next/server";
import { endCurrentCustomerSession } from "@/lib/customers";

export async function POST() {
  try {
    await endCurrentCustomerSession();
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    console.error("POST /api/account/logout failed:", error);
    return NextResponse.json({ error: "Could not sign you out. Please try again." }, { status: 500 });
  }
}
