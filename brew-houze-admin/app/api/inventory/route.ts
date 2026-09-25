import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

async function getAdminId(): Promise<number | null> {
  const session = verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  return session?.adminId ?? null;
}

const fixedUnits = new Map([
  ["ml", { label: "mL", threshold: 500, whole: false }],
  ["milliliter", { label: "mL", threshold: 500, whole: false }],
  ["milliliters", { label: "mL", threshold: 500, whole: false }],
  ["l", { label: "L", threshold: 2, whole: false }],
  ["liter", { label: "L", threshold: 2, whole: false }],
  ["liters", { label: "L", threshold: 2, whole: false }],
  ["litre", { label: "L", threshold: 2, whole: false }],
  ["litres", { label: "L", threshold: 2, whole: false }],
  ["gram", { label: "grams", threshold: 500, whole: false }],
  ["grams", { label: "grams", threshold: 500, whole: false }],
  ["g", { label: "grams", threshold: 500, whole: false }],
  ["kg", { label: "kg", threshold: 2, whole: false }],
  ["kilogram", { label: "kg", threshold: 2, whole: false }],
  ["kilograms", { label: "kg", threshold: 2, whole: false }],
  ["oz", { label: "oz", threshold: 16, whole: false }],
  ["ounce", { label: "oz", threshold: 16, whole: false }],
  ["ounces", { label: "oz", threshold: 16, whole: false }],
  ["piece", { label: "Pieces", threshold: 10, whole: true }],
  ["pieces", { label: "Pieces", threshold: 10, whole: true }],
  ["pc", { label: "Pieces", threshold: 10, whole: true }],
  ["#", { label: "Pieces", threshold: 10, whole: true }],
  ["bottle", { label: "Bottles", threshold: 3, whole: true }],
  ["bottles", { label: "Bottles", threshold: 3, whole: true }],
  ["box", { label: "Boxes", threshold: 3, whole: true }],
  ["boxes", { label: "Boxes", threshold: 3, whole: true }],
  ["pack", { label: "Packs", threshold: 5, whole: true }],
  ["packs", { label: "Packs", threshold: 5, whole: true }],
  ["packet", { label: "Packs", threshold: 5, whole: true }],
  ["packets", { label: "Packs", threshold: 5, whole: true }],
  ["sachet", { label: "Sachets", threshold: 20, whole: true }],
  ["sachets", { label: "Sachets", threshold: 20, whole: true }],
]);

function resolveUnit(value: unknown) {
  return fixedUnits.get(String(value ?? "").trim().toLowerCase());
}

export async function GET() {
  try {
    const result = await pool.query(`
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
      LEFT JOIN inventory parent ON parent.inventory_id = inventory.derived_from_inventory_id
      WHERE inventory.is_archived = FALSE
      ORDER BY inventory.ingredient_category ASC, inventory.item_name ASC
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

    if (!ingredientCategory || !itemName || !unitOfMeasure) {
      return NextResponse.json({ error: "Ingredient category, item name, and a valid unit (mL, grams, or Pieces) are required." }, { status: 400 });
    }

    const rawDerivedFromId = body?.derived_from_inventory_id;
    const isBound = rawDerivedFromId !== undefined && rawDerivedFromId !== null && rawDerivedFromId !== "";
    const derivedFromInventoryId = isBound ? Number(rawDerivedFromId) : null;
    const derivedRatio = isBound ? Number(body?.derived_ratio) : null;
    let quantity = Number(body?.quantity);

    if (isBound) {
      if (!Number.isInteger(derivedFromInventoryId) || derivedFromInventoryId! <= 0) {
        return NextResponse.json({ error: "Select a valid source item to bind this item's stock to." }, { status: 400 });
      }
      if (!Number.isFinite(derivedRatio) || derivedRatio! <= 0) {
        return NextResponse.json({ error: "Enter a valid positive binding ratio." }, { status: 400 });
      }
      const parentResult = await pool.query(
        "SELECT inventory_id, derived_from_inventory_id FROM inventory WHERE inventory_id = $1 AND is_archived = FALSE",
        [derivedFromInventoryId]
      );
      if (parentResult.rowCount === 0) {
        return NextResponse.json({ error: "The selected source item was not found." }, { status: 404 });
      }
      if (parentResult.rows[0].derived_from_inventory_id !== null) {
        return NextResponse.json({ error: "This item is itself bound to another item and cannot be used as a source. Choose a directly-stocked item instead." }, { status: 400 });
      }
      quantity = 0; // Bound items never carry their own stock; it is always computed from the source item.
    } else {
      if (!Number.isFinite(quantity) || quantity < 0) {
        return NextResponse.json({ error: "Quantity must be a valid non-negative number." }, { status: 400 });
      }
      if (unitOfMeasure.whole && !Number.isInteger(quantity)) {
        return NextResponse.json({ error: "Pieces quantity must be a whole number." }, { status: 400 });
      }
    }

    const result = await pool.query(`
      INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, derived_from_inventory_id, derived_ratio)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING inventory_id, ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, derived_from_inventory_id, derived_ratio,
        FALSE AS is_permanent
    `, [ingredientCategory, itemName, unitOfMeasure.label, quantity, unitOfMeasure.threshold, unitOfMeasure.whole, derivedFromInventoryId, derivedRatio]);

    const createdItem = result.rows[0];

    if (isBound) {
      const parentInfo = await pool.query("SELECT item_name, unit_of_measure, quantity FROM inventory WHERE inventory_id = $1", [derivedFromInventoryId]);
      const parentQuantity = Number(parentInfo.rows[0]?.quantity ?? 0);
      createdItem.derived_from_item_name = parentInfo.rows[0]?.item_name ?? null;
      createdItem.derived_from_unit_of_measure = parentInfo.rows[0]?.unit_of_measure ?? null;
      createdItem.quantity = createdItem.is_whole_unit ? Math.floor(parentQuantity / derivedRatio!) : parentQuantity / derivedRatio!;
    }

    await pool.query(`
      INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app)
      VALUES ($1, $2, $3, $4, 'created', 0, $5, $5, $6, 'admin')
    `, [createdItem.inventory_id, createdItem.item_name, createdItem.ingredient_category, createdItem.unit_of_measure, createdItem.quantity, await getAdminId()]);

    return NextResponse.json({ data: createdItem }, { status: 201 });
  } catch (error) {
    console.error("POST /api/inventory failed:", error);
    return NextResponse.json({ error: "Could not create inventory item." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();

    // --- Branch 1: restock (add a positive quantity delta to a directly-stocked item) ---
    const quantityDelta = body?.quantity_delta === undefined ? null : Number(body.quantity_delta);
    if (body?.bind_edit !== true && Number.isInteger(Number(body?.inventory_id)) && quantityDelta !== null && Number.isFinite(quantityDelta) && quantityDelta > 0) {
      const targetResult = await pool.query(
        `SELECT derived_from_inventory_id, (SELECT item_name FROM inventory p WHERE p.inventory_id = inventory.derived_from_inventory_id) AS derived_from_item_name
         FROM inventory WHERE inventory_id = $1 AND is_archived = FALSE`,
        [Number(body.inventory_id)]
      );
      if (targetResult.rowCount === 0) {
        return NextResponse.json({ error: "Inventory item not found." }, { status: 404 });
      }
      if (targetResult.rows[0].derived_from_inventory_id) {
        return NextResponse.json({ error: `This item's stock is bound to ${targetResult.rows[0].derived_from_item_name ?? "another item"}. Restock that item instead.` }, { status: 409 });
      }
      const stockResult = await pool.query(`
        UPDATE inventory
        SET quantity = quantity + $1, updated_at = CURRENT_TIMESTAMP
        WHERE inventory_id = $2
          AND is_archived = FALSE
          AND (NOT is_whole_unit OR $1::numeric = TRUNC($1::numeric))
        RETURNING
          inventory_id,
          ingredient_category,
          item_name,
          unit_of_measure,
          quantity,
          low_stock_threshold,
          is_whole_unit,
          derived_from_inventory_id,
          derived_ratio,
          (
            EXISTS (SELECT 1 FROM product_ingredients pi WHERE pi.inventory_id = $2)
            OR EXISTS (SELECT 1 FROM variant_ingredients vi WHERE vi.inventory_id = $2)
          ) AS is_permanent
      `, [quantityDelta, Number(body.inventory_id)]);
      if (stockResult.rowCount === 0) {
        return NextResponse.json({ error: "Inventory item not found or quantity is invalid for its unit." }, { status: 400 });
      }
      const restockedItem = stockResult.rows[0];
      await pool.query(`
        INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app)
        VALUES ($1, $2, $3, $4, 'restocked', $5, $6, $7, $8, 'admin')
      `, [restockedItem.inventory_id, restockedItem.item_name, restockedItem.ingredient_category, restockedItem.unit_of_measure, Number(restockedItem.quantity) - quantityDelta, restockedItem.quantity, quantityDelta, await getAdminId()]);
      return NextResponse.json({ data: restockedItem });
    }

    // --- Branch 2: binding edit (create/change/remove a source binding, plus basic details) ---
    if (body?.bind_edit === true) {
      const inventoryId = Number(body?.inventory_id);
      if (!Number.isInteger(inventoryId) || inventoryId <= 0) {
        return NextResponse.json({ error: "A valid inventory_id is required." }, { status: 400 });
      }
      const ingredientCategory = String(body?.ingredient_category ?? "").trim();
      const itemName = String(body?.item_name ?? "").trim();
      const resolvedUnit = resolveUnit(body?.unit_of_measure);
      if (!ingredientCategory || !itemName || !resolvedUnit) {
        return NextResponse.json({ error: "Ingredient category, item name, and a valid unit are required." }, { status: 400 });
      }

      const rawDerivedFromId = body?.derived_from_inventory_id;
      const wantsBound = rawDerivedFromId !== undefined && rawDerivedFromId !== null && rawDerivedFromId !== "";
      const newParentId = wantsBound ? Number(rawDerivedFromId) : null;
      const newRatio = wantsBound ? Number(body?.derived_ratio) : null;

      const currentResult = await pool.query(
        "SELECT inventory_id, quantity, derived_from_inventory_id, derived_ratio, is_whole_unit FROM inventory WHERE inventory_id = $1 AND is_archived = FALSE",
        [inventoryId]
      );
      if (currentResult.rowCount === 0) {
        return NextResponse.json({ error: "Inventory item not found." }, { status: 404 });
      }
      const current = currentResult.rows[0];

      let finalQuantity: number | null = null; // null keeps the currently stored quantity untouched
      if (wantsBound) {
        if (newParentId === inventoryId) {
          return NextResponse.json({ error: "An item cannot be bound to itself." }, { status: 400 });
        }
        if (!Number.isInteger(newParentId) || newParentId! <= 0) {
          return NextResponse.json({ error: "Select a valid source item to bind this item's stock to." }, { status: 400 });
        }
        if (!Number.isFinite(newRatio) || newRatio! <= 0) {
          return NextResponse.json({ error: "Enter a valid positive binding ratio." }, { status: 400 });
        }
        const parentResult = await pool.query(
          "SELECT inventory_id, derived_from_inventory_id FROM inventory WHERE inventory_id = $1 AND is_archived = FALSE",
          [newParentId]
        );
        if (parentResult.rowCount === 0) {
          return NextResponse.json({ error: "The selected source item was not found." }, { status: 404 });
        }
        if (parentResult.rows[0].derived_from_inventory_id !== null) {
          return NextResponse.json({ error: "This item is itself bound to another item and cannot be used as a source. Choose a directly-stocked item instead." }, { status: 400 });
        }
        finalQuantity = 0;
      } else if (current.derived_from_inventory_id) {
        // Unbinding: freeze the last computed available quantity as the new stored stock.
        const parentQtyResult = await pool.query("SELECT quantity FROM inventory WHERE inventory_id = $1", [current.derived_from_inventory_id]);
        const parentQuantity = Number(parentQtyResult.rows[0]?.quantity ?? 0);
        const oldRatio = Number(current.derived_ratio);
        const available = oldRatio > 0 ? parentQuantity / oldRatio : 0;
        finalQuantity = current.is_whole_unit ? Math.floor(available) : available;
      }

      const result = await pool.query(`
        UPDATE inventory
        SET
          ingredient_category = $1,
          item_name = $2,
          unit_of_measure = $3,
          is_whole_unit = $4,
          low_stock_threshold = $5,
          derived_from_inventory_id = $6,
          derived_ratio = $7,
          quantity = COALESCE($8, quantity),
          updated_at = CURRENT_TIMESTAMP
        WHERE inventory_id = $9 AND is_archived = FALSE
        RETURNING
          inventory_id, ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, derived_from_inventory_id, derived_ratio
      `, [ingredientCategory, itemName, resolvedUnit.label, resolvedUnit.whole, resolvedUnit.threshold, newParentId, newRatio, finalQuantity, inventoryId]);

      if (result.rowCount === 0) {
        return NextResponse.json({ error: "Inventory item not found." }, { status: 404 });
      }

      const updatedItem = result.rows[0];
      if (updatedItem.derived_from_inventory_id) {
        const parentInfo = await pool.query("SELECT item_name, unit_of_measure, quantity FROM inventory WHERE inventory_id = $1", [updatedItem.derived_from_inventory_id]);
        const parentQuantity = Number(parentInfo.rows[0]?.quantity ?? 0);
        updatedItem.derived_from_item_name = parentInfo.rows[0]?.item_name ?? null;
        updatedItem.derived_from_unit_of_measure = parentInfo.rows[0]?.unit_of_measure ?? null;
        updatedItem.quantity = updatedItem.is_whole_unit ? Math.floor(parentQuantity / Number(updatedItem.derived_ratio)) : parentQuantity / Number(updatedItem.derived_ratio);
      }
      const permanentResult = await pool.query(
        `SELECT (
          EXISTS (SELECT 1 FROM product_ingredients WHERE inventory_id = $1)
          OR EXISTS (SELECT 1 FROM variant_ingredients WHERE inventory_id = $1)
        ) AS is_permanent`,
        [inventoryId]
      );
      updatedItem.is_permanent = permanentResult.rows[0].is_permanent;

      const quantityBefore = Number(current.quantity);
      const quantityAfter = Number(updatedItem.quantity);
      if (quantityAfter !== quantityBefore) {
        await pool.query(`
          INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app)
          VALUES ($1, $2, $3, $4, 'manual_edit', $5, $6, $7, $8, 'admin')
        `, [updatedItem.inventory_id, updatedItem.item_name, updatedItem.ingredient_category, updatedItem.unit_of_measure, quantityBefore, quantityAfter, quantityAfter - quantityBefore, await getAdminId()]);
      }

      return NextResponse.json({ data: updatedItem });
    }

    // --- Branch 3: classic full edit (still blocked for permanent items, and for bound items) ---
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
      SELECT quantity, derived_from_inventory_id, (
        EXISTS (SELECT 1 FROM product_ingredients WHERE inventory_id = $1)
        OR EXISTS (SELECT 1 FROM variant_ingredients WHERE inventory_id = $1)
      ) AS is_permanent
      FROM inventory
      WHERE inventory_id = $1 AND is_archived = FALSE
    `, [Number(inventory_id)]);
    if (usageResult.rowCount === 0) {
      return NextResponse.json({ error: "Inventory item not found." }, { status: 404 });
    }
    if (usageResult.rows[0]?.is_permanent) {
      return NextResponse.json({ error: "Permanent inventory items cannot be edited. Add stock using the plus button instead." }, { status: 409 });
    }
    if (usageResult.rows[0]?.derived_from_inventory_id) {
      return NextResponse.json({ error: "This item's stock is bound to another item. Use \"Edit binding\" to change it." }, { status: 409 });
    }
    const quantityBefore = Number(usageResult.rows[0].quantity);

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
      WHERE inventory_id = $7 AND is_archived = FALSE
      RETURNING
        inventory_id,
        ingredient_category,
        item_name,
        unit_of_measure,
        quantity,
        low_stock_threshold,
        is_whole_unit,
        NULL::integer AS derived_from_inventory_id,
        NULL::numeric AS derived_ratio,
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

    const editedItem = result.rows[0];
    if (parsedQuantity !== quantityBefore) {
      await pool.query(`
        INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app)
        VALUES ($1, $2, $3, $4, 'manual_edit', $5, $6, $7, $8, 'admin')
      `, [editedItem.inventory_id, editedItem.item_name, editedItem.ingredient_category, editedItem.unit_of_measure, quantityBefore, parsedQuantity, parsedQuantity - quantityBefore, await getAdminId()]);
    }

    return NextResponse.json({ data: editedItem });
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

    // Block archiving an item that active bound items still draw stock from.
    const boundDependents = await pool.query(
      "SELECT item_name FROM inventory WHERE derived_from_inventory_id = $1 AND is_archived = FALSE ORDER BY item_name ASC",
      [inventoryId]
    );
    if ((boundDependents.rowCount ?? 0) > 0) {
      const boundNames = boundDependents.rows.map((row) => row.item_name as string);
      const boundPreview = boundNames.length > 5 ? `${boundNames.slice(0, 5).join(", ")}, and ${boundNames.length - 5} more` : boundNames.join(", ");
      return NextResponse.json({
        error: `This item is the stock source for ${boundNames.length} bound item${boundNames.length === 1 ? "" : "s"} (${boundPreview}). Unbind or archive those first.`,
      }, { status: 409 });
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
      UPDATE inventory
      SET is_archived = TRUE, archived_at = CURRENT_TIMESTAMP, archived_by = $2
      WHERE inventory_id = $1 AND is_archived = FALSE
      RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity
    `, [inventoryId, await getAdminId()]);

    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Inventory item not found." }, { status: 404 });
    }

    const archivedItem = result.rows[0];
    // Archiving doesn't change stock on hand, only visibility, so before/after/delta stay flat.
    await pool.query(`
      INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, note)
      VALUES ($1, $2, $3, $4, 'archived', $5, $5, 0, $6, 'admin', 'Archived')
    `, [archivedItem.inventory_id, archivedItem.item_name, archivedItem.ingredient_category, archivedItem.unit_of_measure, archivedItem.quantity, await getAdminId()]);

    return NextResponse.json({ data: { inventory_id: archivedItem.inventory_id } });
  } catch (error) {
    console.error("DELETE /api/inventory failed:", error);
    return NextResponse.json({ error: "Could not archive inventory item." }, { status: 500 });
  }
}
