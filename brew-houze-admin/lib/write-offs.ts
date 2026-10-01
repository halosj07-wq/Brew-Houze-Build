import type { PoolClient } from "pg";
import type pool from "@/lib/db";

// Stock written off (see stock-write-off-migration.sql and write-off-requests-migration.sql): stock
// that leaves without being sold, expired or spoiled, damaged, spilled or wasted, or used in-house.
// What is written off is a menu item in one size (all its recipe ingredients, as a sale would take
// them) or one inventory item. A portion made from another item (a bound item) comes off its source,
// the same as at checkout. Each item taken off gets a stock history entry with the reason and its
// cost then (quantity times unit cost), which Finance counts as stock written off.

export type WriteOffReason = "expired" | "damaged" | "wasted" | "in_house" | "other";
export const WRITE_OFF_REASONS: WriteOffReason[] = ["expired", "damaged", "wasted", "in_house", "other"];
export const WRITE_OFF_REASON_LABELS: Record<WriteOffReason, string> = { expired: "Expired or spoiled", damaged: "Damaged", wasted: "Spilled or wasted", in_house: "Used in-house", other: "Other" };

export type WriteOffTarget = { productVariantId: number; quantity: number } | { inventoryId: number; quantity: number };
export type WriteOffLine = { inventoryId: number; itemName: string; unit: string; quantity: number; available: number; unitCost: number | null; cost: number | null };

export class WriteOffStockError extends Error {}

const round = (value: number, places = 2) => Math.round(value * 10 ** places) / 10 ** places;

// The stock a write-off takes, per stocked item (bound items resolved to their source), with what
// is on hand and its cost. Nothing changes. With lock, the items are locked for the rest of the
// transaction, in id order (as checkout does), so two changes cannot cross.
export async function planWriteOff(client: PoolClient | typeof pool, target: WriteOffTarget, lock = false): Promise<{ label: string; lines: WriteOffLine[]; cost: number | null }> {
  const deductions = new Map<number, number>();
  let label: string;
  if ("productVariantId" in target) {
    const variant = await client.query(`
      SELECT p.product_name, pv.size_label FROM product_variants pv JOIN products p ON p.product_id = pv.product_id WHERE pv.product_variant_id = $1
    `, [target.productVariantId]);
    if (!variant.rows[0]) throw new WriteOffStockError("That menu item was not found.");
    const size = String(variant.rows[0].size_label ?? "");
    label = `${variant.rows[0].product_name}${size && size !== "Regular" ? ` ${size}` : ""}`;
    const ingredients = await client.query("SELECT inventory_id, required_quantity FROM variant_ingredients WHERE product_variant_id = $1", [target.productVariantId]);
    if (ingredients.rowCount === 0) throw new WriteOffStockError(`${label} has no recipe, so there is no stock to write off.`);
    for (const row of ingredients.rows) deductions.set(Number(row.inventory_id), (deductions.get(Number(row.inventory_id)) ?? 0) + Number(row.required_quantity) * target.quantity);
  } else {
    const item = await client.query("SELECT item_name FROM inventory WHERE inventory_id = $1", [target.inventoryId]);
    if (!item.rows[0]) throw new WriteOffStockError("That inventory item was not found.");
    label = String(item.rows[0].item_name);
    deductions.set(target.inventoryId, target.quantity);
  }
  // Bound items come off their source, scaled by their ratio (as at checkout).
  for (let depth = 0; depth < 10; depth++) {
    const bound = await client.query("SELECT inventory_id, derived_from_inventory_id, derived_ratio FROM inventory WHERE inventory_id = ANY($1::int[]) AND derived_from_inventory_id IS NOT NULL", [Array.from(deductions.keys())]);
    if (bound.rowCount === 0) break;
    for (const row of bound.rows) {
      const amount = deductions.get(Number(row.inventory_id)) ?? 0;
      deductions.delete(Number(row.inventory_id));
      deductions.set(Number(row.derived_from_inventory_id), (deductions.get(Number(row.derived_from_inventory_id)) ?? 0) + amount * Number(row.derived_ratio));
    }
  }
  const ids = Array.from(deductions.keys()).sort((a, b) => a - b);
  const rows = await client.query(`
    SELECT inventory_id, item_name, unit_of_measure, quantity, unit_cost FROM inventory WHERE inventory_id = ANY($1::int[]) ORDER BY inventory_id ${lock ? "FOR UPDATE" : ""}
  `, [ids]);
  const lines: WriteOffLine[] = rows.rows.map((row) => {
    const quantity = round(deductions.get(Number(row.inventory_id)) ?? 0, 3);
    const unitCost = row.unit_cost === null ? null : Number(row.unit_cost);
    return { inventoryId: Number(row.inventory_id), itemName: String(row.item_name), unit: String(row.unit_of_measure ?? ""), quantity, available: Number(row.quantity), unitCost, cost: unitCost === null ? null : round(quantity * unitCost) };
  });
  const cost = lines.every((line) => line.cost !== null) ? round(lines.reduce((sum, line) => sum + (line.cost ?? 0), 0)) : null;
  return { label, lines, cost };
}

// Writes the stock off: each item comes off, with a stock history entry. Refused (nothing changes)
// when any item has less on hand than the write-off needs. Returns the plan and its cost.
export async function applyWriteOff(client: PoolClient, input: { target: WriteOffTarget; reason: WriteOffReason; note: string; adminId: number | null; sourceApp: "admin" | "cashier"; requestId?: number | null }) {
  const plan = await planWriteOff(client, input.target, true);
  const short = plan.lines.find((line) => line.quantity > line.available + 0.0005);
  if (short) throw new WriteOffStockError(`Only ${round(short.available, 3)} ${short.unit} of ${short.itemName} is in stock, but this needs ${short.quantity}.`);
  const quantityText = Number.isInteger(input.target.quantity) ? String(input.target.quantity) : String(round(input.target.quantity, 3));
  const what = "productVariantId" in input.target ? `${quantityText} × ${plan.label}` : null;
  const note = [what, input.note].filter(Boolean).join(" · ") || null;
  for (const line of plan.lines) {
    if (line.quantity <= 0) continue;
    const updated = await client.query(`
      UPDATE inventory SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP WHERE inventory_id = $2
      RETURNING item_name, ingredient_category, unit_of_measure, quantity
    `, [line.quantity, line.inventoryId]);
    const row = updated.rows[0];
    await client.query(`
      INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, note, write_off_reason, write_off_cost, write_off_request_id)
      VALUES ($1, $2, $3, $4, 'written_off', $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `, [line.inventoryId, row.item_name, row.ingredient_category, row.unit_of_measure, Number(row.quantity) + line.quantity, Number(row.quantity), -line.quantity, input.adminId, input.sourceApp, note, input.reason, line.cost, input.requestId ?? null]);
  }
  return plan;
}
