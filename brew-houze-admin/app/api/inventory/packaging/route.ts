import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSession } from "@/lib/sessions";
import { loadInventoryItem, parsePackaging } from "@/lib/inventory";
import { audited } from "@/lib/audit";

// Packagings describe how a stock item is bought (Nescafe Bean Bag 1 kg -> Coffee Bean, grams).
// They never hold stock themselves. Every response returns the updated inventory item so the
// Inventory screen can replace its row in one step.

function isUniqueViolation(error: unknown) {
  return Boolean(error && typeof error === "object" && (error as { code?: string }).code === "23505");
}

// One package per brand and type on an item ("Nescafe Coffee Bean Bag" and "Nescafe Coffee Bean Jar" can both be
// there; a second Nescafe bag cannot): a package whose name, without its size, matches. Its name, or null.
// A different size of the same package is an edit of that package, not a second one.
const stem = (name: string) => name.replace(/\s+[\d.,]+\s+\S+$/, "").toLowerCase().replace(/[^a-z0-9]/g, "");
async function samePackage(inventoryId: number, name: string, exceptId: number | null): Promise<string | null> {
  const found = await pool.query(`
    SELECT packaging_name FROM inventory_packaging
    WHERE inventory_id = $1 AND is_archived = FALSE AND ($2::int IS NULL OR packaging_id <> $2)
  `, [inventoryId, exceptId]);
  return found.rows.map((row) => String(row.packaging_name)).find((other) => stem(other) === stem(name)) ?? null;
}

async function postHandler(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  try {
    const body = await request.json();
    const inventoryId = Number(body?.inventory_id);
    if (!Number.isInteger(inventoryId) || inventoryId <= 0) return NextResponse.json({ error: "A valid inventory item is required." }, { status: 400 });

    const item = await pool.query("SELECT is_whole_unit, derived_from_inventory_id FROM inventory WHERE inventory_id = $1 AND is_archived = FALSE", [inventoryId]);
    if (item.rowCount === 0) return NextResponse.json({ error: "Inventory item not found." }, { status: 404 });
    if (item.rows[0].derived_from_inventory_id) {
      return NextResponse.json({ error: "This item draws its stock from another item, so add the packaging to that item instead." }, { status: 409 });
    }
    const parsed = parsePackaging(body, Boolean(item.rows[0].is_whole_unit));
    if (parsed.error || !parsed.value) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const same = await samePackage(inventoryId, parsed.value.name, null);
    if (same) return NextResponse.json({ error: `${same} is already listed for this item. Edit it to change the size, or pick another brand or type.` }, { status: 409 });

    await pool.query(`
      INSERT INTO inventory_packaging (inventory_id, packaging_name, brand, content_quantity, last_pack_price)
      VALUES ($1, $2, $3, $4, $5)
    `, [inventoryId, parsed.value.name, parsed.value.brand, parsed.value.contentQuantity, parsed.value.packPrice]);
    return NextResponse.json({ data: await loadInventoryItem(inventoryId) }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) return NextResponse.json({ error: "This item already has a packaging with that name." }, { status: 409 });
    console.error("POST /api/inventory/packaging failed:", error);
    return NextResponse.json({ error: "Could not add the packaging." }, { status: 500 });
  }
}

// Editing the contents only affects future restocks; stock already added stays as it is.
async function patchHandler(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  try {
    const body = await request.json();
    const packagingId = Number(body?.packaging_id);
    if (!Number.isInteger(packagingId) || packagingId <= 0) return NextResponse.json({ error: "A valid packaging is required." }, { status: 400 });

    const existing = await pool.query(`
      SELECT pk.inventory_id, i.is_whole_unit
      FROM inventory_packaging pk JOIN inventory i ON i.inventory_id = pk.inventory_id
      WHERE pk.packaging_id = $1 AND pk.is_archived = FALSE
    `, [packagingId]);
    if (existing.rowCount === 0) return NextResponse.json({ error: "Packaging not found." }, { status: 404 });
    const parsed = parsePackaging(body, Boolean(existing.rows[0].is_whole_unit));
    if (parsed.error || !parsed.value) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const same = await samePackage(Number(existing.rows[0].inventory_id), parsed.value.name, packagingId);
    if (same) return NextResponse.json({ error: `${same} is already listed for this item. Change that one instead, or pick another brand or type.` }, { status: 409 });

    await pool.query(`
      UPDATE inventory_packaging
      SET packaging_name = $2, brand = $3, content_quantity = $4, last_pack_price = $5, updated_at = CURRENT_TIMESTAMP
      WHERE packaging_id = $1
    `, [packagingId, parsed.value.name, parsed.value.brand, parsed.value.contentQuantity, parsed.value.packPrice]);
    return NextResponse.json({ data: await loadInventoryItem(Number(existing.rows[0].inventory_id)) });
  } catch (error) {
    if (isUniqueViolation(error)) return NextResponse.json({ error: "This item already has a packaging with that name." }, { status: 409 });
    console.error("PATCH /api/inventory/packaging failed:", error);
    return NextResponse.json({ error: "Could not update the packaging." }, { status: 500 });
  }
}

// Archiving only hides the packaging from restocking; past restock records keep its name.
async function deleteHandler(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  try {
    const body = await request.json();
    const packagingId = Number(body?.packaging_id);
    if (!Number.isInteger(packagingId) || packagingId <= 0) return NextResponse.json({ error: "A valid packaging is required." }, { status: 400 });
    const result = await pool.query(`
      UPDATE inventory_packaging
      SET is_archived = TRUE, archived_at = CURRENT_TIMESTAMP, archived_by = $2, updated_at = CURRENT_TIMESTAMP
      WHERE packaging_id = $1 AND is_archived = FALSE
      RETURNING inventory_id
    `, [packagingId, session.adminId]);
    if (result.rowCount === 0) return NextResponse.json({ error: "Packaging not found." }, { status: 404 });
    return NextResponse.json({ data: await loadInventoryItem(Number(result.rows[0].inventory_id)) });
  } catch (error) {
    console.error("DELETE /api/inventory/packaging failed:", error);
    return NextResponse.json({ error: "Could not archive the packaging." }, { status: 500 });
  }
}

// Every change made here goes in the audit log (lib/audit.ts).
export const POST = audited("Inventory", postHandler);
export const PATCH = audited("Inventory", patchHandler);
export const DELETE = audited("Inventory", deleteHandler);
