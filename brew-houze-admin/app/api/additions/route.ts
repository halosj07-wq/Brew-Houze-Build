import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET() {
  try {
    const result = await pool.query(`
      SELECT a.addition_id, a.addition_name, a.inventory_id, i.item_name,
             i.unit_of_measure, a.quantity, a.price
      FROM additions a
      JOIN inventory i ON i.inventory_id = a.inventory_id
      WHERE a.is_active = TRUE
      ORDER BY a.addition_name ASC
    `);
    return NextResponse.json({
      data: result.rows.map((row) => ({
        id: Number(row.addition_id),
        name: row.addition_name,
        inventoryId: Number(row.inventory_id),
        itemName: row.item_name,
        unit: row.unit_of_measure,
        quantity: Number(row.quantity),
        price: Number(row.price),
      })),
    });
  } catch (error) {
    console.error("GET /api/additions failed:", error);
    return NextResponse.json({ error: "Could not retrieve additions." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const additionName = String(body?.addition_name ?? "").trim();
    const inventoryId = Number(body?.inventory_id);
    const quantity = Number(body?.quantity);
    const price = Number(body?.price);
    if (!additionName || !Number.isInteger(inventoryId) || inventoryId <= 0 || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(price) || price < 0) {
      return NextResponse.json({ error: "Addition name, inventory item, quantity, and a valid non-negative price are required." }, { status: 400 });
    }

    const inventoryResult = await pool.query("SELECT inventory_id, is_whole_unit FROM inventory WHERE inventory_id = $1", [inventoryId]);
    if (inventoryResult.rowCount === 0) return NextResponse.json({ error: "Inventory item not found." }, { status: 404 });
    if (inventoryResult.rows[0].is_whole_unit && !Number.isInteger(quantity)) {
      return NextResponse.json({ error: "Pieces quantity must be a whole number." }, { status: 400 });
    }

    const result = await pool.query(`
      INSERT INTO additions (addition_name, inventory_id, quantity, price)
      VALUES ($1, $2, $3, $4)
      RETURNING addition_id, addition_name, inventory_id, quantity, price
    `, [additionName, inventoryId, quantity, price]);
    const fullResult = await pool.query(`
      SELECT a.addition_id, a.addition_name, a.inventory_id, i.item_name,
             i.unit_of_measure, a.quantity, a.price
      FROM additions a JOIN inventory i ON i.inventory_id = a.inventory_id
      WHERE a.addition_id = $1
    `, [result.rows[0].addition_id]);
    return NextResponse.json({ data: fullResult.rows[0] }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "23505") {
      return NextResponse.json({ error: "An addition with this name already exists." }, { status: 409 });
    }
    console.error("POST /api/additions failed:", error);
    return NextResponse.json({ error: "Could not create addition." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const additionId = Number(body?.addition_id);
    if (!Number.isInteger(additionId) || additionId <= 0) {
      return NextResponse.json({ error: "A valid addition_id is required." }, { status: 400 });
    }

    const usageResult = await pool.query(`
      SELECT DISTINCT p.product_name
      FROM products p
      JOIN product_additions pa ON pa.product_id = p.product_id
      WHERE pa.addition_id = $1
      ORDER BY p.product_name ASC
    `, [additionId]);

    if ((usageResult.rowCount ?? 0) > 0) {
      const productNames = usageResult.rows.map((row) => row.product_name as string);
      const preview = productNames.length > 5
        ? `${productNames.slice(0, 5).join(", ")}, and ${productNames.length - 5} more`
        : productNames.join(", ");
      return NextResponse.json({
        error: `This addition is used in ${productNames.length} product${productNames.length === 1 ? "" : "s"} (${preview}). Remove it from those products before archiving it.`,
      }, { status: 409 });
    }

    const historicalUsageResult = await pool.query(`
      SELECT 1
      FROM sales_order_item_additions
      WHERE addition_id = $1
      LIMIT 1
    `, [additionId]);
    if ((historicalUsageResult.rowCount ?? 0) > 0) {
      return NextResponse.json({
        error: "This addition is included in completed sales and cannot be permanently archived without removing historical finance details.",
      }, { status: 409 });
    }

    const result = await pool.query(`
      DELETE FROM additions
      WHERE addition_id = $1 AND is_active = TRUE
      RETURNING addition_id
    `, [additionId]);

    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Addition item not found." }, { status: 404 });
    }

    return NextResponse.json({ data: { addition_id: result.rows[0].addition_id } });
  } catch (error) {
    const pgError = error as { code?: string };
    if (pgError.code === "23503") {
      return NextResponse.json({
        error: "This addition is still referenced by a product. Remove it from that product before archiving it.",
      }, { status: 409 });
    }
    console.error("DELETE /api/additions failed:", error);
    return NextResponse.json({ error: "Could not archive addition item." }, { status: 500 });
  }
}
