import type { PoolClient } from "pg";
import pool from "@/lib/db";

// Shared row shape for every inventory response, so the UI always receives the same fields.
// Bound items report their stock and cost through their source item. Usage lists only count
// active products, split by how the product consumes the item. Packagings are listed most
// recently restocked first, so the first one is the pack staff are currently buying.
export const inventorySelect = `
  SELECT
    inventory.inventory_id,
    inventory.ingredient_category,
    inventory.item_name,
    inventory.unit_of_measure,
    CASE
      WHEN inventory.derived_from_inventory_id IS NOT NULL THEN
        CASE
          WHEN inventory.is_whole_unit THEN FLOOR(COALESCE(parent.quantity, 0) / inventory.derived_ratio)
          ELSE COALESCE(parent.quantity, 0) / inventory.derived_ratio
        END
      ELSE inventory.quantity
    END AS quantity,
    inventory.low_stock_threshold,
    inventory.is_whole_unit,
    inventory.derived_from_inventory_id,
    inventory.derived_ratio,
    parent.item_name AS derived_from_item_name,
    parent.unit_of_measure AS derived_from_unit_of_measure,
    parent.quantity AS derived_from_available_quantity,
    inventory.unit_cost,
    CASE
      WHEN inventory.derived_from_inventory_id IS NOT NULL THEN parent.unit_cost * inventory.derived_ratio
      ELSE inventory.unit_cost
    END AS effective_unit_cost,
    EXISTS (
      SELECT 1
      FROM product_ingredients pi
      WHERE pi.inventory_id = inventory.inventory_id
      UNION ALL
      SELECT 1
      FROM variant_ingredients vi
      WHERE vi.inventory_id = inventory.inventory_id
    ) AS is_permanent,
    ARRAY(
      SELECT DISTINCT p.product_name::text
      FROM variant_ingredients vi
      JOIN product_variants pv ON pv.product_variant_id = vi.product_variant_id AND pv.is_archived = FALSE
      JOIN products p ON p.product_id = pv.product_id AND p.is_archived = FALSE AND p.product_type = 'recipe'
      WHERE vi.inventory_id = inventory.inventory_id
      ORDER BY 1
    ) AS recipe_products,
    ARRAY(
      SELECT DISTINCT p.product_name::text
      FROM variant_ingredients vi
      JOIN product_variants pv ON pv.product_variant_id = vi.product_variant_id AND pv.is_archived = FALSE
      JOIN products p ON p.product_id = pv.product_id AND p.is_archived = FALSE AND p.product_type = 'stock'
      WHERE vi.inventory_id = inventory.inventory_id
      ORDER BY 1
    ) AS direct_sale_products,
    ARRAY(
      SELECT a.addition_name::text
      FROM additions a
      WHERE a.inventory_id = inventory.inventory_id AND a.is_active = TRUE
      ORDER BY 1
    ) AS addition_names,
    COALESCE((
      SELECT json_agg(json_build_object(
        'packagingId', pk.packaging_id,
        'name', pk.packaging_name,
        'brand', pk.brand,
        'contentQuantity', pk.content_quantity,
        'lastPackPrice', pk.last_pack_price,
        'lastRestockedAt', pk.last_restocked_at
      ) ORDER BY pk.last_restocked_at DESC NULLS LAST, pk.created_at DESC)
      FROM inventory_packaging pk
      WHERE pk.inventory_id = inventory.inventory_id AND pk.is_archived = FALSE
    ), '[]'::json) AS packagings
  FROM inventory
  LEFT JOIN inventory parent ON parent.inventory_id = inventory.derived_from_inventory_id
`;

export async function loadInventoryItem(inventoryId: number, client: PoolClient | typeof pool = pool) {
  const result = await client.query(`${inventorySelect} WHERE inventory.inventory_id = $1`, [inventoryId]);
  return result.rows[0] ?? null;
}

export type PackagingInput = { name: string; brand: string | null; contentQuantity: number; packPrice: number | null };

// Validates a packaging description. Contents are in the stock item's own unit (1000 for a
// 1 kg bag of an item counted in grams) and must be whole for whole-unit items (a case of 24 cans).
export function parsePackaging(value: unknown, itemIsWholeUnit: boolean): { value?: PackagingInput; error?: string } {
  const body = (value ?? {}) as { packaging_name?: unknown; brand?: unknown; content_quantity?: unknown; pack_price?: unknown };
  const name = String(body.packaging_name ?? "").trim().slice(0, 120);
  const brand = String(body.brand ?? "").trim().slice(0, 80) || null;
  const contentQuantity = Number(body.content_quantity);
  const rawPrice = body.pack_price;
  const packPrice = rawPrice === undefined || rawPrice === null || rawPrice === "" ? null : Number(rawPrice);

  if (!name) return { error: "Give the packaging a name, e.g. Nescafe Bean Bag 1 kg." };
  if (!Number.isFinite(contentQuantity) || contentQuantity <= 0) return { error: "Enter how much one pack contains (more than 0)." };
  if (itemIsWholeUnit && !Number.isInteger(contentQuantity)) return { error: "This item is counted in whole units, so one pack must contain a whole number." };
  if (packPrice !== null && (!Number.isFinite(packPrice) || packPrice < 0)) return { error: "The pack price must be 0 or more." };
  return { value: { name, brand, contentQuantity, packPrice: packPrice === null ? null : Math.round(packPrice * 100) / 100 } };
}

// New unit cost after adding stock that cost `addedTotalCost`: the cost of the stock on hand and
// of the new packs, averaged by quantity. If the stock on hand has no known cost (or none is
// left), the new packs set the cost on their own.
export function weightedAverageUnitCost(currentQuantity: number, currentUnitCost: number | null, addedQuantity: number, addedTotalCost: number): number {
  const onHand = Math.max(0, currentQuantity);
  const average = currentUnitCost === null || onHand === 0
    ? addedTotalCost / addedQuantity
    : (onHand * currentUnitCost + addedTotalCost) / (onHand + addedQuantity);
  return Math.round(average * 10000) / 10000;
}
