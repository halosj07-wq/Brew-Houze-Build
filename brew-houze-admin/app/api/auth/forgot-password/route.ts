import { after, NextResponse } from "next/server";
import { sendPasswordResetEmail } from "@/lib/password-reset";

const PORTAL_NAME = "Admin Portal";

// Always answers the same way, and sends the email only after the response has gone out, so
// neither the message nor the response time reveals whether an email has an account.
export async function POST(request: Request) {
  let email = "";
  try {
    const body = await request.json() as { email?: unknown };
    email = String(body?.email ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Enter the email of your account." }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  // Links point back to the app the request came from (admin or cashier).
  const appUrl = process.env.APP_URL || new URL(request.url).origin;
  after(async () => {
    try {
      await sendPasswordResetEmail(email, appUrl, PORTAL_NAME);
    } catch (error) {
      console.error("Password reset email failed:", error);
    }
  });

  return NextResponse.json({ data: { sent: true } });
}
