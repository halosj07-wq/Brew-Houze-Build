import { NextResponse } from "next/server";
import type { PoolClient } from "pg";
import pool from "@/lib/db";
import { getSession } from "@/lib/sessions";

// Loyalty campaigns (see loyalty-campaigns-migration.sql). Brew Houze runs its loyalty program in
// seasons: each campaign sets how stars are earned, limits, what happens to stars when it ends,
// and the rewards. At most one campaign is switched on; it earns stars while today is within its
// dates. Status shown to the admin:
//   draft      saved, never started
//   scheduled  switched on, starts later
//   running    switched on and within its dates
//   ended      ended by the admin, or past its end date
// Ended campaigns are read-only: their star history is the record of what customers earned.

const TODAY = "(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date";
const TZ = "Asia/Manila";
type Db = PoolClient | typeof pool;

type RewardInput = { id?: unknown; name?: unknown; starsCost?: unknown; productId?: unknown; category?: unknown; maxPrice?: unknown };
type CampaignInput = {
  name?: unknown; description?: unknown; startsOn?: unknown; endsOn?: unknown; earnMode?: unknown; starsPerUnit?: unknown; amountStep?: unknown;
  categories?: unknown; maxPerOrder?: unknown; maxPerDay?: unknown; carryOver?: unknown; rewards?: unknown;
};
type CleanReward = { id: number | null; name: string; starsCost: number; productId: number | null; category: string | null; maxPrice: number | null };
type CleanCampaign = {
  name: string; description: string | null; startsOn: string; endsOn: string | null; earnMode: "per_item" | "per_amount"; starsPerUnit: number; amountStep: number | null;
  categories: string[] | null; maxPerOrder: number | null; maxPerDay: number | null; carryOver: boolean; rewards: CleanReward[];
};

async function requireAdmin() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "Not authenticated." }, { status: 401 }) };
  if (String(session.role).toLowerCase() !== "admin") return { error: NextResponse.json({ error: "Only an admin can manage loyalty campaigns." }, { status: 403 }) };
  return { session };
}

const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const optionalPositiveInt = (value: unknown, max: number): number | null | "bad" => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 && number <= max ? number : "bad";
};

function cleanCampaign(body: CampaignInput): CleanCampaign | { error: string } {
  const name = String(body.name ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  const description = String(body.description ?? "").trim().slice(0, 400) || null;
  const startsOn = String(body.startsOn ?? "").trim();
  const endsOn = String(body.endsOn ?? "").trim() || null;
  const earnMode = body.earnMode === "per_amount" ? "per_amount" : body.earnMode === "per_item" ? "per_item" : null;
  const starsPerUnit = Number(body.starsPerUnit);
  const amountStep = body.amountStep === null || body.amountStep === undefined || body.amountStep === "" ? null : Math.round(Number(body.amountStep) * 100) / 100;
  const maxPerOrder = optionalPositiveInt(body.maxPerOrder, 1000);
  const maxPerDay = optionalPositiveInt(body.maxPerDay, 1000);
  const categories = Array.isArray(body.categories) ? Array.from(new Set(body.categories.map((category) => String(category).trim()).filter(Boolean))).slice(0, 50) : [];
  if (!name) return { error: "Give the campaign a name." };
  if (!isDate(startsOn)) return { error: "Choose the start date." };
  if (endsOn && (!isDate(endsOn) || endsOn < startsOn)) return { error: "The end date must be on or after the start date." };
  if (!earnMode) return { error: "Choose how stars are earned." };
  if (!Number.isInteger(starsPerUnit) || starsPerUnit < 1 || starsPerUnit > 100) return { error: "Stars earned must be a whole number from 1 to 100." };
  if (earnMode === "per_amount" && (amountStep === null || !Number.isFinite(amountStep) || amountStep <= 0 || amountStep > 100000)) return { error: "Enter how many pesos earn the stars (for example 100)." };
  if (maxPerOrder === "bad" || maxPerDay === "bad") return { error: "Limits must be whole numbers above 0, or empty for no limit." };
  if (maxPerOrder !== null && maxPerDay !== null && maxPerDay < maxPerOrder) return { error: "The daily limit cannot be lower than the per-order limit." };

  const rawRewards = Array.isArray(body.rewards) ? body.rewards as RewardInput[] : [];
  if (rawRewards.length > 30) return { error: "A campaign can have at most 30 rewards." };
  const rewards: CleanReward[] = [];
  for (const raw of rawRewards) {
    const rewardName = String(raw.name ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
    const starsCost = Number(raw.starsCost);
    const productId = raw.productId === null || raw.productId === undefined || raw.productId === "" ? null : Number(raw.productId);
    const category = String(raw.category ?? "").trim() || null;
    const maxPrice = raw.maxPrice === null || raw.maxPrice === undefined || raw.maxPrice === "" ? null : Math.round(Number(raw.maxPrice) * 100) / 100;
    const id = raw.id === null || raw.id === undefined || raw.id === "" ? null : Number(raw.id);
    if (!rewardName) return { error: "Every reward needs a name." };
    if (!Number.isInteger(starsCost) || starsCost < 1 || starsCost > 1000) return { error: `Set how many stars "${rewardName}" costs (1 to 1000).` };
    if (productId !== null && (!Number.isInteger(productId) || productId <= 0)) return { error: `Choose a valid product for "${rewardName}".` };
    if (maxPrice !== null && (!Number.isFinite(maxPrice) || maxPrice < 0)) return { error: `The price limit of "${rewardName}" must be ₱0 or more.` };
    rewards.push({ id: id !== null && Number.isInteger(id) && id > 0 ? id : null, name: rewardName, starsCost, productId, category, maxPrice });
  }
  return { name, description, startsOn, endsOn, earnMode, starsPerUnit, amountStep: earnMode === "per_amount" ? amountStep : null, categories: categories.length ? categories : null, maxPerOrder, maxPerDay, carryOver: body.carryOver === true, rewards };
}

async function saveRewards(client: PoolClient, campaignId: number, rewards: CleanReward[]) {
  const existing = await client.query("SELECT reward_id FROM loyalty_rewards WHERE campaign_id = $1", [campaignId]);
  const existingIds = new Set(existing.rows.map((row) => Number(row.reward_id)));
  const kept = new Set<number>();
  for (const [index, reward] of rewards.entries()) {
    if (reward.id !== null && existingIds.has(reward.id)) {
      kept.add(reward.id);
      await client.query("UPDATE loyalty_rewards SET name = $2, stars_cost = $3, product_id = $4, category = $5, max_price = $6, sort_order = $7, is_active = TRUE WHERE reward_id = $1", [reward.id, reward.name, reward.starsCost, reward.productId, reward.category, reward.maxPrice, index]);
    } else {
      await client.query("INSERT INTO loyalty_rewards (campaign_id, name, stars_cost, product_id, category, max_price, sort_order) VALUES ($1, $2, $3, $4, $5, $6, $7)", [campaignId, reward.name, reward.starsCost, reward.productId, reward.category, reward.maxPrice, index]);
    }
  }
  // Removed rewards: deleted unless a customer already claimed one (then only switched off).
  for (const id of existingIds) {
    if (kept.has(id)) continue;
    const used = await client.query("SELECT 1 FROM loyalty_star_entries WHERE reward_id = $1 LIMIT 1", [id]);
    if (used.rowCount) await client.query("UPDATE loyalty_rewards SET is_active = FALSE WHERE reward_id = $1", [id]);
    else await client.query("DELETE FROM loyalty_rewards WHERE reward_id = $1", [id]);
  }
}

// Switches a campaign on. A campaign still switched on but past its end date is ended first.
// When the campaign that ended last was set to carry over, each customer's remaining stars move
// into this one (once: a campaign is only carried out of once).
async function activateCampaign(client: PoolClient, campaignId: number, adminId: number): Promise<{ carried: number } | { error: string; status: number }> {
  const target = await client.query("SELECT is_active, ended_at FROM loyalty_campaigns WHERE campaign_id = $1 FOR UPDATE", [campaignId]);
  if (target.rowCount === 0) return { error: "Campaign not found.", status: 404 };
  if (target.rows[0].ended_at !== null) return { error: "Ended campaigns cannot be restarted. Make a new campaign instead.", status: 409 };
  if (target.rows[0].is_active) return { carried: 0 };
  await client.query(`UPDATE loyalty_campaigns SET is_active = FALSE, ended_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE is_active AND ends_on IS NOT NULL AND ends_on < ${TODAY}`);
  const other = await client.query("SELECT name FROM loyalty_campaigns WHERE is_active LIMIT 1");
  if (other.rowCount) return { error: `"${other.rows[0].name}" is still switched on. End it first, since only one campaign runs at a time.`, status: 409 };
  await client.query("UPDATE loyalty_campaigns SET is_active = TRUE, activated_at = COALESCE(activated_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE campaign_id = $1", [campaignId]);

  const previous = await client.query(`
    SELECT campaign_id, name, carry_over FROM loyalty_campaigns
    WHERE campaign_id <> $1 AND ended_at IS NOT NULL
    ORDER BY ended_at DESC LIMIT 1
  `, [campaignId]);
  const prior = previous.rows[0];
  if (!prior || !prior.carry_over) return { carried: 0 };
  const alreadyCarried = await client.query("SELECT 1 FROM loyalty_star_entries WHERE campaign_id = $1 AND kind = 'carried_out' LIMIT 1", [prior.campaign_id]);
  if (alreadyCarried.rowCount) return { carried: 0 };
  const balances = await client.query(`
    SELECT e.customer_id, SUM(e.stars)::int AS balance FROM loyalty_star_entries e
    JOIN customers c ON c.customer_id = e.customer_id AND c.deleted_at IS NULL
    WHERE e.campaign_id = $1 GROUP BY e.customer_id HAVING SUM(e.stars) > 0
  `, [prior.campaign_id]);
  for (const row of balances.rows) {
    await client.query(`
      INSERT INTO loyalty_star_entries (customer_id, campaign_id, kind, stars, admin_id, reason)
      VALUES ($1, $2, 'carried_out', $3, $5, $6), ($1, $4, 'carried_in', $7, $5, $8)
    `, [row.customer_id, prior.campaign_id, -Number(row.balance), campaignId, adminId, "Moved to the next campaign", Number(row.balance), `Carried over from ${prior.name}`]);
  }
  return { carried: balances.rowCount ?? 0 };
}

async function loadCampaigns(db: Db) {
  const campaigns = await db.query(`
    SELECT c.campaign_id, c.name, c.description, TO_CHAR(c.starts_on, 'YYYY-MM-DD') AS starts_on, TO_CHAR(c.ends_on, 'YYYY-MM-DD') AS ends_on,
      c.is_active, c.earn_mode, c.stars_per_unit, c.amount_step, c.eligible_categories, c.max_stars_per_order, c.max_stars_per_day, c.carry_over,
      TO_CHAR(c.activated_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS activated_at,
      TO_CHAR(c.ended_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS ended_at,
      TO_CHAR(c.created_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS created_at,
      CASE
        WHEN c.ended_at IS NOT NULL OR (c.is_active AND c.ends_on IS NOT NULL AND c.ends_on < ${TODAY}) THEN 'ended'
        WHEN c.is_active AND c.starts_on > ${TODAY} THEN 'scheduled'
        WHEN c.is_active THEN 'running'
        ELSE 'draft'
      END AS status,
      COALESCE(s.members, 0) AS members, COALESCE(s.earned, 0) AS earned, COALESCE(s.reversed, 0) AS reversed, COALESCE(s.adjusted, 0) AS adjusted,
      COALESCE(s.carried_in, 0) AS carried_in, COALESCE(s.redeemed, 0) AS redeemed, COALESCE(s.rewards_claimed, 0) AS rewards_claimed, COALESCE(s.outstanding, 0) AS outstanding,
      COALESCE(s.orders, 0) AS orders
    FROM loyalty_campaigns c
    LEFT JOIN LATERAL (
      SELECT COUNT(DISTINCT customer_id)::int AS members,
        COALESCE(SUM(stars) FILTER (WHERE kind = 'earned'), 0)::int AS earned,
        COALESCE(-SUM(stars) FILTER (WHERE kind = 'reversed'), 0)::int AS reversed,
        COALESCE(SUM(stars) FILTER (WHERE kind = 'adjusted'), 0)::int AS adjusted,
        COALESCE(SUM(stars) FILTER (WHERE kind = 'carried_in'), 0)::int AS carried_in,
        COALESCE(-SUM(stars) FILTER (WHERE kind IN ('redeemed', 'restored')), 0)::int AS redeemed,
        COUNT(*) FILTER (WHERE kind = 'redeemed')::int - COUNT(*) FILTER (WHERE kind = 'restored')::int AS rewards_claimed,
        COALESCE(SUM(stars), 0)::int AS outstanding,
        COUNT(DISTINCT order_id) FILTER (WHERE kind = 'earned')::int AS orders
      FROM loyalty_star_entries WHERE campaign_id = c.campaign_id
    ) s ON TRUE
    ORDER BY (c.is_active AND c.ended_at IS NULL) DESC, COALESCE(c.activated_at, c.created_at) DESC
  `);
  const rewards = await db.query(`
    SELECT r.reward_id, r.campaign_id, r.name, r.stars_cost, r.product_id, p.product_name, r.category, r.max_price
    FROM loyalty_rewards r LEFT JOIN products p ON p.product_id = r.product_id
    WHERE r.is_active ORDER BY r.stars_cost, r.sort_order, r.reward_id
  `);
  return campaigns.rows.map((row) => ({
    id: Number(row.campaign_id),
    name: String(row.name),
    description: (row.description as string | null) ?? "",
    startsOn: String(row.starts_on),
    endsOn: (row.ends_on as string | null) ?? null,
    status: String(row.status) as "draft" | "scheduled" | "running" | "ended",
    isActive: Boolean(row.is_active),
    earnMode: row.earn_mode === "per_amount" ? "per_amount" : "per_item",
    starsPerUnit: Number(row.stars_per_unit),
    amountStep: row.amount_step === null ? null : Number(row.amount_step),
    categories: Array.isArray(row.eligible_categories) ? row.eligible_categories.map(String) : [],
    maxPerOrder: row.max_stars_per_order === null ? null : Number(row.max_stars_per_order),
    maxPerDay: row.max_stars_per_day === null ? null : Number(row.max_stars_per_day),
    carryOver: Boolean(row.carry_over),
    activatedAt: (row.activated_at as string | null) ?? null,
    endedAt: (row.ended_at as string | null) ?? null,
    createdAt: String(row.created_at),
    stats: {
      members: Number(row.members), earned: Number(row.earned), reversed: Number(row.reversed), adjusted: Number(row.adjusted), carriedIn: Number(row.carried_in),
      redeemed: Number(row.redeemed), rewardsClaimed: Number(row.rewards_claimed), outstanding: Number(row.outstanding), orders: Number(row.orders),
    },
    rewards: rewards.rows.filter((reward) => Number(reward.campaign_id) === Number(row.campaign_id)).map((reward) => ({
      id: Number(reward.reward_id), name: String(reward.name), starsCost: Number(reward.stars_cost),
      productId: reward.product_id === null ? null : Number(reward.product_id), productName: (reward.product_name as string | null) ?? null,
      category: (reward.category as string | null) ?? null, maxPrice: reward.max_price === null ? null : Number(reward.max_price),
    })),
  }));
}

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  try {
    return NextResponse.json({ data: await loadCampaigns(pool) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/loyalty failed:", error);
    const missing = error && typeof error === "object" && (error as { code?: string }).code === "42P01";
    return NextResponse.json({ error: missing ? "Loyalty is not set up yet. Run loyalty-campaigns-migration.sql in Supabase." : "Could not load the loyalty campaigns." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  let body: CampaignInput & { activate?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Fill in the campaign." }, { status: 400 });
  }
  const campaign = cleanCampaign(body);
  if ("error" in campaign) return NextResponse.json({ error: campaign.error }, { status: 400 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query(`
      INSERT INTO loyalty_campaigns (name, description, starts_on, ends_on, earn_mode, stars_per_unit, amount_step, eligible_categories, max_stars_per_order, max_stars_per_day, carry_over, created_by_admin_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING campaign_id
    `, [campaign.name, campaign.description, campaign.startsOn, campaign.endsOn, campaign.earnMode, campaign.starsPerUnit, campaign.amountStep, campaign.categories, campaign.maxPerOrder, campaign.maxPerDay, campaign.carryOver, auth.session.adminId]);
    const campaignId = Number(inserted.rows[0].campaign_id);
    await saveRewards(client, campaignId, campaign.rewards);
    let carried = 0;
    if (body.activate === true) {
      const activated = await activateCampaign(client, campaignId, auth.session.adminId);
      if ("error" in activated) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: activated.error }, { status: activated.status });
      }
      carried = activated.carried;
    }
    await client.query("COMMIT");
    return NextResponse.json({ data: { id: campaignId, carried } }, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("POST /api/loyalty failed:", error);
    return NextResponse.json({ error: "Could not save the campaign." }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  let body: CampaignInput & { id?: unknown; action?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }
  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "A valid campaign is required." }, { status: 400 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(`SELECT ended_at IS NOT NULL OR (is_active AND ends_on IS NOT NULL AND ends_on < ${TODAY}) AS ended, is_active FROM loyalty_campaigns WHERE campaign_id = $1 FOR UPDATE`, [id]);
    if (current.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    }
    const ended = Boolean(current.rows[0].ended);

    if (body.action === "end") {
      await client.query("UPDATE loyalty_campaigns SET is_active = FALSE, ended_at = COALESCE(ended_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE campaign_id = $1", [id]);
      await client.query("COMMIT");
      return NextResponse.json({ data: { ended: true } });
    }
    if (ended) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "This campaign has ended. Its settings are kept as a record and cannot be changed." }, { status: 409 });
    }
    if (body.action === "activate") {
      const activated = await activateCampaign(client, id, auth.session.adminId);
      if ("error" in activated) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: activated.error }, { status: activated.status });
      }
      await client.query("COMMIT");
      return NextResponse.json({ data: activated });
    }
    if (body.action === "update") {
      const campaign = cleanCampaign(body);
      if ("error" in campaign) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: campaign.error }, { status: 400 });
      }
      await client.query(`
        UPDATE loyalty_campaigns
        SET name = $2, description = $3, starts_on = $4, ends_on = $5, earn_mode = $6, stars_per_unit = $7, amount_step = $8, eligible_categories = $9,
          max_stars_per_order = $10, max_stars_per_day = $11, carry_over = $12, updated_at = CURRENT_TIMESTAMP
        WHERE campaign_id = $1
      `, [id, campaign.name, campaign.description, campaign.startsOn, campaign.endsOn, campaign.earnMode, campaign.starsPerUnit, campaign.amountStep, campaign.categories, campaign.maxPerOrder, campaign.maxPerDay, campaign.carryOver]);
      await saveRewards(client, id, campaign.rewards);
      await client.query("COMMIT");
      return NextResponse.json({ data: { id } });
    }
    await client.query("ROLLBACK");
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("PATCH /api/loyalty failed:", error);
    return NextResponse.json({ error: "Could not update the campaign." }, { status: 500 });
  } finally {
    client.release();
  }
}

// Campaigns are never deleted: their star history is part of the customers' records. A draft
// that was never started can be removed, since nothing points to it.
export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "A valid campaign is required." }, { status: 400 });
  try {
    const result = await pool.query(`
      DELETE FROM loyalty_campaigns c WHERE c.campaign_id = $1 AND c.activated_at IS NULL AND NOT c.is_active
        AND NOT EXISTS (SELECT 1 FROM loyalty_star_entries e WHERE e.campaign_id = c.campaign_id)
      RETURNING campaign_id
    `, [id]);
    if (result.rowCount === 0) return NextResponse.json({ error: "Only drafts that were never started can be deleted." }, { status: 409 });
    return NextResponse.json({ data: { deleted: true } });
  } catch (error) {
    console.error("DELETE /api/loyalty failed:", error);
    return NextResponse.json({ error: "Could not delete the campaign." }, { status: 500 });
  }
}
