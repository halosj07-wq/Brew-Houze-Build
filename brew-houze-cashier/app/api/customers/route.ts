import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSession, isQueueOnly, QUEUE_ONLY } from "@/lib/sessions";

// Finds a customer to attach to the order at the counter: by name or username (?q=), or by the
// code on their phone (?code=, from the QR in their mobile menu account). Only what the counter
// needs is returned: no email or birthday. Notes are the café's own, for serving them.

const MIN_QUERY_LENGTH = 2;
const MAX_RESULTS = 12;
// The QR in the customer's account holds "brewhouze:customer:<username>".
const CODE_PREFIX = "brewhouze:customer:";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (isQueueOnly(session)) return NextResponse.json(QUEUE_ONLY, { status: 403 });
  const params = new URL(request.url).searchParams;
  const code = (params.get("code") ?? "").trim();
  const query = (params.get("q") ?? "").trim().replace(/^@/, "").slice(0, 80);
  const username = code.toLowerCase().startsWith(CODE_PREFIX) ? code.slice(CODE_PREFIX.length) : code;
  if (!username && query.length < MIN_QUERY_LENGTH) return NextResponse.json({ data: [] });
  try {
    const escaped = query.replace(/[\\%_]/g, (character) => `\\${character}`);
    const result = await pool.query(`
      SELECT c.customer_id, c.full_name, c.username, c.notes,
        COALESCE(o.visits, 0) AS visits,
        TO_CHAR(o.last_visit AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS last_visit
      FROM customers c
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS visits, MAX(created_at) AS last_visit FROM sales_orders WHERE customer_id = c.customer_id AND status = 'completed'
      ) o ON TRUE
      WHERE c.is_active = TRUE AND c.deleted_at IS NULL
        AND ${username ? "LOWER(c.username) = LOWER($1)" : "(c.full_name ILIKE '%' || $1 || '%' OR c.username ILIKE $1 || '%')"}
      ORDER BY ${username ? "c.customer_id" : "(LOWER(c.username) = LOWER($1)) DESC, o.last_visit DESC NULLS LAST, c.full_name"}
      LIMIT ${MAX_RESULTS}
    `, [username || escaped]);
    return NextResponse.json({
      data: result.rows.map((row) => ({
        id: Number(row.customer_id),
        fullName: String(row.full_name),
        username: (row.username as string | null) ?? null,
        notes: String(row.notes ?? ""),
        visits: Number(row.visits),
        lastVisit: (row.last_visit as string | null) ?? null,
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/customers (staff) failed:", error);
    return NextResponse.json({ error: "Could not search the customers." }, { status: 500 });
  }
}
