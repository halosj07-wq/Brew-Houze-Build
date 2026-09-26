import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSession } from "@/lib/sessions";
import { inventorySelect, loadInventoryItem, parsePackaging, weightedAverageUnitCost } from "@/lib/inventory";

async function getAdminId(): Promise<number | null> {
  const session = await getSession();
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

// Cost per unit of measure (per gram, per mL, per piece...). `undefined` means the field was
// not sent (keep the stored cost), `null` means it was cleared (cost not known).
function parseUnitCost(value: unknown): { valid: boolean; value?: number | null } {
  if (value === undefined) return { valid: true, value: undefined };
  if (value === null || value === "") return { valid: true, value: null };
  const cost = Number(value);
  return Number.isFinite(cost) && cost >= 0 ? { valid: true, value: Math.round(cost * 10000) / 10000 } : { valid: false };
}

export async function GET() {
  if (!(await getSession())) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  try {
    const result = await pool.query(`
      ${inventorySelect}
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
  const client = await pool.connect();
  try {
    const body = await request.json();
    const ingredientCategory = String(body?.ingredient_category ?? "").trim();
    const itemName = String(body?.item_name ?? "").trim();
    const unitOfMeasure = resolveUnit(body?.unit_of_measure);

    if (!ingredientCategory || !itemName || !unitOfMeasure) {
      return NextResponse.json({ error: "Category, item name, and a valid unit are required." }, { status: 400 });
    }
    const unitCost = parseUnitCost(body?.unit_cost);
    if (!unitCost.valid) {
      return NextResponse.json({ error: "Unit cost must be a valid non-negative amount, or left blank." }, { status: 400 });
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
      if (body?.packaging) {
        return NextResponse.json({ error: "A bound item draws its stock from its source item, so add the packaging to the source item instead." }, { status: 400 });
      }
    } else {
      if (!Number.isFinite(quantity) || quantity < 0) {
        return NextResponse.json({ error: "Quantity must be a valid non-negative number." }, { status: 400 });
      }
      if (unitOfMeasure.whole && !Number.isInteger(quantity)) {
        return NextResponse.json({ error: "Pieces quantity must be a whole number." }, { status: 400 });
      }
    }

    // Optional first packaging ("bought as"). When the starting stock is given in packs, the
    // quantity is packs x contents and the unit cost comes from the pack price.
    let packaging: ReturnType<typeof parsePackaging>["value"] = undefined;
    let initialPacks: number | null = null;
    let initialUnitCost = isBound ? null : unitCost.value ?? null;
    if (!isBound && body?.packaging) {
      const parsed = parsePackaging(body.packaging, unitOfMeasure.whole);
      if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
      packaging = parsed.value;
      if (body?.initial_packs !== undefined && body?.initial_packs !== null && body?.initial_packs !== "") {
        initialPacks = Number(body.initial_packs);
        if (!Number.isInteger(initialPacks) || initialPacks < 0) {
          return NextResponse.json({ error: "The starting number of packs must be a whole number (0 or more)." }, { status: 400 });
        }
        quantity = initialPacks * packaging!.contentQuantity;
      }
      // Stock on hand that is not a full pack (an opened bag), in the item's own unit.
      if (body?.initial_loose !== undefined && body?.initial_loose !== null && body?.initial_loose !== "") {
        const loose = Number(body.initial_loose);
        if (!Number.isFinite(loose) || loose < 0 || (unitOfMeasure.whole && !Number.isInteger(loose))) {
          return NextResponse.json({ error: `The loose amount must be ${unitOfMeasure.whole ? "a whole number" : "a number"} (0 or more).` }, { status: 400 });
        }
        quantity = (initialPacks ?? 0) * packaging!.contentQuantity + loose;
      }
      if (packaging!.packPrice !== null && initialUnitCost === null) {
        initialUnitCost = Math.round((packaging!.packPrice / packaging!.contentQuantity) * 10000) / 10000;
      }
    }

    await client.query("BEGIN");
    // Bound items never carry a cost of their own; it is always derived from the source item.
    const result = await client.query(`
      INSERT INTO inventory (ingredient_category, item_name, unit_of_measure, quantity, low_stock_threshold, is_whole_unit, derived_from_inventory_id, derived_ratio, unit_cost)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING inventory_id
    `, [ingredientCategory, itemName, unitOfMeasure.label, quantity, unitOfMeasure.threshold, unitOfMeasure.whole, derivedFromInventoryId, derivedRatio, initialUnitCost]);
    const inventoryId = Number(result.rows[0].inventory_id);

    let packagingId: number | null = null;
    if (packaging) {
      const packagingResult = await client.query(`
        INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price, last_restocked_at)
        VALUES ($1, $2, $3, $4, $5, CASE WHEN $6::boolean THEN CURRENT_TIMESTAMP END)
        RETURNING packaging_id
      `, [inventoryId, packaging.name, packaging.brand, packaging.contentQuantity, packaging.packPrice, (initialPacks ?? 0) > 0]);
      packagingId = Number(packagingResult.rows[0].packaging_id);
    }

    const createdItem = await loadInventoryItem(inventoryId, client);
    await client.query(`
      INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
      VALUES ($1, $2, $3, $4, 'created', 0, $5, $5, $6, 'admin', $7, $8, $9, $10, $11)
    `, [createdItem.inventory_id, createdItem.item_name, createdItem.ingredient_category, createdItem.unit_of_measure, createdItem.quantity, await getAdminId(), initialUnitCost,
      (initialPacks ?? 0) > 0 ? packagingId : null, (initialPacks ?? 0) > 0 ? packaging?.name ?? null : null, (initialPacks ?? 0) > 0 ? initialPacks : null, (initialPacks ?? 0) > 0 ? packaging?.packPrice ?? null : null]);
    await client.query("COMMIT");

    return NextResponse.json({ data: createdItem }, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("POST /api/inventory failed:", error);
    return NextResponse.json({ error: "Could not create inventory item." }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();

    // --- Branch 0: cost update (allowed even for items used by products, since it never changes stock) ---
    if (body?.cost_edit === true) {
      const inventoryId = Number(body?.inventory_id);
      const unitCost = parseUnitCost(body?.unit_cost);
      if (!Number.isInteger(inventoryId) || inventoryId <= 0 || !unitCost.valid || unitCost.value === undefined) {
        return NextResponse.json({ error: "Enter a valid non-negative unit cost, or leave it blank." }, { status: 400 });
      }
      const current = await pool.query(
        "SELECT item_name, ingredient_category, unit_of_measure, quantity, unit_cost, derived_from_inventory_id FROM inventory WHERE inventory_id = $1 AND is_archived = FALSE",
        [inventoryId]
      );
      if (current.rowCount === 0) {
        return NextResponse.json({ error: "Inventory item not found." }, { status: 404 });
      }
      const previous = current.rows[0];
      if (previous.derived_from_inventory_id) {
        return NextResponse.json({ error: "This item's cost follows the item its stock is bound to. Update that item's cost instead." }, { status: 409 });
      }
      await pool.query("UPDATE inventory SET unit_cost = $1, updated_at = CURRENT_TIMESTAMP WHERE inventory_id = $2", [unitCost.value, inventoryId]);
      const previousCost = previous.unit_cost === null ? null : Number(previous.unit_cost);
      if (previousCost !== unitCost.value) {
        await pool.query(`
          INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_before, unit_cost_after)
          VALUES ($1, $2, $3, $4, 'cost_updated', $5, $5, 0, $6, 'admin', $7, $8)
        `, [inventoryId, previous.item_name, previous.ingredient_category, previous.unit_of_measure, previous.quantity, await getAdminId(), previousCost, unitCost.value]);
      }
      return NextResponse.json({ data: await loadInventoryItem(inventoryId) });
    }

    // --- Branch 0b: details and stock count. Works for items used by products too: renaming or
    // recounting never breaks a recipe. The unit can only change while nothing depends on it
    // (recipes, packagings and portions are all measured in this unit). ---
    if (body?.details_edit === true) {
      const inventoryId = Number(body?.inventory_id);
      const ingredientCategory = String(body?.ingredient_category ?? "").trim();
      const itemName = String(body?.item_name ?? "").trim();
      const resolvedUnit = resolveUnit(body?.unit_of_measure);
      const newQuantity = body?.quantity === undefined || body?.quantity === null || body?.quantity === "" ? null : Number(body.quantity);
      if (!Number.isInteger(inventoryId) || inventoryId <= 0 || !ingredientCategory || !itemName || !resolvedUnit) {
        return NextResponse.json({ error: "Category, item name, and a valid unit are required." }, { status: 400 });
      }
      if (newQuantity !== null && (!Number.isFinite(newQuantity) || newQuantity < 0 || (resolvedUnit.whole && !Number.isInteger(newQuantity)))) {
        return NextResponse.json({ error: `The stock count must be ${resolvedUnit.whole ? "a whole number" : "a number"} (0 or more).` }, { status: 400 });
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const currentResult = await client.query(`
          SELECT i.quantity, i.unit_of_measure, i.derived_from_inventory_id,
            (EXISTS (SELECT 1 FROM product_ingredients WHERE inventory_id = i.inventory_id)
              OR EXISTS (SELECT 1 FROM variant_ingredients WHERE inventory_id = i.inventory_id)
              OR EXISTS (SELECT 1 FROM additions WHERE inventory_id = i.inventory_id AND is_active = TRUE)) AS is_used,
            EXISTS (SELECT 1 FROM inventory_packaging WHERE inventory_id = i.inventory_id AND is_archived = FALSE) AS has_packaging,
            EXISTS (SELECT 1 FROM inventory c WHERE c.derived_from_inventory_id = i.inventory_id AND c.is_archived = FALSE) AS has_portions
          FROM inventory i
          WHERE i.inventory_id = $1 AND i.is_archived = FALSE
          FOR UPDATE OF i
        `, [inventoryId]);
        if (currentResult.rowCount === 0) {
          await client.query("ROLLBACK");
          return NextResponse.json({ error: "Inventory item not found." }, { status: 404 });
        }
        const current = currentResult.rows[0];
        if (current.derived_from_inventory_id) {
          await client.query("ROLLBACK");
          return NextResponse.json({ error: "This item is a portion of another item. Edit it with \"Edit portion\" instead." }, { status: 409 });
        }
        if (resolvedUnit.label !== current.unit_of_measure && (current.is_used || current.has_packaging || current.has_portions)) {
          await client.query("ROLLBACK");
          return NextResponse.json({ error: "The unit cannot change while products, add-ons, packages or portions are measured in it." }, { status: 409 });
        }
        const quantityBefore = Number(current.quantity);
        const quantityAfter = newQuantity ?? quantityBefore;
        await client.query(`
          UPDATE inventory
          SET ingredient_category = $1, item_name = $2, unit_of_measure = $3, is_whole_unit = $4, low_stock_threshold = $5, quantity = $6, updated_at = CURRENT_TIMESTAMP
          WHERE inventory_id = $7
        `, [ingredientCategory, itemName, resolvedUnit.label, resolvedUnit.whole, resolvedUnit.threshold, quantityAfter, inventoryId]);
        if (quantityAfter !== quantityBefore) {
          await client.query(`
            INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app)
            VALUES ($1, $2, $3, $4, 'manual_edit', $5, $6, $7, $8, 'admin')
          `, [inventoryId, itemName, ingredientCategory, resolvedUnit.label, quantityBefore, quantityAfter, quantityAfter - quantityBefore, await getAdminId()]);
        }
        await client.query("COMMIT");
        return NextResponse.json({ data: await loadInventoryItem(inventoryId) });
      } catch (detailsError) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw detailsError;
      } finally {
        client.release();
      }
    }

    // --- Branch 1a: restock by package: adds packs x contents and averages the unit cost ---
    if (body?.restock_packaging === true) {
      const packagingId = Number(body?.packaging_id);
      const packs = Number(body?.packs);
      const packPrice = body?.pack_price === undefined || body?.pack_price === null || body?.pack_price === "" ? null : Number(body.pack_price);
      if (!Number.isInteger(packagingId) || packagingId <= 0) return NextResponse.json({ error: "Choose the packaging you bought." }, { status: 400 });
      if (!Number.isInteger(packs) || packs <= 0) return NextResponse.json({ error: "Enter how many packs were bought (a whole number)." }, { status: 400 });
      if (packPrice !== null && (!Number.isFinite(packPrice) || packPrice < 0)) return NextResponse.json({ error: "The price per pack must be 0 or more." }, { status: 400 });

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        // Lock the stock item so a sale or another restock cannot change it mid-calculation.
        const locked = await client.query(`
          SELECT i.inventory_id, i.item_name, i.ingredient_category, i.unit_of_measure, i.quantity, i.unit_cost, i.derived_from_inventory_id,
            pk.packaging_name, pk.content_quantity, pk.last_pack_price
          FROM inventory_packaging pk
          JOIN inventory i ON i.inventory_id = pk.inventory_id
          WHERE pk.packaging_id = $1 AND pk.is_archived = FALSE AND i.is_archived = FALSE
          FOR UPDATE OF i
        `, [packagingId]);
        if (locked.rowCount === 0) {
          await client.query("ROLLBACK");
          return NextResponse.json({ error: "That packaging or its item no longer exists." }, { status: 404 });
        }
        const row = locked.rows[0];
        if (row.derived_from_inventory_id) {
          await client.query("ROLLBACK");
          return NextResponse.json({ error: "This item draws its stock from another item. Restock that item instead." }, { status: 409 });
        }
        const pricePerPack = packPrice ?? (row.last_pack_price === null ? null : Number(row.last_pack_price));
        const quantityBefore = Number(row.quantity);
        const addedQuantity = packs * Number(row.content_quantity);
        const costBefore = row.unit_cost === null ? null : Number(row.unit_cost);
        // Without a price the packs add stock but leave the cost unchanged.
        const costAfter = pricePerPack === null ? costBefore : weightedAverageUnitCost(quantityBefore, costBefore, addedQuantity, packs * pricePerPack);

        await client.query("UPDATE inventory SET quantity = quantity + $1, unit_cost = $2, updated_at = CURRENT_TIMESTAMP WHERE inventory_id = $3", [addedQuantity, costAfter, row.inventory_id]);
        await client.query(`
          UPDATE inventory_packaging
          SET last_pack_price = COALESCE($2, last_pack_price), last_restocked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE packaging_id = $1
        `, [packagingId, pricePerPack]);
        await client.query(`
          INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app,
            unit_cost_before, unit_cost_after, packaging_id, packaging_name, packs_added, pack_price)
          VALUES ($1, $2, $3, $4, 'restocked', $5, $6, $7, $8, 'admin', $9, $10, $11, $12, $13, $14)
        `, [row.inventory_id, row.item_name, row.ingredient_category, row.unit_of_measure, quantityBefore, quantityBefore + addedQuantity, addedQuantity, await getAdminId(),
          costBefore, costAfter, packagingId, row.packaging_name, packs, pricePerPack]);
        await client.query("COMMIT");
        return NextResponse.json({ data: await loadInventoryItem(Number(row.inventory_id)) });
      } catch (restockError) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw restockError;
      } finally {
        client.release();
      }
    }

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
        RETURNING inventory_id, ingredient_category, item_name, unit_of_measure, quantity
      `, [quantityDelta, Number(body.inventory_id)]);
      if (stockResult.rowCount === 0) {
        return NextResponse.json({ error: "Inventory item not found or quantity is invalid for its unit." }, { status: 400 });
      }
      const restockedItem = stockResult.rows[0];
      await pool.query(`
        INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app)
        VALUES ($1, $2, $3, $4, 'restocked', $5, $6, $7, $8, 'admin')
      `, [restockedItem.inventory_id, restockedItem.item_name, restockedItem.ingredient_category, restockedItem.unit_of_measure, Number(restockedItem.quantity) - quantityDelta, restockedItem.quantity, quantityDelta, await getAdminId()]);
      return NextResponse.json({ data: await loadInventoryItem(Number(restockedItem.inventory_id)) });
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
        return NextResponse.json({ error: "Category, item name, and a valid unit are required." }, { status: 400 });
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
      let replaceUnitCost = false;
      let finalUnitCost: number | null = null;
      if (wantsBound) {
        replaceUnitCost = true; // bound items derive their cost from the source item
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
        const parentQtyResult = await pool.query("SELECT quantity, unit_cost FROM inventory WHERE inventory_id = $1", [current.derived_from_inventory_id]);
        const parentQuantity = Number(parentQtyResult.rows[0]?.quantity ?? 0);
        const oldRatio = Number(current.derived_ratio);
        const available = oldRatio > 0 ? parentQuantity / oldRatio : 0;
        finalQuantity = current.is_whole_unit ? Math.floor(available) : available;
        // Likewise freeze the last derived cost (source cost x ratio) as this item's own cost.
        const parentCost = parentQtyResult.rows[0]?.unit_cost;
        replaceUnitCost = true;
        finalUnitCost = parentCost === null || parentCost === undefined ? null : Math.round(Number(parentCost) * oldRatio * 10000) / 10000;
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
          unit_cost = CASE WHEN $10::boolean THEN $11::numeric ELSE unit_cost END,
          updated_at = CURRENT_TIMESTAMP
        WHERE inventory_id = $9 AND is_archived = FALSE
        RETURNING inventory_id
      `, [ingredientCategory, itemName, resolvedUnit.label, resolvedUnit.whole, resolvedUnit.threshold, newParentId, newRatio, finalQuantity, inventoryId, replaceUnitCost, finalUnitCost]);

      if (result.rowCount === 0) {
        return NextResponse.json({ error: "Inventory item not found." }, { status: 404 });
      }

      const updatedItem = await loadInventoryItem(inventoryId);

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
    const unitCost = parseUnitCost(body?.unit_cost);
    if (!unitCost.valid) {
      return NextResponse.json({ error: "Unit cost must be a valid non-negative amount, or left blank." }, { status: 400 });
    }

    const usageResult = await pool.query(`
      SELECT quantity, unit_cost, derived_from_inventory_id, (
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
      return NextResponse.json({ error: "Items used by a product cannot be fully edited. Add stock with the plus button, or update the cost instead." }, { status: 409 });
    }
    if (usageResult.rows[0]?.derived_from_inventory_id) {
      return NextResponse.json({ error: "This item's stock is bound to another item. Use \"Edit binding\" to change it." }, { status: 409 });
    }
    const quantityBefore = Number(usageResult.rows[0].quantity);
    const costBefore = usageResult.rows[0].unit_cost === null ? null : Number(usageResult.rows[0].unit_cost);

    const result = await pool.query(`
      UPDATE inventory
      SET
        ingredient_category = $1,
        item_name = $2,
        unit_of_measure = $3,
        quantity = $4,
        low_stock_threshold = $5,
        is_whole_unit = $6,
        unit_cost = CASE WHEN $8::boolean THEN $9::numeric ELSE unit_cost END,
        updated_at = CURRENT_TIMESTAMP
      WHERE inventory_id = $7 AND is_archived = FALSE
      RETURNING inventory_id, ingredient_category, item_name, unit_of_measure
    `, [
      ingredient_category.trim(),
      item_name.trim(),
      resolvedUnit.label,
      parsedQuantity,
      resolvedUnit.threshold,
      resolvedUnit.whole,
      inventory_id,
      unitCost.value !== undefined,
      unitCost.value ?? null,
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
    if (unitCost.value !== undefined && unitCost.value !== costBefore) {
      await pool.query(`
        INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, unit_cost_before, unit_cost_after)
        VALUES ($1, $2, $3, $4, 'cost_updated', $5, $5, 0, $6, 'admin', $7, $8)
      `, [editedItem.inventory_id, editedItem.item_name, editedItem.ingredient_category, editedItem.unit_of_measure, parsedQuantity, await getAdminId(), costBefore, unitCost.value]);
    }

    return NextResponse.json({ data: await loadInventoryItem(Number(editedItem.inventory_id)) });
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
        error: `This item is used by ${productNames.length} product${productNames.length === 1 ? "" : "s"} (${preview}). Remove it from those products before archiving it.`,
      }, { status: 409 });
    }

    // Active add-ons deduct from their inventory item at checkout, so they block archiving too.
    const additionUsage = await pool.query(
      "SELECT addition_name FROM additions WHERE inventory_id = $1 AND is_active = TRUE ORDER BY addition_name ASC",
      [inventoryId]
    );
    if ((additionUsage.rowCount ?? 0) > 0) {
      const additionNames = additionUsage.rows.map((row) => row.addition_name as string);
      return NextResponse.json({
        error: `This item is used by ${additionNames.length} add-on${additionNames.length === 1 ? "" : "s"} (${additionNames.join(", ")}). Archive those add-ons first.`,
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
