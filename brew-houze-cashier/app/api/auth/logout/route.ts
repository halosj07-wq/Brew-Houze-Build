import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { closeAttendanceIfSignedOutEverywhere, endCurrentSession } from "@/lib/sessions";

// Ends this device's session. Attendance only ends if the person is not signed in to the cashier
// app on any other device, so signing out of a phone does not cut short a shift on the tablet.
export async function POST() {
  try {
    const adminId = await endCurrentSession();
    if (adminId !== null) await closeAttendanceIfSignedOutEverywhere(adminId);
  } catch (error) {
    // Clearing the cookie below still signs this browser out.
    console.error("POST /api/auth/logout failed to end the session:", error);
  }
  const response = NextResponse.json({ data: true });
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, expires: new Date(0), path: "/" });
  return response;
}
