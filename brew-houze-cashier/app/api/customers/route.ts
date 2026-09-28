import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { birthdayStatus, runningCampaign } from "@/lib/loyalty";
import { getSession, isQueueOnly, QUEUE_ONLY } from "@/lib/sessions";
import { normalizePhone } from "@/lib/delivery";

// Finds a customer to attach to the order at the counter: by name, username or mobile number (?q=), or by the
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
        AND ${username ? "LOWER(c.username) = LOWER($1)" : "(c.full_name ILIKE '%' || $1 || '%' OR c.username ILIKE $1 || '%' OR c.phone = $2)"}
      ORDER BY ${username ? "c.customer_id" : "(LOWER(c.username) = LOWER($1)) DESC, o.last_visit DESC NULLS LAST, c.full_name"}
      LIMIT ${MAX_RESULTS}
    `, username ? [username] : [escaped, normalizePhone(query) ?? ""]);
    // Stars in the running loyalty campaign (null when none is running).
    const campaign = await runningCampaign().catch(() => null);
    const balances = new Map<number, number>();
    if (campaign && result.rows.length > 0) {
      const stars = await pool.query(
        "SELECT customer_id, COALESCE(SUM(stars), 0)::int AS balance FROM loyalty_star_entries WHERE campaign_id = $1 AND customer_id = ANY($2::int[]) GROUP BY customer_id",
        [campaign.id, result.rows.map((row) => Number(row.customer_id))]
      );
      stars.rows.forEach((row) => balances.set(Number(row.customer_id), Number(row.balance)));
    }
    // Whether each customer can have their birthday treat now (a birthday campaign is on).
    const treats = new Map<number, boolean>();
    for (const row of result.rows) {
      const status = await birthdayStatus(Number(row.customer_id)).catch(() => null);
      if (!status) break;
      treats.set(Number(row.customer_id), status.eligible && !status.claimed);
    }
    return NextResponse.json({
      data: result.rows.map((row) => ({
        id: Number(row.customer_id),
        fullName: String(row.full_name),
        username: (row.username as string | null) ?? null,
        notes: String(row.notes ?? ""),
        visits: Number(row.visits),
        lastVisit: (row.last_visit as string | null) ?? null,
        stars: campaign ? balances.get(Number(row.customer_id)) ?? 0 : null,
        birthdayTreat: treats.get(Number(row.customer_id)) ?? false,
      })),
      campaign: campaign ? { name: campaign.name } : null,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/customers (staff) failed:", error);
    return NextResponse.json({ error: "Could not search the customers." }, { status: 500 });
  }
}
