import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { normalizePhone } from "@/lib/delivery";
import { birthdayProblem, cleanName, emailProblem, isUniqueViolation, passwordProblem, PRIVACY_NOTICE_VERSION, startCustomerSession, usernameProblem } from "@/lib/customers";
import { startChallenge, twoFactorEnabled } from "@/lib/two-factor";

// Creates a customer account and signs it in. Name, username, password and email (sign-in codes
// and password resets) are required; birthday is optional. With two-step sign-in on, the email is
// confirmed with a code first (see lib/two-factor.ts). Agreeing to the privacy notice is required.
export async function POST(request: Request) {
  let body: { username?: unknown; fullName?: unknown; password?: unknown; email?: unknown; birthday?: unknown; consent?: unknown; phone?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Fill in the sign-up form." }, { status: 400 });
  }
  const username = String(body.username ?? "").trim();
  const fullName = cleanName(body.fullName);
  const password = String(body.password ?? "");
  const email = String(body.email ?? "").trim().toLowerCase();
  const birthday = String(body.birthday ?? "").trim();
  // A mobile number is optional here, and needed later for delivery.
  const phoneText = String(body.phone ?? "").trim();
  const phone = phoneText ? normalizePhone(phoneText) : null;
  const problem = !fullName ? "Enter your name."
    : usernameProblem(username) ?? passwordProblem(password)
    ?? (!email && twoFactorEnabled() ? "Enter your email: signing in sends a code to it." : null)
    ?? emailProblem(email) ?? birthdayProblem(birthday)
    ?? (phoneText && !phone ? "Enter a mobile number like 0917 123 4567, or leave it empty." : null)
    ?? (body.consent !== true ? "Please agree to the privacy notice to make an account." : null);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  try {
    const result = await pool.query(`
      INSERT INTO customers (username, full_name, email, password_hash, birthday, consented_at, consent_version, phone)
      VALUES ($1, $2, NULLIF($3, ''), crypt($4, gen_salt('bf')), NULLIF($5, '')::date, CURRENT_TIMESTAMP, $6, $7)
      RETURNING customer_id
    `, [username, fullName, email, password, birthday, PRIVACY_NOTICE_VERSION, phone]);
    const customerId = Number(result.rows[0].customer_id);
    // The new account confirms its email with a code before it is signed in on this phone.
    if (twoFactorEnabled()) {
      const started = await startChallenge("customer", customerId, "mobile");
      if ("error" in started) return NextResponse.json({ error: `Your account is made, but ${started.error.charAt(0).toLowerCase()}${started.error.slice(1)}` }, { status: started.status });
      return NextResponse.json({ data: { username, fullName, twoFactor: started } }, { status: 201 });
    }
    await startCustomerSession(customerId, request.headers.get("user-agent"));
    return NextResponse.json({ data: { username, fullName } }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const field = String(error.constraint ?? "").includes("email") ? "email" : "username";
      return NextResponse.json({ error: field === "email" ? "Another account already uses this email." : "That username is taken. Try another one.", field }, { status: 409 });
    }
    console.error("POST /api/account/register failed:", error);
    return NextResponse.json({ error: "Could not make your account. Please try again." }, { status: 500 });
  }
}
