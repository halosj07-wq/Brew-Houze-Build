import type { PoolClient } from "pg";
import { awardOrderStarsSafely, computeDiscount, discountText, planRewards, recordRewardUse, type RewardLine, type RewardPlan } from "@/lib/loyalty";

// Creating a sales order, shared by the cashier checkout, the mobile menu and GCash payments
// (brew-houze-cashier and brew-houze-mobile keep identical copies of this file). Everything runs
// on the caller's transaction: the caller BEGINs and COMMITs (or ROLLs BACK for a price check).

// rewardId: the line is a loyalty reward (one item, priced at 0, paid for with stars or a
// birthday treat).
export type OrderItemInput = { productVariantId: number; quantity: number; additionIds: number[]; rewardId?: number | null };
export type OrderSource = "cashier" | "mobile";
// Eaten at the café or taken away (null: not recorded, for callers that do not ask).
export type ServiceType = "dine_in" | "take_out";
export function parseServiceType(value: unknown): ServiceType | null {
  return value === "dine_in" || value === "take_out" ? value : null;
}
export type PlaceOrderInput = {
  items: OrderItemInput[];
  source: OrderSource;
  cashierAdminId: number | null;
  // split: part cash (cashAmount, paid with receivedAmount) and the rest through GCash.
  paymentMethod: "cash" | "online" | "split";
  receivedAmount?: number;
  cashAmount?: number;
  customerToken?: string | null;
  // The customer account the order belongs to (a signed-in mobile customer, or one the counter
  // attached), so their purchases and stars follow them.
  customerId?: number | null;
  // Reward lines are only accepted when the caller has confirmed the customer (their signed-in
  // phone on the mobile menu, an accepted claim from the Stars sign, or the cashier's password).
  rewardsAuthorized?: boolean;
  // A discount reward on the whole order (at most one).
  discountRewardId?: number | null;
  serviceType?: ServiceType | null;
  paymentReference?: string | null;
  paymentProvider?: string | null;
};
// starsEarned: loyalty stars the linked customer got for this order (0 without a customer or campaign).
// starsRedeemed: stars spent on rewards in this order. total is what the customer pays, after
// discountAmount is taken off subtotal.
export type PlacedOrder = { orderId: number; queueNumber: number; shiftId: number; subtotal: number; discountAmount: number; total: number; receivedAmount: number; changeAmount: number; createdAt: string; starsEarned: number; starsRedeemed: number };

// Cost of one unit of inventory item `i` (joined with its source as `src`). A bound item costs
// what it draws from its source, which is the stock actually deducted at checkout.
const effectiveUnitCostSql = "CASE WHEN i.derived_from_inventory_id IS NOT NULL THEN src.unit_cost * i.derived_ratio ELSE i.unit_cost END";

// Reads cart lines from a request body: [{ product_variant_id, quantity, addition_ids }].
// An addition id may repeat within one line (a Double Shot added twice to the same cup).
export function parseOrderItems(value: unknown): OrderItemInput[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const item = raw as { product_variant_id?: unknown; quantity?: unknown; addition_ids?: unknown; reward_id?: unknown };
    const rewardId = Number(item.reward_id);
    return {
      productVariantId: Number(item.product_variant_id),
      quantity: Number(item.quantity),
      additionIds: Array.isArray(item.addition_ids) ? item.addition_ids.map(Number).filter((id) => Number.isInteger(id) && id > 0) : [],
      rewardId: Number.isInteger(rewardId) && rewardId > 0 ? rewardId : null,
    };
  }).filter((item) => Number.isInteger(item.productVariantId) && item.productVariantId > 0 && Number.isInteger(item.quantity) && item.quantity > 0 && item.quantity <= 500 && (!item.rewardId || item.quantity === 1));
}

// Redirects any bound (derived) inventory item's deduction onto its source item, scaled by
// its ratio, so bound items (which never carry their own stock) never fail the stock check.
async function resolveBoundDeductions(client: PoolClient, deductions: Map<number, number>) {
  for (let depth = 0; depth < 10; depth++) {
    const ids = Array.from(deductions.keys());
    if (ids.length === 0) break;
    const bindings = await client.query(
      "SELECT inventory_id, derived_from_inventory_id, derived_ratio FROM inventory WHERE inventory_id = ANY($1::int[]) AND derived_from_inventory_id IS NOT NULL",
      [ids]
    );
    if (bindings.rowCount === 0) break;
    for (const row of bindings.rows) {
      const inventoryId = Number(row.inventory_id);
      const parentId = Number(row.derived_from_inventory_id);
      const ratio = Number(row.derived_ratio);
      const boundQuantity = deductions.get(inventoryId) ?? 0;
      deductions.delete(inventoryId);
      deductions.set(parentId, (deductions.get(parentId) ?? 0) + boundQuantity * ratio);
    }
  }
}

export async function placeOrder(client: PoolClient, input: PlaceOrderInput): Promise<PlacedOrder> {
  if (input.items.length === 0) throw new Error("At least one valid cart item is required.");

  const quantities = new Map<number, number>();
  // Lines with the same variant and the same add-on counts are merged into one sales line.
  const groupedItems = new Map<string, { productVariantId: number; quantity: number; additionIds: number[]; additionCounts: Map<number, number>; rewardId: number | null; additionAmount: number }>();
  for (const item of input.items) {
    quantities.set(item.productVariantId, (quantities.get(item.productVariantId) ?? 0) + item.quantity);
    const additionCounts = new Map<number, number>();
    for (const additionId of item.additionIds) additionCounts.set(additionId, (additionCounts.get(additionId) ?? 0) + 1);
    const additionIds = Array.from(additionCounts.keys()).sort((a, b) => a - b);
    // A reward is always its own line (one item each), never merged with paid items.
    const groupKey = item.rewardId ? `reward:${groupedItems.size}` : `${item.productVariantId}:${additionIds.map((id) => `${id}x${additionCounts.get(id)}`).join(",")}`;
    const current = groupedItems.get(groupKey);
    groupedItems.set(groupKey, current
      ? { ...current, quantity: current.quantity + item.quantity }
      : { productVariantId: item.productVariantId, quantity: item.quantity, additionIds, additionCounts, rewardId: item.rewardId ?? null, additionAmount: 0 });
  }

  // Sales belong to the open shift. The share lock keeps the shift from being closed while
  // this order is still being saved.
  const shiftResult = await client.query("SELECT shift_id FROM shifts WHERE closed_at IS NULL FOR SHARE");
  if (shiftResult.rowCount === 0) {
    throw new Error(input.source === "mobile" ? "Brew Houze isn't taking orders right now. Please order again once the café is open." : "No shift is open. Open a shift before taking orders.");
  }
  const shiftId = Number(shiftResult.rows[0].shift_id);

  const variantIds = Array.from(quantities.keys());
  const variants = await client.query(`
    SELECT pv.product_variant_id, pv.product_id, pv.price, p.product_name, p.product_type, p.product_category
    FROM product_variants pv
    JOIN products p ON p.product_id = pv.product_id
    WHERE pv.product_variant_id = ANY($1::int[])
      AND pv.is_archived = FALSE AND p.is_archived = FALSE
    ORDER BY pv.product_variant_id
    FOR UPDATE OF pv
  `, [variantIds]);
  if (variants.rowCount !== variantIds.length) throw new Error("One or more selected products are no longer available.");

  // Loyalty rewards: checked (and the customer's stars locked) before anything is deducted.
  const variantById = new Map(variants.rows.map((variant) => [Number(variant.product_variant_id), variant]));
  const rewardLines: RewardLine[] = Array.from(groupedItems.values()).filter((group) => group.rewardId !== null).map((group) => {
    const variant = variantById.get(group.productVariantId);
    return { rewardId: Number(group.rewardId), productId: Number(variant?.product_id), category: (variant?.product_category as string | null) ?? null, price: Number(variant?.price ?? 0), name: String(variant?.product_name ?? "item") };
  });
  const discountRewardId = input.discountRewardId ?? null;
  let rewardPlan: RewardPlan | null = null;
  if (rewardLines.length > 0 || discountRewardId !== null) {
    if (!input.customerId) throw new Error("Attach the customer before using a reward.");
    if (!input.rewardsAuthorized) throw new Error("The customer has to confirm the reward first (scan the Stars sign, or the cashier confirms with their password).");
    rewardPlan = await planRewards(client, input.customerId, rewardLines, discountRewardId);
  }

  // Cost snapshot per variant: NULL when any component has no cost entered yet.
  const variantCostResult = await client.query(`
    SELECT vi.product_variant_id,
      CASE WHEN bool_and((${effectiveUnitCostSql}) IS NOT NULL) THEN SUM(vi.required_quantity * (${effectiveUnitCostSql})) END AS unit_cost
    FROM variant_ingredients vi
    JOIN inventory i ON i.inventory_id = vi.inventory_id
    LEFT JOIN inventory src ON src.inventory_id = i.derived_from_inventory_id
    WHERE vi.product_variant_id = ANY($1::int[])
    GROUP BY vi.product_variant_id
  `, [variantIds]);
  const variantCosts = new Map<number, number | null>(variantCostResult.rows.map((row) => [Number(row.product_variant_id), row.unit_cost === null ? null : Number(row.unit_cost)]));

  const deductions = new Map<number, number>();
  let additionTotal = 0;
  for (const variant of variants.rows) {
    const ingredientRows = await client.query("SELECT vi.inventory_id, vi.required_quantity FROM variant_ingredients vi WHERE vi.product_variant_id = $1", [variant.product_variant_id]);
    if (ingredientRows.rowCount === 0) throw new Error(`${variant.product_name} has no configured ingredients.`);
    const orderedQuantity = quantities.get(Number(variant.product_variant_id)) ?? 0;
    for (const ingredient of ingredientRows.rows) {
      const inventoryId = Number(ingredient.inventory_id);
      deductions.set(inventoryId, (deductions.get(inventoryId) ?? 0) + Number(ingredient.required_quantity) * orderedQuantity);
    }
    for (const group of Array.from(groupedItems.values()).filter((item) => item.productVariantId === Number(variant.product_variant_id))) {
      if (group.additionIds.length === 0) continue;
      if (variant.product_type === "stock") throw new Error(`${variant.product_name} does not take additions.`);
      const additionsResult = await client.query(`
        SELECT a.addition_id, a.inventory_id, a.quantity, a.price
        FROM additions a
        WHERE a.is_active = TRUE AND a.addition_id = ANY($1::int[])
        FOR SHARE OF a
      `, [group.additionIds]);
      if (additionsResult.rowCount !== group.additionIds.length) throw new Error(`${variant.product_name} has an invalid addition selection.`);
      for (const addition of additionsResult.rows) {
        const servings = (group.additionCounts.get(Number(addition.addition_id)) ?? 1) * group.quantity;
        additionTotal += Number(addition.price) * servings;
        group.additionAmount += Number(addition.price) * servings;
        const inventoryId = Number(addition.inventory_id);
        deductions.set(inventoryId, (deductions.get(inventoryId) ?? 0) + Number(addition.quantity) * servings);
      }
    }
  }

  await resolveBoundDeductions(client, deductions);

  const deductionDetails = new Map<number, { itemName: string; category: string; unit: string; quantityBefore: number; quantityAfter: number }>();
  // Each guarded UPDATE locks its row; applying them in id order means two concurrent
  // orders sharing inventory always lock in the same sequence and cannot deadlock.
  for (const [inventoryId, deduction] of Array.from(deductions).sort(([a], [b]) => a - b)) {
    const result = await client.query(`
      UPDATE inventory
      SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP
      WHERE inventory_id = $2 AND quantity >= $1
      RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity
    `, [deduction, inventoryId]);
    if (result.rowCount !== 1) {
      const item = await client.query("SELECT item_name FROM inventory WHERE inventory_id = $1", [inventoryId]);
      throw new Error(`Insufficient stock for ${item.rows[0]?.item_name ?? "an ingredient"}.`);
    }
    const row = result.rows[0];
    deductionDetails.set(inventoryId, { itemName: row.item_name, category: row.ingredient_category, unit: row.unit_of_measure, quantityAfter: Number(row.quantity), quantityBefore: Number(row.quantity) + deduction });
  }

  // Queue numbers restart per shift; serialize assignment so two orders never share a number.
  await client.query("SELECT pg_advisory_xact_lock(hashtext('brew-houze-queue-shift-' || $1::text))", [shiftId]);
  const queueResult = await client.query("SELECT COALESCE(MAX(queue_number), 0) + 1 AS queue_number FROM sales_orders WHERE shift_id = $1", [shiftId]);
  const queueNumber = Number(queueResult.rows[0].queue_number);
  // Reward lines cost nothing (their add-ons are still charged). A discount comes off after.
  const subtotal = Math.round((Array.from(groupedItems.values()).reduce((sum, group) => sum + (group.rewardId ? 0 : Number(variantById.get(group.productVariantId)?.price ?? 0)) * group.quantity, 0) + additionTotal) * 100) / 100;
  const discount = rewardPlan?.discount ?? null;
  const discountAmount = discount ? computeDiscount(discount, Array.from(groupedItems.values()).filter((group) => !group.rewardId).map((group) => {
    const variant = variantById.get(group.productVariantId);
    return { productId: Number(variant?.product_id), category: (variant?.product_category as string | null) ?? null, amount: Number(variant?.price ?? 0) * group.quantity + group.additionAmount };
  }), subtotal) : 0;
  const total = Math.round((subtotal - discountAmount) * 100) / 100;

  let receivedAmount = total;
  let changeAmount = 0;
  let cashPortion: number | null = null;
  if (input.paymentMethod === "cash") {
    receivedAmount = Number(input.receivedAmount);
    if (!Number.isFinite(receivedAmount) || receivedAmount < total) throw new Error("Received payment must be at least the subtotal amount.");
    changeAmount = Number((receivedAmount - total).toFixed(2));
  }
  if (input.paymentMethod === "split") {
    cashPortion = Math.round(Number(input.cashAmount) * 100) / 100;
    if (!Number.isFinite(cashPortion) || cashPortion <= 0 || cashPortion >= total) throw new Error("The cash part must be more than ₱0 and less than the total.");
    receivedAmount = Number(input.receivedAmount);
    if (!Number.isFinite(receivedAmount) || receivedAmount < cashPortion) throw new Error("The cash received must cover the cash part.");
    changeAmount = Number((receivedAmount - cashPortion).toFixed(2));
  }

  const order = await client.query(`
    INSERT INTO sales_orders (cashier_admin_id, total_amount, status, queue_number, queue_status, order_source, customer_order_token, received_amount, change_amount, payment_method, shift_id, payment_reference, payment_provider, cash_portion, customer_id,
      subtotal_amount, discount_amount, discount_label, discount_source, discount_reward_id, service_type)
    VALUES ($1, $2, 'completed', $3, 'waiting', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
    RETURNING order_id, queue_number,
      TO_CHAR(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS created_at
  `, [input.cashierAdminId, total, queueNumber, input.source === "mobile" ? "online" : "cashier", input.customerToken ?? null, receivedAmount, changeAmount, input.paymentMethod, shiftId, input.paymentReference ?? null, input.paymentProvider ?? null, cashPortion, input.customerId ?? null,
    subtotal, discountAmount, discount ? `${discount.name} (${discountText(discount)})` : null, discount ? (discount.kind === "birthday" ? "birthday" : "reward") : null, discount?.id ?? null, input.serviceType ?? null]);
  const orderId = Number(order.rows[0].order_id);

  for (const [inventoryId, detail] of deductionDetails) {
    await client.query(`
      INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, order_id, admin_id, source_app)
      VALUES ($1, $2, $3, $4, 'order_deduction', $5, $6, $7, $8, $9, $10)
    `, [inventoryId, detail.itemName, detail.category, detail.unit, detail.quantityBefore, detail.quantityAfter, detail.quantityAfter - detail.quantityBefore, orderId, input.cashierAdminId, input.source]);
  }

  for (const variant of variants.rows) {
    for (const group of Array.from(groupedItems.values()).filter((item) => item.productVariantId === Number(variant.product_variant_id))) {
      const itemResult = await client.query(`
        INSERT INTO sales_order_items (order_id, product_id, product_variant_id, quantity, unit_price, unit_cost, reward_id, reward_value)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING order_item_id
      `, [orderId, variant.product_id, variant.product_variant_id, group.quantity, group.rewardId ? 0 : variant.price, variantCosts.get(Number(variant.product_variant_id)) ?? null, group.rewardId, group.rewardId ? variant.price : null]);
      for (const additionId of group.additionIds) {
        await client.query(`
          INSERT INTO sales_order_item_additions (order_item_id, addition_id, quantity, unit_price, unit_cost)
          SELECT $1, a.addition_id, $3, a.price, a.quantity * (${effectiveUnitCostSql})
          FROM additions a
          JOIN inventory i ON i.inventory_id = a.inventory_id
          LEFT JOIN inventory src ON src.inventory_id = i.derived_from_inventory_id
          WHERE a.addition_id = $2
        `, [itemResult.rows[0].order_item_id, additionId, (group.additionCounts.get(additionId) ?? 1) * group.quantity]);
      }
    }
  }

  const starsRedeemed = rewardPlan && input.customerId ? await recordRewardUse(client, orderId, input.customerId, rewardPlan) : 0;
  const starsEarned = input.customerId ? await awardOrderStarsSafely(client, orderId, input.customerId) : 0;
  return { orderId, queueNumber, shiftId, subtotal, discountAmount, total, receivedAmount, changeAmount, createdAt: order.rows[0].created_at, starsEarned, starsRedeemed };
}

// The exact total the order would have right now (prices, stock and the open shift all
// checked), without keeping anything: the whole order is built and then rolled back.
export async function quoteOrder(client: PoolClient, input: Omit<PlaceOrderInput, "paymentMethod" | "receivedAmount">): Promise<number> {
  await client.query("BEGIN");
  try {
    const placed = await placeOrder(client, { ...input, paymentMethod: "online" });
    return placed.total;
  } finally {
    await client.query("ROLLBACK");
  }
}
