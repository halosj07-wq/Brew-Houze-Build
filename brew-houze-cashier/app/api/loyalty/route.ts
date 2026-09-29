import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { activeBirthdayCampaign, runningCampaign, runningRewards, type LoyaltyRewardRule } from "@/lib/loyalty";
import { getSession } from "@/lib/sessions";

// What a reward covers on today's menu, so the counter can answer "which drinks can I get?":
// each item and the sizes that fit (a free item's price limit), or the item a discount is for.
type MenuOption = { productId: number; name: string; category: string | null; size: string | null; temperature: string | null; price: number };
type RewardCover = { name: string; options: string[] };

function covers(reward: LoyaltyRewardRule, menu: MenuOption[]): RewardCover[] {
  const fits = menu.filter((option) => (reward.productId !== null ? option.productId === reward.productId : !reward.category || option.category === reward.category)
    && (reward.rewardType !== "free_item" || reward.maxPrice === null || option.price <= reward.maxPrice + 0.005));
  const byProduct = new Map<string, string[]>();
  for (const option of fits) {
    const label = [option.size && option.size !== "Regular" ? option.size : "", option.temperature === "hot" ? "Hot" : option.temperature === "cold" ? "Iced" : ""].filter(Boolean).join(" ");
    byProduct.set(option.name, [...(byProduct.get(option.name) ?? []), `${label || "Regular"} ₱${option.price.toFixed(2)}`]);
  }
  return Array.from(byProduct, ([name, options]) => ({ name, options }));
}

// The campaigns running now, for the preview in the staff app's top bar (every staff role,
// including baristas): the seasonal campaign's rules and rewards, and the birthday treat.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  try {
    const [campaign, birthday] = await Promise.all([runningCampaign(), activeBirthdayCampaign()]);
    const [rewards, treats] = await Promise.all([campaign ? runningRewards(campaign.id) : [], birthday ? runningRewards(birthday.id) : []]);
    const menuRows = rewards.length + treats.length === 0 ? { rows: [] } : await pool.query(`
      SELECT p.product_id, p.product_name, p.product_category, pv.size_label, pv.temperature, pv.price
      FROM products p JOIN product_variants pv ON pv.product_id = p.product_id AND pv.is_archived = FALSE
      WHERE p.is_archived = FALSE
      ORDER BY p.product_category, p.product_name, pv.price, pv.product_variant_id
    `);
    const menu: MenuOption[] = menuRows.rows.map((row) => ({ productId: Number(row.product_id), name: String(row.product_name), category: (row.product_category as string | null) ?? null, size: (row.size_label as string | null) ?? null, temperature: (row.temperature as string | null) ?? null, price: Number(row.price) }));
    const withCovers = (list: LoyaltyRewardRule[]) => list.map((reward) => ({ ...reward, covers: covers(reward, menu) }));
    return NextResponse.json({ data: { campaign: campaign ? { ...campaign, rewards: withCovers(rewards) } : null, birthday: birthday ? { ...birthday, rewards: withCovers(treats) } : null } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/loyalty (staff) failed:", error);
    return NextResponse.json({ error: "Could not load the campaigns." }, { status: 500 });
  }
}
