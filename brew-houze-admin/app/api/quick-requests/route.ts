import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSession } from "@/lib/sessions";

// Quick requests (see quick-requests-migration.sql): short notes the cashier taps in the Customize
// window, such as Less ice or Spicy, each for drinks (bar) or food (kitchen). Notes only, so they
// are deleted outright: orders keep the request as text.
//
//   GET                                              -> every request, oldest first
//   POST   { request_text, station }                 -> adds one
//   PATCH  { request_id, request_text, station }     -> renames or moves one
//   DELETE { request_id }                            -> removes one

const MAX_LENGTH = 40;
type Row = { request_id: number; request_text: string; station: string };
const toRequest = (row: Row) => ({ id: Number(row.request_id), text: String(row.request_text), station: row.station === "kitchen" ? "kitchen" : "bar" });

function parse(body: { request_text?: unknown; station?: unknown }): { text: string; station: "bar" | "kitchen" } | { error: string } {
  const text = String(body?.request_text ?? "").replace(/\s+/g, " ").trim();
  if (!text) return { error: "Type the request, for example Less ice." };
  if (text.length > MAX_LENGTH) return { error: `Keep it short: ${MAX_LENGTH} characters at most.` };
  return { text, station: body?.station === "kitchen" ? "kitchen" : "bar" };
}

const duplicate = (error: unknown) => (error as { code?: string }).code === "23505";

export async function GET() {
  if (!(await getSession())) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  try {
    const result = await pool.query("SELECT request_id, request_text, station FROM quick_requests ORDER BY request_id");
    return NextResponse.json({ data: result.rows.map(toRequest) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/quick-requests failed:", error);
    return NextResponse.json({ error: "Could not load the requests." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!(await getSession())) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  try {
    const parsed = parse(await request.json());
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const result = await pool.query("INSERT INTO quick_requests (request_text, station) VALUES ($1, $2) RETURNING request_id, request_text, station", [parsed.text, parsed.station]);
    return NextResponse.json({ data: toRequest(result.rows[0]) }, { status: 201 });
  } catch (error) {
    if (duplicate(error)) return NextResponse.json({ error: "That request is already on the list." }, { status: 409 });
    console.error("POST /api/quick-requests failed:", error);
    return NextResponse.json({ error: "Could not add the request." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!(await getSession())) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  try {
    const body = await request.json();
    const requestId = Number(body?.request_id);
    if (!Number.isInteger(requestId) || requestId <= 0) return NextResponse.json({ error: "Choose a request." }, { status: 400 });
    const parsed = parse(body);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const result = await pool.query("UPDATE quick_requests SET request_text = $2, station = $3 WHERE request_id = $1 RETURNING request_id, request_text, station", [requestId, parsed.text, parsed.station]);
    if (result.rowCount === 0) return NextResponse.json({ error: "Request not found." }, { status: 404 });
    return NextResponse.json({ data: toRequest(result.rows[0]) });
  } catch (error) {
    if (duplicate(error)) return NextResponse.json({ error: "That request is already on the list." }, { status: 409 });
    console.error("PATCH /api/quick-requests failed:", error);
    return NextResponse.json({ error: "Could not save the request." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!(await getSession())) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  try {
    const body = await request.json();
    const requestId = Number(body?.request_id);
    if (!Number.isInteger(requestId) || requestId <= 0) return NextResponse.json({ error: "Choose a request." }, { status: 400 });
    await pool.query("DELETE FROM quick_requests WHERE request_id = $1", [requestId]);
    return NextResponse.json({ data: { id: requestId } });
  } catch (error) {
    console.error("DELETE /api/quick-requests failed:", error);
    return NextResponse.json({ error: "Could not remove the request." }, { status: 500 });
  }
}
