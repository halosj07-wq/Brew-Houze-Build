import type { PoolClient } from "pg";
import pool from "@/lib/db";

// Loyalty (see loyalty-campaigns-migration.sql and loyalty-extras-migration.sql).
// brew-houze-cashier and brew-houze-mobile keep identical copies of this file.
//
// Two kinds of campaign can run side by side:
//   seasonal  stars: earned per item, per amount spent or per order while it is switched on and
//             today (Philippine date) is within its dates, and spent on rewards.
//   birthday  one free treat a year per customer (no stars), within the campaign's window around
//             the birthday on their profile. It has no end date and is switched on and off.
// A reward is a free item (an order line priced at 0) or a discount off the order.
// Stars are an append-only ledger: a balance is the sum of a customer's entries in a campaign.
// Earning and taking back run inside the order's transaction but under a savepoint, so a
// loyalty problem never blocks a sale or a void: it is logged, and the admin can adjust.
// Spending (rewards) is checked strictly: an order that cannot pay its rewards is refused.

type Db = PoolClient | typeof pool;

const TODAY = "(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date";

export type EarnMode = "per_item" | "per_amount" | "per_order";
export type RunningCampaign = {
  id: number; name: string; description: string | null; startsOn: string; endsOn: string | null;
  earnMode: EarnMode; starsPerUnit: number; amountStep: number | null; minOrderAmount: number | null; categories: string[] | null;
  maxPerOrder: number | null; maxPerDay: number | null; carryOver: boolean;
};
export type BirthdayWindow = "day" | "week" | "month";
export type BirthdayCampaign = { id: number; name: string; description: string | null; window: BirthdayWindow };

export type LoyaltyRewardRule = {
  id: number; campaignId: number; kind: "seasonal" | "birthday"; name: string; starsCost: number;
  rewardType: "free_item" | "discount";
  // Free item: which items it covers. Discount: which items it applies to (category or product).
  productId: number | null; category: string | null; maxPrice: number | null;
  discountKind: "percent" | "fixed" | null; discountValue: number | null; maxDiscount: number | null; minOrderAmount: number | null;
};

const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));

export async function runningCampaign(db: Db = pool): Promise<RunningCampaign | null> {
  const result = await db.query(`
    SELECT campaign_id, name, description, TO_CHAR(starts_on, 'YYYY-MM-DD') AS starts_on, TO_CHAR(ends_on, 'YYYY-MM-DD') AS ends_on,
      earn_mode, stars_per_unit, amount_step, min_order_amount, eligible_categories, max_stars_per_order, max_stars_per_day, carry_over
    FROM loyalty_campaigns
    WHERE kind = 'seasonal' AND is_active AND starts_on <= ${TODAY} AND (ends_on IS NULL OR ends_on >= ${TODAY})
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
    earnMode: row.earn_mode === "per_amount" ? "per_amount" : row.earn_mode === "per_order" ? "per_order" : "per_item",
    starsPerUnit: Number(row.stars_per_unit),
    amountStep: num(row.amount_step),
    minOrderAmount: num(row.min_order_amount),
    categories: Array.isArray(row.eligible_categories) && row.eligible_categories.length > 0 ? row.eligible_categories.map(String) : null,
    maxPerOrder: num(row.max_stars_per_order),
    maxPerDay: num(row.max_stars_per_day),
    carryOver: Boolean(row.carry_over),
  };
}

export async function activeBirthdayCampaign(db: Db = pool): Promise<BirthdayCampaign | null> {
  const result = await db.query("SELECT campaign_id, name, description, birthday_window FROM loyalty_campaigns WHERE kind = 'birthday' AND is_active LIMIT 1");
  const row = result.rows[0];
  if (!row) return null;
  const window = row.birthday_window === "day" || row.birthday_window === "month" ? row.birthday_window : "week";
  return { id: Number(row.campaign_id), name: String(row.name), description: (row.description as string | null) ?? null, window };
}

export async function starBalance(customerId: number, campaignId: number, db: Db = pool): Promise<number> {
  const result = await db.query("SELECT COALESCE(SUM(stars), 0)::int AS balance FROM loyalty_star_entries WHERE customer_id = $1 AND campaign_id = $2", [customerId, campaignId]);
  return Number(result.rows[0].balance);
}

// ── Earning ──────────────────────────────────────────────────────────────────────────────────────

// Stars an order earns under the campaign's rules, before the daily limit. Free reward lines do
// not count, and for per-amount earning the order's discount is taken off first.
async function starsForOrder(client: PoolClient, orderId: number, campaign: RunningCampaign): Promise<number> {
  const [lines, order] = await Promise.all([
    client.query(`
      SELECT soi.quantity, COALESCE(p.product_category, '') AS category,
        soi.unit_price * soi.quantity + COALESCE((SELECT SUM(a.unit_price * a.quantity) FROM sales_order_item_additions a WHERE a.order_item_id = soi.order_item_id), 0) AS amount
      FROM sales_order_items soi JOIN products p ON p.product_id = soi.product_id
      WHERE soi.order_id = $1 AND soi.reward_id IS NULL
    `, [orderId]),
    client.query("SELECT COALESCE(discount_amount, 0) AS discount FROM sales_orders WHERE order_id = $1", [orderId]),
  ]);
  const counted = lines.rows.filter((line) => !campaign.categories || campaign.categories.includes(String(line.category)));
  const amount = Math.max(0, counted.reduce((sum, line) => sum + Number(line.amount), 0) - Number(order.rows[0]?.discount ?? 0));
  let stars: number;
  if (campaign.earnMode === "per_order") {
    stars = counted.length > 0 && amount >= (campaign.minOrderAmount ?? 0) ? campaign.starsPerUnit : 0;
  } else if (campaign.earnMode === "per_amount") {
    stars = Math.floor(amount / (campaign.amountStep ?? Number.POSITIVE_INFINITY) + 1e-9) * campaign.starsPerUnit;
  } else {
    stars = counted.reduce((sum, line) => sum + Number(line.quantity), 0) * campaign.starsPerUnit;
  }
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
// returns the stars spent on its rewards, and gives the customer their birthday treat back.
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
    await client.query("UPDATE loyalty_birthday_claims SET status = 'returned', returned_at = CURRENT_TIMESTAMP WHERE order_id = $1 AND status = 'used'", [orderId]);
    await client.query("RELEASE SAVEPOINT loyalty_reverse");
    return result.rowCount ? -Number(result.rows[0].stars) : 0;
  } catch (error) {
    await client.query("ROLLBACK TO SAVEPOINT loyalty_reverse").catch(() => undefined);
    console.error(`Loyalty: could not take back stars for order ${orderId}:`, error);
    return 0;
  }
}

// ── Rewards ──────────────────────────────────────────────────────────────────────────────────────

export async function runningRewards(campaignId: number, db: Db = pool): Promise<LoyaltyRewardRule[]> {
  const result = await db.query(`
    SELECT r.reward_id, r.campaign_id, c.kind, r.name, r.stars_cost, r.reward_type, r.product_id, r.category, r.max_price,
      r.discount_kind, r.discount_value, r.max_discount, r.min_order_amount
    FROM loyalty_rewards r JOIN loyalty_campaigns c ON c.campaign_id = r.campaign_id
    WHERE r.campaign_id = $1 AND r.is_active
    ORDER BY r.stars_cost, r.sort_order, r.reward_id
  `, [campaignId]);
  return result.rows.map((row) => ({
    id: Number(row.reward_id),
    campaignId: Number(row.campaign_id),
    kind: row.kind === "birthday" ? "birthday" : "seasonal",
    name: String(row.name),
    starsCost: Number(row.stars_cost),
    rewardType: row.reward_type === "discount" ? "discount" : "free_item",
    productId: num(row.product_id),
    category: (row.category as string | null) ?? null,
    maxPrice: num(row.max_price),
    discountKind: row.discount_kind === "fixed" ? "fixed" : row.discount_kind === "percent" ? "percent" : null,
    discountValue: num(row.discount_value),
    maxDiscount: num(row.max_discount),
    minOrderAmount: num(row.min_order_amount),
  }));
}

// Why an item cannot be taken as a free-item reward, or null when it can.
export function rewardMismatch(reward: LoyaltyRewardRule, item: { productId: number; category: string | null; price: number; name: string }): string | null {
  if (reward.rewardType !== "free_item") return `"${reward.name}" is a discount, not a free item.`;
  if (reward.productId !== null && reward.productId !== item.productId) return `"${reward.name}" is for a different product than ${item.name}.`;
  if (reward.productId === null && reward.category && reward.category !== (item.category ?? "")) return `"${reward.name}" is only for ${reward.category} items.`;
  if (reward.maxPrice !== null && item.price > reward.maxPrice + 0.005) return `"${reward.name}" covers items up to ₱${reward.maxPrice.toFixed(2)}. ${item.name} costs ₱${item.price.toFixed(2)}.`;
  return null;
}

// The discount a reward gives on an order. lines: the paid lines (not free reward items), each
// with its amount including add-ons. Throws when the order does not qualify.
export function computeDiscount(reward: LoyaltyRewardRule, lines: { productId: number; category: string | null; amount: number }[], subtotal: number): number {
  if (reward.rewardType !== "discount" || !reward.discountKind || !reward.discountValue) throw new Error(`"${reward.name}" is not a discount.`);
  if (reward.minOrderAmount !== null && subtotal + 0.005 < reward.minOrderAmount) throw new Error(`"${reward.name}" needs an order of at least ₱${reward.minOrderAmount.toFixed(2)}.`);
  const eligible = lines.filter((line) => (reward.productId === null || line.productId === reward.productId) && (reward.productId !== null || !reward.category || (line.category ?? "") === reward.category))
    .reduce((sum, line) => sum + line.amount, 0);
  if (eligible <= 0) throw new Error(`"${reward.name}" only applies to ${reward.category ? `${reward.category} items` : "a product"} that is not in this order.`);
  let amount = reward.discountKind === "percent" ? eligible * reward.discountValue / 100 : reward.discountValue;
  if (reward.maxDiscount !== null) amount = Math.min(amount, reward.maxDiscount);
  return Math.round(Math.min(amount, eligible) * 100) / 100;
}

// "10% off (up to ₱50)" / "₱30 off Pastries".
export function discountText(reward: Pick<LoyaltyRewardRule, "discountKind" | "discountValue" | "maxDiscount" | "category">): string {
  if (!reward.discountKind || !reward.discountValue) return "";
  const off = reward.discountKind === "percent" ? `${reward.discountValue}% off` : `₱${reward.discountValue.toFixed(2)} off`;
  return `${off}${reward.category ? ` ${reward.category}` : ""}${reward.discountKind === "percent" && reward.maxDiscount ? ` (up to ₱${reward.maxDiscount.toFixed(2)})` : ""}`;
}

// ── Birthdays ────────────────────────────────────────────────────────────────────────────────────

export function manilaToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

// Whether today is within the window around the birthday, and which year's treat it is (a
// birthday on 31 December seen on 2 January belongs to the year before).
export function birthdayMatch(birthday: string, window: BirthdayWindow, today: string): { eligible: boolean; claimYear: number } {
  const [ty, tm, td] = today.split("-").map(Number);
  const [, bm, bd] = birthday.split("-").map(Number);
  if (window === "month") return { eligible: bm === tm, claimYear: ty };
  const todayTime = Date.UTC(ty, tm - 1, td);
  for (const year of [ty - 1, ty, ty + 1]) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    const day = bm === 2 && bd === 29 && !leap ? 28 : bd;
    const distance = Math.abs(Date.UTC(year, bm - 1, day) - todayTime) / 86_400_000;
    if (distance <= (window === "day" ? 0 : 3)) return { eligible: true, claimYear: year };
  }
  return { eligible: false, claimYear: ty };
}

export type BirthdayStatus = {
  campaign: BirthdayCampaign; rewards: LoyaltyRewardRule[];
  hasBirthday: boolean; eligible: boolean; claimed: boolean; claimYear: number;
};

// The birthday campaign as this customer sees it right now (null when none is switched on).
export async function birthdayStatus(customerId: number, db: Db = pool): Promise<BirthdayStatus | null> {
  const campaign = await activeBirthdayCampaign(db);
  if (!campaign) return null;
  const customer = await db.query("SELECT TO_CHAR(birthday, 'YYYY-MM-DD') AS birthday FROM customers WHERE customer_id = $1", [customerId]);
  const birthday = (customer.rows[0]?.birthday as string | null) ?? null;
  const match = birthday ? birthdayMatch(birthday, campaign.window, manilaToday()) : { eligible: false, claimYear: Number(manilaToday().slice(0, 4)) };
  const [rewards, claimed] = await Promise.all([
    runningRewards(campaign.id, db),
    db.query("SELECT 1 FROM loyalty_birthday_claims WHERE customer_id = $1 AND claim_year = $2 AND status = 'used'", [customerId, match.claimYear]),
  ]);
  return { campaign, rewards, hasBirthday: Boolean(birthday), eligible: match.eligible, claimed: Boolean(claimed.rowCount), claimYear: match.claimYear };
}

// ── Using rewards in an order ────────────────────────────────────────────────────────────────────

export type RewardLine = { rewardId: number; productId: number; category: string | null; price: number; name: string };
export type RewardPlan = {
  rewards: Map<number, LoyaltyRewardRule>;
  freeLines: RewardLine[];
  discount: LoyaltyRewardRule | null;
  seasonalCampaignId: number | null;
  starsCost: number;
  birthday: { campaignId: number; rewardId: number; claimYear: number } | null;
};

// Checks the rewards of an order: each belongs to a campaign that is on, free items are covered,
// at most one discount and one birthday treat, the birthday is within its window and not yet
// used this year, and the customer has enough stars. The customer row is locked until the
// order's transaction ends, so the same stars or treat cannot be used twice at the same time.
export async function planRewards(client: PoolClient, customerId: number, freeLines: RewardLine[], discountRewardId: number | null): Promise<RewardPlan> {
  const locked = await client.query("SELECT full_name FROM customers WHERE customer_id = $1 AND is_active = TRUE AND deleted_at IS NULL FOR UPDATE", [customerId]);
  if (locked.rowCount === 0) throw new Error("That customer can no longer use rewards.");
  const firstName = String(locked.rows[0].full_name).split(" ")[0];
  const [seasonal, birthday] = await Promise.all([runningCampaign(client), birthdayStatus(customerId, client)]);
  const rewards = new Map<number, LoyaltyRewardRule>();
  if (seasonal) (await runningRewards(seasonal.id, client)).forEach((reward) => rewards.set(reward.id, reward));
  birthday?.rewards.forEach((reward) => rewards.set(reward.id, reward));

  const used: LoyaltyRewardRule[] = [];
  for (const line of freeLines) {
    const reward = rewards.get(line.rewardId);
    if (!reward) throw new Error("That reward is no longer available.");
    const mismatch = rewardMismatch(reward, line);
    if (mismatch) throw new Error(mismatch);
    used.push(reward);
  }
  let discount: LoyaltyRewardRule | null = null;
  if (discountRewardId !== null) {
    discount = rewards.get(discountRewardId) ?? null;
    if (!discount || discount.rewardType !== "discount") throw new Error("That discount is no longer available.");
    used.push(discount);
  }
  const birthdayUsed = used.filter((reward) => reward.kind === "birthday");
  if (birthdayUsed.length > 1) throw new Error("Only one birthday treat per order.");
  if (birthdayUsed.length === 1) {
    if (!birthday?.hasBirthday) throw new Error(`${firstName} has no birthday on their profile.`);
    if (!birthday.eligible) throw new Error(`It is not ${firstName}'s birthday ${birthday.campaign.window === "day" ? "today" : birthday.campaign.window === "week" ? "week" : "month"}.`);
    if (birthday.claimed) throw new Error(`${firstName} already got their birthday treat this year.`);
  }
  const starsCost = used.filter((reward) => reward.kind === "seasonal").reduce((sum, reward) => sum + reward.starsCost, 0);
  if (starsCost > 0) {
    if (!seasonal) throw new Error("No loyalty campaign is running, so star rewards cannot be claimed right now.");
    const balance = await starBalance(customerId, seasonal.id, client);
    if (balance < starsCost) throw new Error(`Not enough stars: ${firstName} has ${balance} and the rewards need ${starsCost}.`);
  }
  return {
    rewards, freeLines, discount, starsCost,
    seasonalCampaignId: seasonal?.id ?? null,
    birthday: birthdayUsed.length === 1 && birthday ? { campaignId: birthday.campaign.id, rewardId: birthdayUsed[0].id, claimYear: birthday.claimYear } : null,
  };
}

// Records what the rewards of a placed order used: stars spent, and the birthday treat.
// Returns the stars spent.
export async function recordRewardUse(client: PoolClient, orderId: number, customerId: number, plan: RewardPlan): Promise<number> {
  let spent = 0;
  const entries: { reward: LoyaltyRewardRule; label: string }[] = [
    ...plan.freeLines.map((line) => ({ reward: plan.rewards.get(line.rewardId) as LoyaltyRewardRule, label: line.name })),
    ...(plan.discount ? [{ reward: plan.discount, label: "discount" }] : []),
  ];
  for (const { reward, label } of entries) {
    if (reward.kind !== "seasonal" || reward.starsCost <= 0 || plan.seasonalCampaignId === null) continue;
    await client.query(`
      INSERT INTO loyalty_star_entries (customer_id, campaign_id, kind, stars, order_id, reward_id, reason)
      VALUES ($1, $2, 'redeemed', $3, $4, $5, $6)
    `, [customerId, plan.seasonalCampaignId, -reward.starsCost, orderId, reward.id, `${reward.name}: ${label}`]);
    spent += reward.starsCost;
  }
  if (plan.birthday) {
    await client.query(`
      INSERT INTO loyalty_birthday_claims (customer_id, campaign_id, reward_id, order_id, claim_year)
      VALUES ($1, $2, $3, $4, $5)
    `, [customerId, plan.birthday.campaignId, plan.birthday.rewardId, orderId, plan.birthday.claimYear]);
  }
  return spent;
}

// ── What a customer sees ─────────────────────────────────────────────────────────────────────────

export type CustomerLoyalty = {
  campaign: RunningCampaign | null;
  balance: number;
  rewards: LoyaltyRewardRule[];
  birthday: BirthdayStatus | null;
};

// The running seasonal campaign with their stars and its rewards, and the birthday campaign.
// Null when neither is on.
export async function customerLoyalty(customerId: number, db: Db = pool): Promise<CustomerLoyalty | null> {
  const [campaign, birthday] = await Promise.all([runningCampaign(db), birthdayStatus(customerId, db)]);
  if (!campaign && !birthday) return null;
  const [balance, rewards] = campaign ? await Promise.all([starBalance(customerId, campaign.id, db), runningRewards(campaign.id, db)]) : [0, []];
  return { campaign, balance, rewards, birthday };
}
