import { NextResponse } from "next/server";
import pool from "@/lib/db";

const fixedUnits = new Map([
  ["ml", { label: "mL", threshold: 500, whole: false }],
  ["milliliter", { label: "mL", threshold: 500, whole: false }],
  ["milliliters", { label: "mL", threshold: 500, whole: false }],
  ["gram", { label: "grams", threshold: 500, whole: false }],
  ["grams", { label: "grams", threshold: 500, whole: false }],
  ["g", { label: "grams", threshold: 500, whole: false }],
  ["piece", { label: "Pieces", threshold: 10, whole: true }],
  ["pieces", { label: "Pieces", threshold: 10, whole: true }],
  ["pc", { label: "Pieces", threshold: 10, whole: true }],
  ["#", { label: "Pieces", threshold: 10, whole: true }],
]);

function resolveUnit(value: unknown) {
  return fixedUnits.get(String(value ?? "").trim().toLowerCase());
}

export async function GET() {
  try {
    const result = await pool.query(`
      SELECT
        inventory_id,
        ingredient_category,
        item_name,
        unit_of_measure,
        quantity,
        low_stock_threshold,
        is_whole_unit,
        EXISTS (
          SELECT 1
          FROM product_ingredients pi
          WHERE pi.inventory_id = inventory.inventory_id
          UNION ALL
          SELECT 1
          FROM variant_ingredients vi
          WHERE vi.inventory_id = inventory.inventory_id
        ) AS is_permanent
      FROM inventory
      ORDER BY ingredient_category ASC, item_name ASC
    `);

    return NextResponse.json({ data: result.rows });
  } catch (error) {
    console.error("GET /api/inventory failed:", error);
    return NextResponse.json({ error: "Could not retrieve inventory data." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const ingredientCategory = String(body?.ingredient_category ?? "").trim();
    const itemName = String(body?.item_name ?? "").trim();
    const unitOfMeasure = resolveUnit(body?.unit_of_measure);
    const quantity = Number(body?.quantity);

    if (!ingredientCategory || !itemName || !unitOfMeasure) {
      return NextResponse.json({ error: "Ingredient category, item name, and a valid unit (mL, grams, or Pieces) are required." }, { status: 400 });
    }

    if (!Number.isFinite(quantity) || quantity < 0) {
      return NextResponse.json({ error: "Quantity must be a valid non-negative number." }, { status: 400 });
    }

    if (unitOfMeasure.whole && !Number.isInteger(quantity)) {
      return NextResponse.json({ error: "Pieces quantity must be a whole number." }, { status: 400 });
    }

    const result = await pool.query(`
      INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING inventory_id, ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit
    `, [ingredientCategory, itemName, unitOfMeasure.label, quantity, unitOfMeasure.threshold, unitOfMeasure.whole]);

    return NextResponse.json({ data: result.rows[0] }, { status: 201 });
  } catch (error) {
    console.error("POST /api/inventory failed:", error);
    return NextResponse.json({ error: "Could not create inventory item." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const quantityDelta = body?.quantity_delta === undefined ? null : Number(body.quantity_delta);
    if (Number.isInteger(Number(body?.inventory_id)) && quantityDelta !== null && Number.isFinite(quantityDelta) && quantityDelta > 0) {
      const stockResult = await pool.query(`
        UPDATE inventory
        SET quantity = quantity + $1, updated_at = CURRENT_TIMESTAMP
        WHERE inventory_id = $2
          AND (NOT is_whole_unit OR $1::numeric = TRUNC($1::numeric))
        RETURNING
          inventory_id,
          ingredient_category,
          item_name,
          unit_of_measure,
          quantity,
          low_stock_threshold,
          is_whole_unit,
          (
            EXISTS (SELECT 1 FROM product_ingredients pi WHERE pi.inventory_id = $2)
            OR EXISTS (SELECT 1 FROM variant_ingredients vi WHERE vi.inventory_id = $2)
          ) AS is_permanent
      `, [quantityDelta, Number(body.inventory_id)]);
      if (stockResult.rowCount === 0) {
        return NextResponse.json({ error: "Inventory item not found or quantity is invalid for its unit." }, { status: 400 });
      }
      return NextResponse.json({ data: stockResult.rows[0] });
    }
    const {
      inventory_id,
      ingredient_category,
      item_name,
      unit_of_measure,
      quantity,
    } = body;

    if (!inventory_id || !ingredient_category?.trim() || !item_name?.trim() || !unit_of_measure?.trim()) {
      return NextResponse.json({ error: "All inventory fields are required." }, { status: 400 });
    }

    const parsedQuantity = Number(quantity);
    const resolvedUnit = resolveUnit(unit_of_measure);
    if (!resolvedUnit || !Number.isFinite(parsedQuantity) || parsedQuantity < 0) {
      return NextResponse.json({ error: "Quantity must be a valid non-negative number." }, { status: 400 });
    }

    if (resolvedUnit.whole && !Number.isInteger(parsedQuantity)) {
      return NextResponse.json({ error: "Pieces quantity must be a whole number." }, { status: 400 });
    }

    const usageResult = await pool.query(`
      SELECT (
        EXISTS (SELECT 1 FROM product_ingredients WHERE inventory_id = $1)
        OR EXISTS (SELECT 1 FROM variant_ingredients WHERE inventory_id = $1)
      ) AS is_permanent
    `, [Number(inventory_id)]);
    if (usageResult.rows[0]?.is_permanent) {
      return NextResponse.json({ error: "Permanent inventory items cannot be edited. Add stock using the plus button instead." }, { status: 409 });
    }

    const result = await pool.query(`
      UPDATE inventory
      SET
        ingredient_category = $1,
        item_name = $2,
        unit_of_measure = $3,
        quantity = $4,
        low_stock_threshold = $5,
        is_whole_unit = $6,
        updated_at = CURRENT_TIMESTAMP
      WHERE inventory_id = $7
      RETURNING
        inventory_id,
        ingredient_category,
        item_name,
        unit_of_measure,
        quantity,
        low_stock_threshold,
        is_whole_unit,
        FALSE AS is_permanent
    `, [
      ingredient_category.trim(),
      item_name.trim(),
      resolvedUnit.label,
      parsedQuantity,
      resolvedUnit.threshold,
      resolvedUnit.whole,
      inventory_id,
    ]);

    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Inventory item not found." }, { status: 404 });
    }

    return NextResponse.json({ data: result.rows[0] });
  } catch (error) {
    console.error("PATCH /api/inventory failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update inventory data." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const inventoryId = Number(body?.inventory_id);

    if (!Number.isInteger(inventoryId) || inventoryId <= 0) {
      return NextResponse.json({ error: "A valid inventory_id is required." }, { status: 400 });
    }

    // Check for usage in product recipes first so we can give a clear, specific
    // message instead of letting the delete fail on a foreign key constraint.
    const usageResult = await pool.query(`
      SELECT DISTINCT p.product_name
      FROM products p
      WHERE p.product_id IN (
        SELECT product_id FROM product_ingredients WHERE inventory_id = $1
        UNION
        SELECT pv.product_id
        FROM product_variants pv
        JOIN variant_ingredients vi ON vi.product_variant_id = pv.product_variant_id
        WHERE vi.inventory_id = $1
      )
      ORDER BY p.product_name ASC
    `, [inventoryId]);

    if ((usageResult.rowCount ?? 0) > 0) {
      const productNames = usageResult.rows.map((row) => row.product_name as string);
      const preview = productNames.length > 5
        ? `${productNames.slice(0, 5).join(", ")}, and ${productNames.length - 5} more`
        : productNames.join(", ");
      return NextResponse.json({
        error: `This item is used in ${productNames.length} product${productNames.length === 1 ? "" : "s"} (${preview}). Remove it from those recipes before deleting it.`,
      }, { status: 409 });
    }

    const result = await pool.query(`
      DELETE FROM inventory
      WHERE inventory_id = $1
      RETURNING inventory_id
    `, [inventoryId]);

    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Inventory item not found." }, { status: 404 });
    }

    return NextResponse.json({ data: { inventory_id: result.rows[0].inventory_id } });
  } catch (error) {
    // Safety net in case a recipe was added between the usage check and the delete.
    const pgError = error as { code?: string };
    if (pgError?.code === "23503") {
      return NextResponse.json({ error: "This item is used in one or more product recipes. Remove it from those recipes before deleting it." }, { status: 409 });
    }
    console.error("DELETE /api/inventory failed:", error);
    return NextResponse.json({ error: "Could not delete inventory item." }, { status: 500 });
  }
}
