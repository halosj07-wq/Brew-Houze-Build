import { NextResponse } from "next/server";
import { signInCustomer, startCustomerSession } from "@/lib/customers";

// Signs a customer in with their username (or email) and password.
export async function POST(request: Request) {
  let body: { login?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Enter your username and password." }, { status: 400 });
  }
  try {
    const result = await signInCustomer(String(body.login ?? ""), String(body.password ?? ""));
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    await startCustomerSession(result.customerId, request.headers.get("user-agent"));
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    console.error("POST /api/account/login failed:", error);
    return NextResponse.json({ error: "Could not sign you in. Please try again." }, { status: 500 });
  }
}
