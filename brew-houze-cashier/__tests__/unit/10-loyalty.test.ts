import { vi } from "vitest";
import { unitCases } from "./harness";
import { fakeDb } from "./fake-db";
import { latte, order, orderDb } from "./order-fixture";
import { awardOrderStarsSafely, planRewards, recordRewardUse, reverseOrderStarsSafely, rewardMismatch, type LoyaltyRewardRule } from "@/lib/loyalty";

vi.mock("@/lib/db", () => import("./fake-db").then((m) => m.poolModule));
vi.mock("@/lib/realtime", () => ({ signalChange: vi.fn() }));

// Objective 10. Loyalty (Brew Stars). The admin sets each campaign's rules; these tests use the
// rules of the brief: 1 star per order, at most 5 stars a day, and a free drink for 10 stars.
const CAMPAIGN = { campaign_id: 3, name: "Brew Stars", description: null, starts_on: "2026-10-01", ends_on: null, earn_mode: "per_order", stars_per_unit: 1,
  amount_step: null, min_order_amount: null, eligible_categories: null, max_stars_per_order: 1, max_stars_per_day: 5, carry_over: false };
const FREE_DRINK = { reward_id: 21, campaign_id: 3, kind: "seasonal", name: "Free Drink", stars_cost: 10, reward_type: "free_item", product_id: null, category: "Coffee",
  max_price: "150.00", discount_kind: null, discount_value: null, max_discount: null, min_order_amount: null };

// Earning: the order's lines (free reward lines are left out by the query), its discount, and
// the stars the customer already earned today.
function earnDb(options: { campaign?: Record<string, unknown> | null; lines?: Record<string, unknown>[]; discount?: number; earnedToday?: number; failing?: boolean } = {}) {
  return fakeDb([
    [/FROM loyalty_campaigns WHERE kind = 'seasonal'/, () => { if (options.failing) throw new Error("connection lost"); return options.campaign === null ? [] : [{ ...CAMPAIGN, ...options.campaign }]; }],
    [/FROM sales_order_items soi JOIN products p/, options.lines ?? [{ quantity: 1, category: "Coffee", amount: "120.00" }]],
    [/AS discount FROM sales_orders/, [{ discount: options.discount ?? 0 }]],
    [/AS earned FROM loyalty_star_entries/, [{ earned: options.earnedToday ?? 0 }]],
    [/^INSERT INTO loyalty_star_entries .* VALUES \(\$1, \$2, 'earned'/, (params) => [{ stars: params[2] }]],
  ]);
}
// Redeeming: the customer (Juan Dela Cruz) and their balance in the running campaign.
function redeemDb(balance: number) {
  return fakeDb([
    [/FROM customers WHERE customer_id = \$1 AND is_active = TRUE AND deleted_at IS NULL FOR UPDATE/, [{ full_name: "Juan Dela Cruz" }]],
    [/FROM loyalty_campaigns WHERE kind = 'seasonal'/, [CAMPAIGN]],
    [/FROM loyalty_rewards r JOIN loyalty_campaigns c/, [FREE_DRINK]],
    [/AS balance FROM loyalty_star_entries/, [{ balance }]],
  ]);
}
const drink = { rewardId: 21, productId: 1, category: "Coffee", price: 120, name: "Spanish Latte" };
const reward: LoyaltyRewardRule = { id: 21, campaignId: 3, kind: "seasonal", name: "Free Drink", starsCost: 10, rewardType: "free_item", productId: null, category: "Coffee", maxPrice: 150,
  discountKind: null, discountValue: null, maxDiscount: null, minOrderAmount: null };

unitCases("cashier", "Objective 10 - Loyalty", [
  // Earning
  { id: "UT-LOY-01", fn: "awardOrderStarsSafely", kind: "Positive", title: "a completed order earns 1 star", input: "First order today, ₱120.00",
    expected: 1, run: () => awardOrderStarsSafely(earnDb().client, 900, 400) },
  { id: "UT-LOY-02", fn: "awardOrderStarsSafely", kind: "Positive", title: "one star per order however many items it has", input: "Order of 3 items (₱360.00)",
    expected: 1, run: () => awardOrderStarsSafely(earnDb({ lines: [{ quantity: 3, category: "Coffee", amount: "360.00" }] }).client, 900, 400) },
  { id: "UT-LOY-03", fn: "awardOrderStarsSafely", kind: "Boundary", title: "the fifth order of the day still earns its star", input: "4 stars already earned today",
    expected: 1, run: () => awardOrderStarsSafely(earnDb({ earnedToday: 4 }).client, 900, 400) },
  { id: "UT-LOY-04", fn: "awardOrderStarsSafely", kind: "Boundary", title: "the daily limit of 5 stops further stars that day", input: "5 stars already earned today",
    expected: { stars: 0, saved: 0 }, run: async () => { const db = earnDb({ earnedToday: 5 }); const stars = await awardOrderStarsSafely(db.client, 900, 400); return { stars, saved: db.ran(/'earned'/).filter((entry) => /^INSERT/.test(entry.sql)).length }; } },
  { id: "UT-LOY-05", fn: "awardOrderStarsSafely", kind: "Negative", title: "an order of only free reward items earns no star", input: "Order with only a free drink",
    expected: 0, run: () => awardOrderStarsSafely(earnDb({ lines: [] }).client, 900, 400) },
  { id: "UT-LOY-06", fn: "awardOrderStarsSafely", kind: "Negative", title: "no stars when no campaign is running", input: "No campaign on today",
    expected: 0, run: () => awardOrderStarsSafely(earnDb({ campaign: null }).client, 900, 400) },
  { id: "UT-LOY-07", fn: "awardOrderStarsSafely", kind: "Positive", title: "per-amount campaigns count what was paid after the discount", input: "1 star per ₱50.00, ₱260.00 order with ₱20.00 discount",
    expected: 4, expectedText: "4 stars (₱240.00 ÷ ₱50.00)", run: () => awardOrderStarsSafely(earnDb({ campaign: { earn_mode: "per_amount", amount_step: "50", max_stars_per_order: null }, lines: [{ quantity: 2, category: "Coffee", amount: "260.00" }], discount: 20 }).client, 900, 400) },
  { id: "UT-LOY-08", fn: "awardOrderStarsSafely", kind: "Negative", title: "a loyalty error never blocks the sale: no stars, rolled back to the savepoint", input: "Database error while awarding",
    expected: { stars: 0, rolledBack: true }, run: async () => { const db = earnDb({ failing: true }); const spy = vi.spyOn(console, "error").mockImplementation(() => undefined); const stars = await awardOrderStarsSafely(db.client, 900, 400); spy.mockRestore(); return { stars, rolledBack: db.ran(/^ROLLBACK TO SAVEPOINT loyalty_award/).length === 1 }; } },
  { id: "UT-LOY-09", fn: "reverseOrderStarsSafely", kind: "Positive", title: "voiding an order takes back the star it earned", input: "Order #900 earned 1 star, then voided",
    expected: 1, run: () => reverseOrderStarsSafely(fakeDb([[/'reversed'/, [{ stars: -1 }]]]).client, 900, 1) },
  // Redeeming
  { id: "UT-LOY-10", fn: "planRewards", kind: "Boundary", title: "exactly 10 stars redeem the free drink", input: "Balance 10 stars, 1 Free Drink (10 stars)",
    expected: 10, run: async () => (await planRewards(redeemDb(10).client, 400, [drink], null)).starsCost },
  { id: "UT-LOY-11", fn: "planRewards", kind: "Negative", title: "9 stars are not enough for the free drink", input: "Balance 9 stars",
    expected: { error: "Not enough stars: Juan has 9 and the rewards need 10." }, run: () => planRewards(redeemDb(9).client, 400, [drink], null) },
  { id: "UT-LOY-12", fn: "planRewards", kind: "Negative", title: "two free drinks need 20 stars", input: "Balance 15 stars, 2 Free Drinks",
    expected: { error: "Not enough stars: Juan has 15 and the rewards need 20." }, run: () => planRewards(redeemDb(15).client, 400, [drink, drink], null) },
  { id: "UT-LOY-13", fn: "rewardMismatch", kind: "Negative", title: "the free drink covers drinks up to its price limit only", input: "Free Drink (up to ₱150.00) on a ₱180.00 Caramel Macchiato",
    expected: "\"Free Drink\" covers items up to ₱150.00. Caramel Macchiato costs ₱180.00.", run: () => rewardMismatch(reward, { productId: 4, category: "Coffee", price: 180, name: "Caramel Macchiato" }) },
  { id: "UT-LOY-14", fn: "recordRewardUse", kind: "Positive", title: "redeeming takes the 10 stars off the balance (a −10 entry)", input: "Order #901 with 1 Free Drink",
    expected: { spent: 10, entry: -10 }, run: async () => { const db = redeemDb(10); const plan = await planRewards(db.client, 400, [drink], null); const spent = await recordRewardUse(db.client, 901, 400, plan); return { spent, entry: db.ran(/'redeemed'/)[0]?.params[2] }; } },
  { id: "UT-LOY-15", fn: "placeOrder", kind: "Negative", title: "a reward is only given after the customer confirms it", input: "Free Drink line, customer #400 not confirmed",
    expected: { error: "The customer has to confirm the reward first (scan the Stars sign, or the cashier confirms with their password)." },
    run: () => order(orderDb().db, { customerId: 400, items: [latte({ rewardId: 21 })] }) },
]);
