import type { PoolClient } from "pg";
import pool from "@/lib/db";

// Loyalty stars (see loyalty-campaigns-migration.sql). brew-houze-cashier and brew-houze-mobile
// keep identical copies of this file.
//
// A campaign is running when it is switched on and today (Philippine date) is within its dates.
// Stars are an append-only ledger: a balance is the sum of a customer's entries in a campaign.
// Earning and taking back run inside the order's transaction but under a savepoint, so a
// loyalty problem never blocks a sale or a void: it is logged, and the admin can adjust.

type Db = PoolClient | typeof pool;

const TODAY = "(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date";

export type RunningCampaign = {
  id: number; name: string; description: string | null; startsOn: string; endsOn: string | null;
  earnMode: "per_item" | "per_amount"; starsPerUnit: number; amountStep: number | null; categories: string[] | null;
  maxPerOrder: number | null; maxPerDay: number | null; carryOver: boolean;
};

export async function runningCampaign(db: Db = pool): Promise<RunningCampaign | null> {
  const result = await db.query(`
    SELECT campaign_id, name, description, TO_CHAR(starts_on, 'YYYY-MM-DD') AS starts_on, TO_CHAR(ends_on, 'YYYY-MM-DD') AS ends_on,
      earn_mode, stars_per_unit, amount_step, eligible_categories, max_stars_per_order, max_stars_per_day, carry_over
    FROM loyalty_campaigns
    WHERE is_active AND starts_on <= ${TODAY} AND (ends_on IS NULL OR ends_on >= ${TODAY})
    LIMIT 1
  `);
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: Number(row.campaign_id),
    name: String(row.name),
    description: (row.description as string | null) ?? null,
    startsOn: String(row.starts_on),
    endsOn: (row.ends_on as string | null) ?? null,
    earnMode: row.earn_mode === "per_amount" ? "per_amount" : "per_item",
    starsPerUnit: Number(row.stars_per_unit),
    amountStep: row.amount_step === null ? null : Number(row.amount_step),
    categories: Array.isArray(row.eligible_categories) && row.eligible_categories.length > 0 ? row.eligible_categories.map(String) : null,
    maxPerOrder: row.max_stars_per_order === null ? null : Number(row.max_stars_per_order),
    maxPerDay: row.max_stars_per_day === null ? null : Number(row.max_stars_per_day),
    carryOver: Boolean(row.carry_over),
  };
}

export async function starBalance(customerId: number, campaignId: number, db: Db = pool): Promise<number> {
  const result = await db.query("SELECT COALESCE(SUM(stars), 0)::int AS balance FROM loyalty_star_entries WHERE customer_id = $1 AND campaign_id = $2", [customerId, campaignId]);
  return Number(result.rows[0].balance);
}

// Stars an order earns under the campaign's rules, before the daily limit.
async function starsForOrder(client: PoolClient, orderId: number, campaign: RunningCampaign): Promise<number> {
  const lines = await client.query(`
    SELECT soi.quantity, COALESCE(p.product_category, '') AS category,
      soi.unit_price * soi.quantity + COALESCE((SELECT SUM(a.unit_price * a.quantity) FROM sales_order_item_additions a WHERE a.order_item_id = soi.order_item_id), 0) AS amount
    FROM sales_order_items soi JOIN products p ON p.product_id = soi.product_id
    WHERE soi.order_id = $1 AND soi.reward_id IS NULL
  `, [orderId]);
  const counted = lines.rows.filter((line) => !campaign.categories || campaign.categories.includes(String(line.category)));
  const units = campaign.earnMode === "per_amount"
    ? Math.floor(counted.reduce((sum, line) => sum + Number(line.amount), 0) / (campaign.amountStep ?? Number.POSITIVE_INFINITY) + 1e-9)
    : counted.reduce((sum, line) => sum + Number(line.quantity), 0);
  const stars = units * campaign.starsPerUnit;
  return campaign.maxPerOrder === null ? stars : Math.min(stars, campaign.maxPerOrder);
}

async function awardOrderStars(client: PoolClient, orderId: number, customerId: number): Promise<number> {
  const campaign = await runningCampaign(client);
  if (!campaign) return 0;
  let stars = await starsForOrder(client, orderId, campaign);
  if (stars <= 0) return 0;
  if (campaign.maxPerDay !== null) {
    const today = await client.query(`
      SELECT COALESCE(SUM(stars), 0)::int AS earned FROM loyalty_star_entries
      WHERE customer_id = $1 AND campaign_id = $2 AND kind = 'earned' AND (created_at AT TIME ZONE 'Asia/Manila')::date = ${TODAY}
    `, [customerId, campaign.id]);
    stars = Math.min(stars, campaign.maxPerDay - Number(today.rows[0].earned));
    if (stars <= 0) return 0;
  }
  const inserted = await client.query(`
    INSERT INTO loyalty_star_entries (customer_id, campaign_id, kind, stars, order_id)
    VALUES ($1, $2, 'earned', $3, $4)
    ON CONFLICT DO NOTHING
    RETURNING stars
  `, [customerId, campaign.id, stars, orderId]);
  return inserted.rowCount ? Number(inserted.rows[0].stars) : 0;
}

// Gives the customer their stars for a completed order. Returns how many (0 when no campaign is
// running, nothing counted, or a limit was reached).
export async function awardOrderStarsSafely(client: PoolClient, orderId: number, customerId: number): Promise<number> {
  await client.query("SAVEPOINT loyalty_award");
  try {
    const stars = await awardOrderStars(client, orderId, customerId);
    await client.query("RELEASE SAVEPOINT loyalty_award");
    return stars;
  } catch (error) {
    await client.query("ROLLBACK TO SAVEPOINT loyalty_award").catch(() => undefined);
    console.error(`Loyalty: could not award stars for order ${orderId}:`, error);
    return 0;
  }
}

// A voided or refunded order gives back the stars it earned (in the campaign it earned them in),
// and returns the stars spent on rewards in it.
export async function reverseOrderStarsSafely(client: PoolClient, orderId: number, adminId: number | null): Promise<number> {
  await client.query("SAVEPOINT loyalty_reverse");
  try {
    const result = await client.query(`
      INSERT INTO loyalty_star_entries (customer_id, campaign_id, kind, stars, order_id, admin_id, reason)
      SELECT customer_id, campaign_id, 'reversed', -stars, order_id, $2, 'Order voided or refunded'
      FROM loyalty_star_entries WHERE order_id = $1 AND kind = 'earned'
      ON CONFLICT DO NOTHING
      RETURNING stars
    `, [orderId, adminId]);
    await client.query(`
      INSERT INTO loyalty_star_entries (customer_id, campaign_id, kind, stars, order_id, reward_id, admin_id, reason)
      SELECT customer_id, campaign_id, 'restored', -stars, order_id, reward_id, $2, 'Reward order voided or refunded'
      FROM loyalty_star_entries redeemed
      WHERE redeemed.order_id = $1 AND redeemed.kind = 'redeemed'
        AND NOT EXISTS (SELECT 1 FROM loyalty_star_entries restored WHERE restored.order_id = $1 AND restored.kind = 'restored')
    `, [orderId, adminId]);
    await client.query("RELEASE SAVEPOINT loyalty_reverse");
    return result.rowCount ? -Number(result.rows[0].stars) : 0;
  } catch (error) {
    await client.query("ROLLBACK TO SAVEPOINT loyalty_reverse").catch(() => undefined);
    console.error(`Loyalty: could not take back stars for order ${orderId}:`, error);
    return 0;
  }
}

export type LoyaltyRewardRule = { id: number; name: string; starsCost: number; productId: number | null; category: string | null; maxPrice: number | null };
export type CustomerLoyalty = {
  campaign: Omit<RunningCampaign, "carryOver"> & { carryOver: boolean };
  balance: number;
  rewards: LoyaltyRewardRule[];
};

export async function runningRewards(campaignId: number, db: Db = pool): Promise<LoyaltyRewardRule[]> {
  const result = await db.query("SELECT reward_id, name, stars_cost, product_id, category, max_price FROM loyalty_rewards WHERE campaign_id = $1 AND is_active ORDER BY stars_cost, sort_order, reward_id", [campaignId]);
  return result.rows.map((row) => ({
    id: Number(row.reward_id), name: String(row.name), starsCost: Number(row.stars_cost),
    productId: row.product_id === null ? null : Number(row.product_id), category: (row.category as string | null) ?? null, maxPrice: row.max_price === null ? null : Number(row.max_price),
  }));
}

// Why an item cannot be taken as a reward, or null when it can.
export function rewardMismatch(reward: LoyaltyRewardRule, item: { productId: number; category: string | null; price: number; name: string }): string | null {
  if (reward.productId !== null && reward.productId !== item.productId) return `"${reward.name}" is for a different product than ${item.name}.`;
  if (reward.productId === null && reward.category && reward.category !== (item.category ?? "")) return `"${reward.name}" is only for ${reward.category} items.`;
  if (reward.maxPrice !== null && item.price > reward.maxPrice + 0.005) return `"${reward.name}" covers items up to ₱${reward.maxPrice.toFixed(2)}. ${item.name} costs ₱${item.price.toFixed(2)}.`;
  return null;
}

export type RewardLine = { rewardId: number; productId: number; category: string | null; price: number; name: string };

// Checks the reward lines of an order: a campaign is running, each reward belongs to it and
// covers its item, and the customer has enough stars. The customer row is locked until the
// order's transaction ends, so the same stars cannot be spent twice at the same time.
export async function checkRewardLines(client: PoolClient, customerId: number, lines: RewardLine[]): Promise<{ campaignId: number; rewards: Map<number, LoyaltyRewardRule> }> {
  const campaign = await runningCampaign(client);
  if (!campaign) throw new Error("No loyalty campaign is running, so rewards cannot be claimed right now.");
  const locked = await client.query("SELECT full_name FROM customers WHERE customer_id = $1 AND is_active = TRUE AND deleted_at IS NULL FOR UPDATE", [customerId]);
  if (locked.rowCount === 0) throw new Error("That customer can no longer use rewards.");
  const rewards = new Map((await runningRewards(campaign.id, client)).map((reward) => [reward.id, reward]));
  let cost = 0;
  for (const line of lines) {
    const reward = rewards.get(line.rewardId);
    if (!reward) throw new Error("That reward is no longer available.");
    const mismatch = rewardMismatch(reward, line);
    if (mismatch) throw new Error(mismatch);
    cost += reward.starsCost;
  }
  const balance = await starBalance(customerId, campaign.id, client);
  if (balance < cost) throw new Error(`Not enough stars: ${String(locked.rows[0].full_name).split(" ")[0]} has ${balance} and the rewards need ${cost}.`);
  return { campaignId: campaign.id, rewards };
}

// Records the stars spent on the reward lines of a placed order. Returns how many.
export async function recordRedemptions(client: PoolClient, orderId: number, customerId: number, campaignId: number, rewards: Map<number, LoyaltyRewardRule>, lines: RewardLine[]): Promise<number> {
  let spent = 0;
  for (const line of lines) {
    const reward = rewards.get(line.rewardId);
    if (!reward) continue;
    await client.query(`
      INSERT INTO loyalty_star_entries (customer_id, campaign_id, kind, stars, order_id, reward_id, reason)
      VALUES ($1, $2, 'redeemed', $3, $4, $5, $6)
    `, [customerId, campaignId, -reward.starsCost, orderId, reward.id, `${reward.name}: ${line.name}`]);
    spent += reward.starsCost;
  }
  return spent;
}

// What a customer sees: the running campaign, their stars in it, and the rewards. Null when no
// campaign is running.
export async function customerLoyalty(customerId: number, db: Db = pool): Promise<CustomerLoyalty | null> {
  const campaign = await runningCampaign(db);
  if (!campaign) return null;
  const [balance, rewards] = await Promise.all([starBalance(customerId, campaign.id, db), runningRewards(campaign.id, db)]);
  return { campaign, balance, rewards };
}
