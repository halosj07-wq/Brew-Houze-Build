import { NextResponse } from "next/server";
import { getSession } from "@/lib/sessions";

// The signed-in account; mustChangePassword: still on a temporary password from the admin.
export async function GET() {
  const session = await getSession({ allowPasswordChange: true });
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  return NextResponse.json({ data: session });
}
