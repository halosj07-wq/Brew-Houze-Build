import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { startCustomerSession } from "@/lib/customers";
import { resendChallenge, verifyChallenge } from "@/lib/two-factor";

// Step two of signing in (or of a new account) on a new phone (see lib/two-factor.ts):
//   POST { challenge, code }                -> checks the emailed code and signs in
//   POST { challenge, action: "resend" }    -> emails a new code
export async function POST(request: Request) {
  let body: { challenge?: unknown; code?: unknown; action?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Type the code from the email." }, { status: 400 });
  }
  const challenge = String(body.challenge ?? "");
  try {
    if (body.action === "resend") {
      const sent = await resendChallenge(challenge, "mobile");
      if ("error" in sent) return NextResponse.json({ error: sent.error }, { status: sent.status });
      return NextResponse.json({ data: sent });
    }
    const verified = await verifyChallenge(challenge, String(body.code ?? ""), "mobile", request.headers.get("user-agent"));
    if ("error" in verified) return NextResponse.json({ error: verified.error }, { status: verified.status });
    if (verified.kind !== "customer") return NextResponse.json({ error: "Sign in again." }, { status: 400 });
    const account = await pool.query("SELECT 1 FROM customers WHERE customer_id = $1 AND is_active = TRUE AND deleted_at IS NULL AND username IS NOT NULL", [verified.accountId]);
    if (account.rowCount === 0) return NextResponse.json({ error: "This account can no longer sign in." }, { status: 401 });
    await startCustomerSession(verified.accountId, request.headers.get("user-agent"));
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    console.error("POST /api/account/verify-code failed:", error);
    return NextResponse.json({ error: "Could not check the code. Please try again." }, { status: 500 });
  }
}
