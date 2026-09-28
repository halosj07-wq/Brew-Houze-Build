import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getCustomerSession } from "@/lib/customers";
import { runningCampaign, runningRewards, starBalance } from "@/lib/loyalty";

// The customer's side of the printed Stars sign. After scanning it (signed in), they pick a
// reward or just ask to be added to their counter order. The claim waits for the cashier (staff
// app) for 10 minutes. Their phone asks for its status until the cashier takes it.
// Proof that it is really them: the claim comes from their own signed-in account.

const PENDING_MINUTES = 10;

const claimStatusSql = `
  SELECT lc.claim_id, lc.reward_id, lr.name AS reward_name, lr.stars_cost,
    CASE WHEN lc.status IN ('pending', 'accepted') AND lc.expires_at <= CURRENT_TIMESTAMP THEN 'expired' ELSE lc.status END AS status,
    TO_CHAR(lc.expires_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS expires_at,
    so.queue_number
  FROM loyalty_claims lc
  LEFT JOIN loyalty_rewards lr ON lr.reward_id = lc.reward_id
  LEFT JOIN sales_orders so ON so.order_id = lc.order_id
`;

function mapClaim(row: Record<string, unknown>) {
  return {
    id: Number(row.claim_id),
    rewardId: row.reward_id === null ? null : Number(row.reward_id),
    rewardName: (row.reward_name as string | null) ?? null,
    starsCost: row.stars_cost === null ? null : Number(row.stars_cost),
    status: String(row.status) as "pending" | "accepted" | "used" | "cancelled" | "expired",
    expiresAt: String(row.expires_at),
    queueNumber: row.queue_number === null || row.queue_number === undefined ? null : Number(row.queue_number),
  };
}

// The customer's latest claim (for the waiting screen), or null.
export async function GET() {
  const session = await getCustomerSession();
  if (!session) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  try {
    const result = await pool.query(`${claimStatusSql} WHERE lc.customer_id = $1 ORDER BY lc.created_at DESC LIMIT 1`, [session.customerId]);
    return NextResponse.json({ data: result.rows[0] ? mapClaim(result.rows[0]) : null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/claims failed:", error);
    return NextResponse.json({ error: "Could not check your claim." }, { status: 500 });
  }
}

// { rewardId } or { rewardId: null } to only be added to the order. Replaces any open claim.
export async function POST(request: Request) {
  const session = await getCustomerSession();
  if (!session) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  let body: { rewardId?: unknown };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const rewardId = body.rewardId === null || body.rewardId === undefined ? null : Number(body.rewardId);
  if (rewardId !== null && (!Number.isInteger(rewardId) || rewardId <= 0)) return NextResponse.json({ error: "Choose a reward." }, { status: 400 });
  const client = await pool.connect();
  try {
    const campaign = await runningCampaign(client);
    if (rewardId !== null) {
      if (!campaign) return NextResponse.json({ error: "No rewards campaign is running right now." }, { status: 409 });
      const reward = (await runningRewards(campaign.id, client)).find((item) => item.id === rewardId);
      if (!reward) return NextResponse.json({ error: "That reward is no longer available." }, { status: 409 });
      const balance = await starBalance(session.customerId, campaign.id, client);
      if (balance < reward.starsCost) return NextResponse.json({ error: `You need ${reward.starsCost - balance} more stars for ${reward.name}.` }, { status: 409 });
    }
    await client.query("BEGIN");
    await client.query("UPDATE loyalty_claims SET status = 'cancelled', closed_at = CURRENT_TIMESTAMP WHERE customer_id = $1 AND status IN ('pending', 'accepted')", [session.customerId]);
    const inserted = await client.query(`
      INSERT INTO loyalty_claims (customer_id, campaign_id, reward_id, expires_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP + make_interval(mins => $4))
      RETURNING claim_id
    `, [session.customerId, campaign?.id ?? null, rewardId, PENDING_MINUTES]);
    await client.query("COMMIT");
    const claim = await pool.query(`${claimStatusSql} WHERE lc.claim_id = $1`, [inserted.rows[0].claim_id]);
    return NextResponse.json({ data: mapClaim(claim.rows[0]) }, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("POST /api/claims failed:", error);
    return NextResponse.json({ error: "Could not send your claim. Please try again." }, { status: 500 });
  } finally {
    client.release();
  }
}

// Cancels the customer's open claim.
export async function DELETE() {
  const session = await getCustomerSession();
  if (!session) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  try {
    await pool.query("UPDATE loyalty_claims SET status = 'cancelled', closed_at = CURRENT_TIMESTAMP WHERE customer_id = $1 AND status IN ('pending', 'accepted')", [session.customerId]);
    return NextResponse.json({ data: { cancelled: true } });
  } catch (error) {
    console.error("DELETE /api/claims failed:", error);
    return NextResponse.json({ error: "Could not cancel your claim." }, { status: 500 });
  }
}
