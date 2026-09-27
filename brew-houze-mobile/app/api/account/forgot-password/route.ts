import { NextResponse } from "next/server";
import { emailConfigured, resolveAppUrl, sendCustomerResetEmail } from "@/lib/customers";

// Emails a reset link when the account has an email on file. The answer is the same whether or
// not an account matched, so the form cannot be used to find out who has an account.
export async function POST(request: Request) {
  let body: { login?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Enter your email or username." }, { status: 400 });
  }
  const login = String(body.login ?? "").trim();
  if (!login) return NextResponse.json({ error: "Enter your email or username." }, { status: 400 });
  const appUrl = resolveAppUrl(request.url);
  if (!emailConfigured() || !appUrl) return NextResponse.json({ error: "Password reset by email is not available right now. Please ask at the counter." }, { status: 503 });
  try {
    await sendCustomerResetEmail(login, appUrl);
  } catch (error) {
    console.error("POST /api/account/forgot-password failed:", error);
  }
  return NextResponse.json({ data: { ok: true } });
}
