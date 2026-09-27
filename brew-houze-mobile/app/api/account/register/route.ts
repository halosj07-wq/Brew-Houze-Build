import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { birthdayProblem, cleanName, emailProblem, isUniqueViolation, passwordProblem, PRIVACY_NOTICE_VERSION, startCustomerSession, usernameProblem } from "@/lib/customers";

// Creates a customer account and signs it in. Name, username and password are required; email
// (for password resets) and birthday are optional. Agreeing to the privacy notice is required.
export async function POST(request: Request) {
  let body: { username?: unknown; fullName?: unknown; password?: unknown; email?: unknown; birthday?: unknown; consent?: unknown };
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
  const problem = !fullName ? "Enter your name."
    : usernameProblem(username) ?? passwordProblem(password) ?? emailProblem(email) ?? birthdayProblem(birthday)
    ?? (body.consent !== true ? "Please agree to the privacy notice to make an account." : null);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  try {
    const result = await pool.query(`
      INSERT INTO customers (username, full_name, email, password_hash, birthday, consented_at, consent_version)
      VALUES ($1, $2, NULLIF($3, ''), crypt($4, gen_salt('bf')), NULLIF($5, '')::date, CURRENT_TIMESTAMP, $6)
      RETURNING customer_id
    `, [username, fullName, email, password, birthday, PRIVACY_NOTICE_VERSION]);
    await startCustomerSession(Number(result.rows[0].customer_id), request.headers.get("user-agent"));
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
