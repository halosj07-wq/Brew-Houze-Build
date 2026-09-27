import { NextResponse } from "next/server";
import { checkCustomerResetToken, resetCustomerPassword } from "@/lib/customers";

// Checks a reset link before the "choose a new password" form is shown.
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  try {
    return NextResponse.json({ data: await checkCustomerResetToken(token) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/account/reset-password failed:", error);
    return NextResponse.json({ error: "Could not check the reset link." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: { token?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Choose a new password." }, { status: 400 });
  }
  try {
    const result = await resetCustomerPassword(String(body.token ?? ""), String(body.password ?? ""));
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    console.error("POST /api/account/reset-password failed:", error);
    return NextResponse.json({ error: "Could not reset the password. Please try again." }, { status: 500 });
  }
}
