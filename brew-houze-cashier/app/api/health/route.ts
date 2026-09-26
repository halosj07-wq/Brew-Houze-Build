import { NextResponse } from "next/server";
import pool from "@/lib/db";

// Connection check for the top-bar indicator. Answers only whether the database responds and how
// fast; it reveals no data, so it does not require a sign-in.
export async function GET() {
  const started = performance.now();
  try {
    await pool.query("SELECT 1");
    return NextResponse.json({ ok: true, database: "up", dbMs: Math.round(performance.now() - started) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/health: database check failed:", error);
    return NextResponse.json({ ok: false, database: "down" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
