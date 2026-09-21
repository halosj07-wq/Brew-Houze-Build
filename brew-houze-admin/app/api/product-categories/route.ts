import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET() {
  try {
    const result = await pool.query(`
      SELECT category_id, category_name
      FROM product_categories
      WHERE is_active = TRUE
      ORDER BY category_name ASC
    `);
    return NextResponse.json({
      data: result.rows.map((row) => ({ id: Number(row.category_id), name: row.category_name })),
    });
  } catch (error) {
    console.error("GET /api/product-categories failed:", error);
    return NextResponse.json({ error: "Could not retrieve drink categories." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = String(body?.category_name ?? "").trim();
    if (!name) return NextResponse.json({ error: "Category name is required." }, { status: 400 });

    const result = await pool.query(`
      INSERT INTO product_categories (category_name)
      VALUES ($1)
      RETURNING category_id, category_name
    `, [name]);
    return NextResponse.json({ data: { id: Number(result.rows[0].category_id), name: result.rows[0].category_name } }, { status: 201 });
  } catch (error) {
    const pgError = error as { code?: string };
    if (pgError.code === "23505") {
      return NextResponse.json({ error: "A drink category with this name already exists." }, { status: 409 });
    }
    console.error("POST /api/product-categories failed:", error);
    return NextResponse.json({ error: "Could not create drink category." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const categoryId = Number(body?.category_id);
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      return NextResponse.json({ error: "A valid category_id is required." }, { status: 400 });
    }

    const categoryResult = await pool.query("SELECT category_name FROM product_categories WHERE category_id = $1 AND is_active = TRUE", [categoryId]);
    if (categoryResult.rowCount === 0) return NextResponse.json({ error: "Drink category not found." }, { status: 404 });
    const usageResult = await pool.query("SELECT COUNT(*)::int AS count FROM products WHERE LOWER(product_category) = LOWER($1)", [categoryResult.rows[0].category_name]);
    if (Number(usageResult.rows[0].count) > 0) {
      return NextResponse.json({ error: "This category is used by existing products and cannot be archived." }, { status: 409 });
    }

    await pool.query("UPDATE product_categories SET is_active = FALSE WHERE category_id = $1", [categoryId]);
    return NextResponse.json({ data: { category_id: categoryId } });
  } catch (error) {
    console.error("DELETE /api/product-categories failed:", error);
    return NextResponse.json({ error: "Could not archive drink category." }, { status: 500 });
  }
}
