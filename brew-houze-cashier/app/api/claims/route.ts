import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { activeBirthdayCampaign, birthdayStatus, runningCampaign, runningRewards, starBalance } from "@/lib/loyalty";
import { getSession, isQueueOnly, QUEUE_ONLY } from "@/lib/sessions";
import { signalChange } from "@/lib/realtime";

// Claims from the printed Stars sign: a customer scanned it with their signed-in phone and
// picked a reward (or just asked to be added to the order). The counter sees who is waiting,
// accepts one into the current order, or declines it. Also returns the running campaign's
// rewards, for regulars without the app (redeemed with the cashier's password).

const ACCEPTED_MINUTES = 20;

async function expireOldClaims() {
  await pool.query("UPDATE loyalty_claims SET status = 'cancelled', closed_at = CURRENT_TIMESTAMP WHERE status IN ('pending', 'accepted') AND expires_at <= CURRENT_TIMESTAMP");
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (isQueueOnly(session)) return NextResponse.json(QUEUE_ONLY, { status: 403 });
  try {
    const [campaign, birthday] = await Promise.all([runningCampaign(), activeBirthdayCampaign()]);
    if (!campaign && !birthday) return NextResponse.json({ data: { campaign: null, birthday: null, claims: [], rewards: [] } }, { headers: { "Cache-Control": "no-store" } });
    await expireOldClaims();
    const [claims, rewards] = await Promise.all([
      pool.query(`
        SELECT lc.claim_id, lc.reward_id, c.customer_id, c.full_name, c.username, c.notes,
          TO_CHAR(lc.created_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS created_at,
          (SELECT COALESCE(SUM(stars), 0)::int FROM loyalty_star_entries e WHERE e.customer_id = c.customer_id AND e.campaign_id = $1) AS stars
        FROM loyalty_claims lc JOIN customers c ON c.customer_id = lc.customer_id AND c.is_active AND c.deleted_at IS NULL
        WHERE lc.status = 'pending'
        ORDER BY lc.created_at
      `, [campaign?.id ?? 0]),
      Promise.all([campaign ? runningRewards(campaign.id) : [], birthday ? runningRewards(birthday.id) : []]).then(([seasonal, treats]) => [...seasonal, ...treats]),
    ]);
    // Whether each waiting customer can have their birthday treat now.
    const treats = new Map<number, boolean>();
    for (const row of claims.rows) {
      const status = birthday ? await birthdayStatus(Number(row.customer_id)) : null;
      treats.set(Number(row.customer_id), Boolean(status?.eligible && !status.claimed));
    }
    return NextResponse.json({
      data: {
        campaign: campaign ? { id: campaign.id, name: campaign.name } : null,
        birthday: birthday ? { id: birthday.id, name: birthday.name, window: birthday.window } : null,
        rewards,
        claims: claims.rows.map((row) => ({
          id: Number(row.claim_id),
          rewardId: row.reward_id === null ? null : Number(row.reward_id),
          customerId: Number(row.customer_id),
          fullName: String(row.full_name),
          username: (row.username as string | null) ?? null,
          notes: String(row.notes ?? ""),
          stars: Number(row.stars),
          birthdayTreat: treats.get(Number(row.customer_id)) ?? false,
          createdAt: String(row.created_at),
        })),
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/claims failed:", error);
    return NextResponse.json({ error: "Could not load the customers waiting at the counter." }, { status: 500 });
  }
}

// { id, action: "accept" | "decline" }. Accepting gives the cashier the customer (to attach to
// the order) and their reward; the claim then stays valid for 20 minutes to finish the order.
export async function PATCH(request: Request) {
  // Live screens reload once this is saved (a failed request only causes an extra reload).
  signalChange("line");
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (isQueueOnly(session)) return NextResponse.json(QUEUE_ONLY, { status: 403 });
  let body: { id?: unknown; action?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Choose a claim." }, { status: 400 });
  }
  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "A valid claim is required." }, { status: 400 });
  try {
    if (body.action === "decline") {
      await pool.query("UPDATE loyalty_claims SET status = 'cancelled', closed_at = CURRENT_TIMESTAMP WHERE claim_id = $1 AND status IN ('pending', 'accepted')", [id]);
      return NextResponse.json({ data: { declined: true } });
    }
    if (body.action !== "accept") return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    await expireOldClaims();
    const accepted = await pool.query(`
      UPDATE loyalty_claims SET status = 'accepted', accepted_at = CURRENT_TIMESTAMP, accepted_by_admin_id = $2, expires_at = CURRENT_TIMESTAMP + make_interval(mins => $3)
      WHERE claim_id = $1 AND status = 'pending'
      RETURNING customer_id, reward_id, campaign_id
    `, [id, session.adminId, ACCEPTED_MINUTES]);
    if (accepted.rowCount === 0) return NextResponse.json({ error: "That claim expired or was already taken. Ask the customer to scan the Stars sign again." }, { status: 409 });
    const claim = accepted.rows[0];
    const customer = await pool.query(`
      SELECT c.customer_id, c.full_name, c.username, c.notes,
        (SELECT COUNT(*)::int FROM sales_orders WHERE customer_id = c.customer_id AND status = 'completed') AS visits
      FROM customers c WHERE c.customer_id = $1
    `, [claim.customer_id]);
    const row = customer.rows[0];
    const [seasonal, birthdayNow] = await Promise.all([runningCampaign(), birthdayStatus(Number(row.customer_id))]);
    const rewards = [...(seasonal ? await runningRewards(seasonal.id) : []), ...(birthdayNow?.rewards ?? [])];
    return NextResponse.json({
      data: {
        claimId: id,
        customer: {
          id: Number(row.customer_id), fullName: String(row.full_name), username: (row.username as string | null) ?? null, notes: String(row.notes ?? ""),
          visits: Number(row.visits), lastVisit: null, stars: seasonal ? await starBalance(Number(row.customer_id), seasonal.id) : null,
          birthdayTreat: Boolean(birthdayNow?.eligible && !birthdayNow.claimed),
        },
        reward: rewards.find((reward) => reward.id === Number(claim.reward_id)) ?? null,
      },
    });
  } catch (error) {
    console.error("PATCH /api/claims failed:", error);
    return NextResponse.json({ error: "Could not update the claim." }, { status: 500 });
  }
}
