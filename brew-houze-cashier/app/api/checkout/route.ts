import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { PoolClient } from "pg";
import pool from "@/lib/db";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

type CheckoutItem = { product_variant_id: number; quantity: number; addition_ids?: unknown };

// Cost of one unit of inventory item `i` (joined with its source as `src`). A bound item costs
// what it draws from its source, which is the stock actually deducted at checkout.
const effectiveUnitCostSql = "CASE WHEN i.derived_from_inventory_id IS NOT NULL THEN src.unit_cost * i.derived_ratio ELSE i.unit_cost END";

function parseAdditionIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.map((id: unknown) => Number(id)).filter((id: number) => Number.isInteger(id) && id > 0);
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

export async function POST(request: Request) {
  const session = verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const client = await pool.connect();
  try {
    const body = await request.json() as { items?: unknown; received_amount?: unknown; payment_method?: unknown };
    const paymentMethod = body.payment_method === "online" ? "online" : "cash";
    const items = Array.isArray(body.items)
      ? body.items.map((item) => ({
          productVariantId: Number((item as CheckoutItem).product_variant_id),
          quantity: Number((item as CheckoutItem).quantity),
          additionIds: parseAdditionIds((item as CheckoutItem).addition_ids),
        })).filter((item) => Number.isInteger(item.productVariantId) && item.productVariantId > 0 && Number.isInteger(item.quantity) && item.quantity > 0)
      : [];

    if (items.length === 0) return NextResponse.json({ error: "At least one valid cart item is required." }, { status: 400 });

    const quantities = new Map<number, number>();
    // An addition id may repeat within one item (Double Shot twice on the same cup), so each
    // group keeps a per-cup count per addition. Lines with the same variant and the same
    // add-on counts are merged into one sales line.
    const groupedItems = new Map<string, { productVariantId: number; quantity: number; additionIds: number[]; additionCounts: Map<number, number> }>();
    for (const item of items) {
      quantities.set(item.productVariantId, (quantities.get(item.productVariantId) ?? 0) + item.quantity);
      const additionCounts = new Map<number, number>();
      for (const additionId of item.additionIds) additionCounts.set(additionId, (additionCounts.get(additionId) ?? 0) + 1);
      const additionIds = Array.from(additionCounts.keys()).sort((a, b) => a - b);
      const groupKey = `${item.productVariantId}:${additionIds.map((id) => `${id}x${additionCounts.get(id)}`).join(",")}`;
      const current = groupedItems.get(groupKey);
      groupedItems.set(groupKey, current
        ? { ...current, quantity: current.quantity + item.quantity }
        : { productVariantId: item.productVariantId, quantity: item.quantity, additionIds, additionCounts });
    }

    await client.query("BEGIN");
    // Sales belong to the open shift. The share lock keeps the shift from being closed while
    // this order is still being saved.
    const shiftResult = await client.query("SELECT shift_id FROM shifts WHERE closed_at IS NULL FOR SHARE");
    if (shiftResult.rowCount === 0) throw new Error("No shift is open. Open a shift before taking orders.");
    const shiftId = Number(shiftResult.rows[0].shift_id);
    const variantIds = Array.from(quantities.keys());
    const variants = await client.query(`
      SELECT pv.product_variant_id, pv.product_id, pv.price, p.product_name, p.product_type, pv.size_label
      FROM product_variants pv
      JOIN products p ON p.product_id = pv.product_id
      WHERE pv.product_variant_id = ANY($1::int[])
        AND pv.is_archived = FALSE AND p.is_archived = FALSE
      ORDER BY pv.product_variant_id
      FOR UPDATE OF pv
    `, [variantIds]);

    if (variants.rowCount !== variantIds.length) throw new Error("One or more selected products are no longer available.");

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
      const ingredientRows = await client.query(`
        SELECT vi.inventory_id, vi.required_quantity
        FROM variant_ingredients vi
        WHERE vi.product_variant_id = $1
      `, [variant.product_variant_id]);
      if (ingredientRows.rowCount === 0) throw new Error(`${variant.product_name} has no configured ingredients.`);
      const orderedQuantity = quantities.get(Number(variant.product_variant_id)) ?? 0;
      for (const ingredient of ingredientRows.rows) {
        const inventoryId = Number(ingredient.inventory_id);
        const deduction = Number(ingredient.required_quantity) * orderedQuantity;
        deductions.set(inventoryId, (deductions.get(inventoryId) ?? 0) + deduction);
      }
      const variantGroups = Array.from(groupedItems.values()).filter((item) => item.productVariantId === Number(variant.product_variant_id));
      for (const group of variantGroups) {
        if (group.additionIds.length === 0) continue;
        if (variant.product_type === "stock") throw new Error(`${variant.product_name} does not take additions.`);
        const additionsResult = await client.query(`
          SELECT a.addition_id, a.addition_name, a.inventory_id, a.quantity, a.price
          FROM additions a
          WHERE a.is_active = TRUE AND a.addition_id = ANY($1::int[])
          FOR SHARE OF a
        `, [group.additionIds]);
        if (additionsResult.rowCount !== group.additionIds.length) throw new Error(`${variant.product_name} has an invalid addition selection.`);
        for (const addition of additionsResult.rows) {
          const servings = (group.additionCounts.get(Number(addition.addition_id)) ?? 1) * group.quantity;
          additionTotal += Number(addition.price) * servings;
          const inventoryId = Number(addition.inventory_id);
          const deduction = Number(addition.quantity) * servings;
          deductions.set(inventoryId, (deductions.get(inventoryId) ?? 0) + deduction);
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
      deductionDetails.set(inventoryId, {
        itemName: row.item_name,
        category: row.ingredient_category,
        unit: row.unit_of_measure,
        quantityAfter: Number(row.quantity),
        quantityBefore: Number(row.quantity) + deduction,
      });
    }

    // Queue numbers restart per shift; serialize assignment so two orders never share a number.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('brew-houze-queue-shift-' || $1::text))", [shiftId]);
    const queueResult = await client.query(`
      SELECT COALESCE(MAX(queue_number), 0) + 1 AS queue_number
      FROM sales_orders
      WHERE shift_id = $1
    `, [shiftId]);
    const queueNumber = Number(queueResult.rows[0].queue_number);
    const total = variants.rows.reduce((sum: number, variant: { product_variant_id: number; price: number }) => sum + Number(variant.price) * (quantities.get(Number(variant.product_variant_id)) ?? 0), 0) + additionTotal;
    let receivedAmount: number;
    let changeAmount: number;
    if (paymentMethod === "online") {
      // Online/e-wallet payments settle for the exact total; no cash tendered or change to compute.
      receivedAmount = total;
      changeAmount = 0;
    } else {
      receivedAmount = Number(body.received_amount);
      if (!Number.isFinite(receivedAmount) || receivedAmount < total) {
        throw new Error("Received payment must be at least the subtotal amount.");
      }
      changeAmount = Number((receivedAmount - total).toFixed(2));
    }
    const order = await client.query(`
      INSERT INTO sales_orders (cashier_admin_id, total_amount, status, queue_number, queue_status, received_amount, change_amount, payment_method, shift_id)
      VALUES ($1, $2, 'completed', $3, 'waiting', $4, $5, $6, $7)
      RETURNING order_id, queue_number,
        TO_CHAR(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS created_at
    `, [session.adminId, total, queueNumber, receivedAmount, changeAmount, paymentMethod, shiftId]);

    for (const [inventoryId, detail] of deductionDetails) {
      await client.query(`
        INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, order_id, admin_id, source_app)
        VALUES ($1, $2, $3, $4, 'order_deduction', $5, $6, $7, $8, $9, 'cashier')
      `, [inventoryId, detail.itemName, detail.category, detail.unit, detail.quantityBefore, detail.quantityAfter, detail.quantityAfter - detail.quantityBefore, order.rows[0].order_id, session.adminId]);
    }

    for (const variant of variants.rows) {
      const variantGroups = Array.from(groupedItems.values()).filter((item) => item.productVariantId === Number(variant.product_variant_id));
      for (const group of variantGroups) {
      const itemResult = await client.query(`
        INSERT INTO sales_order_items (order_id, product_id, product_variant_id, quantity, unit_price, unit_cost)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING order_item_id
      `, [order.rows[0].order_id, variant.product_id, variant.product_variant_id, group.quantity, variant.price, variantCosts.get(Number(variant.product_variant_id)) ?? null]);
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

    await client.query("COMMIT");
    return NextResponse.json({ data: { orderId: order.rows[0].order_id, queueNumber: order.rows[0].queue_number, shiftId, total, receivedAmount, changeAmount, paymentMethod, createdAt: order.rows[0].created_at } });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("POST /api/checkout failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to complete checkout." }, { status: 400 });
  } finally {
    client.release();
  }
}
