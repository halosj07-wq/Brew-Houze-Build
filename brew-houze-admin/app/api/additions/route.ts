import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET() {
  try {
    const result = await pool.query(`
      SELECT a.addition_id, a.addition_name, a.inventory_id, i.item_name,
             i.unit_of_measure, a.quantity
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
    if (!additionName || !Number.isInteger(inventoryId) || inventoryId <= 0 || !Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json({ error: "Addition name, inventory item, and a quantity greater than zero are required." }, { status: 400 });
    }

    const inventoryResult = await pool.query("SELECT inventory_id, is_whole_unit FROM inventory WHERE inventory_id = $1", [inventoryId]);
    if (inventoryResult.rowCount === 0) return NextResponse.json({ error: "Inventory item not found." }, { status: 404 });
    if (inventoryResult.rows[0].is_whole_unit && !Number.isInteger(quantity)) {
      return NextResponse.json({ error: "Pieces quantity must be a whole number." }, { status: 400 });
    }

    const result = await pool.query(`
      INSERT INTO additions (addition_name, inventory_id, quantity)
      VALUES ($1, $2, $3)
      RETURNING addition_id, addition_name, inventory_id, quantity
    `, [additionName, inventoryId, quantity]);
    const fullResult = await pool.query(`
      SELECT a.addition_id, a.addition_name, a.inventory_id, i.item_name,
             i.unit_of_measure, a.quantity
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
