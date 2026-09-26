import { NextResponse } from "next/server";
import { checkResetToken, resetPasswordWithToken } from "@/lib/password-reset";

// GET ?token=... tells the reset screen whether the emailed link is still usable.
export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token") ?? "";
    return NextResponse.json({ data: await checkResetToken(token) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/auth/reset-password failed:", error);
    return NextResponse.json({ error: "Could not check the reset link." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { token?: unknown; password?: unknown };
    const result = await resetPasswordWithToken(String(body?.token ?? ""), String(body?.password ?? ""));
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ data: { reset: true } });
  } catch (error) {
    console.error("POST /api/auth/reset-password failed:", error);
    return NextResponse.json({ error: "Could not reset the password." }, { status: 500 });
  }
}
