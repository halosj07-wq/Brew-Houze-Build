import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

async function getAdminId(): Promise<number | null> {
  const session = verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  return session?.adminId ?? null;
}

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

    const inventoryResult = await pool.query("SELECT inventory_id, is_whole_unit FROM inventory WHERE inventory_id = $1 AND is_archived = FALSE", [inventoryId]);
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

    // Additions are no longer tied to specific products (any addition can be attached to any
    // recipe item in the cart), so archiving only hides it from the cashier and mobile menus.
    const historicalUsageResult = await pool.query(`
      SELECT 1
      FROM sales_order_item_additions
      WHERE addition_id = $1
      LIMIT 1
    `, [additionId]);

    const result = await pool.query(`
      UPDATE additions
      SET is_active = FALSE, archived_at = CURRENT_TIMESTAMP, archived_by = $2
      WHERE addition_id = $1 AND is_active = TRUE
      RETURNING addition_id
    `, [additionId, await getAdminId()]);

    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Addition item not found." }, { status: 404 });
    }

    return NextResponse.json({
      data: {
        addition_id: result.rows[0].addition_id,
        hadHistoricalSales: (historicalUsageResult.rowCount ?? 0) > 0,
      },
    });
  } catch (error) {
    console.error("DELETE /api/additions failed:", error);
    return NextResponse.json({ error: "Could not archive addition item." }, { status: 500 });
  }
}
