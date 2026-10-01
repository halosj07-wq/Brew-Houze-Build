import { NextResponse } from "next/server";
import { finishAdminLogin } from "@/lib/login";
import { resendChallenge, verifyChallenge } from "@/lib/two-factor";

// Step two of signing in on a new device (see lib/two-factor.ts):
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
      const sent = await resendChallenge(challenge, "admin");
      if ("error" in sent) return NextResponse.json({ error: sent.error }, { status: sent.status });
      return NextResponse.json({ data: sent });
    }
    const verified = await verifyChallenge(challenge, String(body.code ?? ""), "admin", request.headers.get("user-agent"));
    if ("error" in verified) return NextResponse.json({ error: verified.error }, { status: verified.status });
    if (verified.kind !== "staff") return NextResponse.json({ error: "Sign in again." }, { status: 400 });
    return await finishAdminLogin(verified.accountId, request);
  } catch (error) {
    console.error("POST /api/auth/verify-code failed:", error);
    return NextResponse.json({ error: "Could not check the code. Please try again." }, { status: 500 });
  }
}
