import { NextResponse } from "next/server";
import { signInCustomer, startCustomerSession } from "@/lib/customers";
import { isTrustedDevice, startChallenge, twoFactorEnabled } from "@/lib/two-factor";

// Signs a customer in with their username (or email) and password. On a phone this account has
// not verified in the last 30 days, a code is emailed first and the answer is
// { twoFactor: { challenge, email } }; /api/account/verify-code finishes the sign-in.
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
    if (twoFactorEnabled() && !(await isTrustedDevice("customer", result.customerId))) {
      const started = await startChallenge("customer", result.customerId, "mobile");
      if ("error" in started) return NextResponse.json({ error: started.error }, { status: started.status });
      return NextResponse.json({ data: { twoFactor: started } });
    }
    await startCustomerSession(result.customerId, request.headers.get("user-agent"));
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    console.error("POST /api/account/login failed:", error);
    return NextResponse.json({ error: "Could not sign you in. Please try again." }, { status: 500 });
  }
}
