import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { endCurrentSession } from "@/lib/sessions";

export async function POST() {
  try {
    await endCurrentSession();
  } catch (error) {
    // Clearing the cookie below still signs this browser out.
    console.error("POST /api/auth/logout failed to end the session:", error);
  }
  const response = NextResponse.json({ data: true });
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, expires: new Date(0), path: "/" });
  return response;
}
