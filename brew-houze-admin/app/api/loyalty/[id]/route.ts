import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSession } from "@/lib/sessions";

const TZ = "Asia/Manila";

// One campaign's members (stars per customer) and its star history, newest first.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (String(session.role).toLowerCase() !== "admin") return NextResponse.json({ error: "Only an admin can view loyalty campaigns." }, { status: 403 });
  const { id: rawId } = await context.params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "A valid campaign is required." }, { status: 400 });
  try {
    const [members, entries] = await Promise.all([
      pool.query(`
        SELECT c.customer_id, c.full_name, c.username, c.deleted_at IS NOT NULL AS erased,
          SUM(e.stars)::int AS balance,
          COALESCE(SUM(e.stars) FILTER (WHERE e.kind = 'earned'), 0)::int AS earned,
          COUNT(DISTINCT e.order_id) FILTER (WHERE e.kind = 'earned')::int AS orders,
          COUNT(*) FILTER (WHERE e.kind = 'redeemed')::int - COUNT(*) FILTER (WHERE e.kind = 'restored')::int AS rewards,
          TO_CHAR(MAX(e.created_at) AT TIME ZONE '${TZ}', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS last_activity
        FROM loyalty_star_entries e JOIN customers c ON c.customer_id = e.customer_id
        WHERE e.campaign_id = $1
        GROUP BY c.customer_id
        ORDER BY SUM(e.stars) DESC, c.full_name
      `, [id]),
      pool.query(`
        SELECT e.entry_id, e.kind, e.stars, e.order_id, so.queue_number, e.reason, c.full_name AS customer_name, a.full_name AS admin_name, r.name AS reward_name,
          TO_CHAR(e.created_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS created_at
        FROM loyalty_star_entries e
        JOIN customers c ON c.customer_id = e.customer_id
        LEFT JOIN sales_orders so ON so.order_id = e.order_id
        LEFT JOIN admin_users a ON a.admin_id = e.admin_id
        LEFT JOIN loyalty_rewards r ON r.reward_id = e.reward_id
        WHERE e.campaign_id = $1
        ORDER BY e.created_at DESC, e.entry_id DESC
        LIMIT 2000
      `, [id]),
    ]);
    return NextResponse.json({
      data: {
        members: members.rows.map((row) => ({
          customerId: Number(row.customer_id), fullName: String(row.full_name), username: (row.username as string | null) ?? null, erased: Boolean(row.erased),
          balance: Number(row.balance), earned: Number(row.earned), orders: Number(row.orders), rewards: Number(row.rewards), lastActivity: String(row.last_activity),
        })),
        entries: entries.rows.map((row) => ({
          id: Number(row.entry_id), kind: String(row.kind), stars: Number(row.stars), orderId: row.order_id === null ? null : Number(row.order_id),
          queueNumber: row.queue_number === null ? null : Number(row.queue_number), reason: (row.reason as string | null) ?? null,
          customerName: String(row.customer_name), adminName: (row.admin_name as string | null) ?? null, rewardName: (row.reward_name as string | null) ?? null,
          createdAt: String(row.created_at),
        })),
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/loyalty/[id] failed:", error);
    return NextResponse.json({ error: "Could not load the campaign." }, { status: 500 });
  }
}
