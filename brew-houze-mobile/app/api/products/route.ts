import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET() {
  try {
    const result = await pool.query(`
      SELECT
        p.product_id,
        p.product_name,
        p.product_category,
        p.price,
        p.image_url,
        COALESCE(
          json_agg(
            json_build_object(
              'id', pv.product_variant_id,
              'size', pv.size_label,
              'price', pv.price,
              'maxQuantity', COALESCE((
                SELECT FLOOR(MIN(i.quantity / NULLIF(vi.required_quantity, 0)))::int
                FROM variant_ingredients vi
                JOIN inventory i ON i.inventory_id = vi.inventory_id
                WHERE vi.product_variant_id = pv.product_variant_id
              ), 0),
              'available', COALESCE((
                SELECT FLOOR(MIN(i.quantity / NULLIF(vi.required_quantity, 0)))::int
                FROM variant_ingredients vi
                JOIN inventory i ON i.inventory_id = vi.inventory_id
                WHERE vi.product_variant_id = pv.product_variant_id
              ), 0) > 0,
              'ingredients', COALESCE((
                SELECT json_agg(json_build_object(
                  'inventoryId', vi.inventory_id,
                  'requiredQuantity', vi.required_quantity,
                  'availableQuantity', i.quantity
                ) ORDER BY vi.inventory_id)
                FROM variant_ingredients vi
                JOIN inventory i ON i.inventory_id = vi.inventory_id
                WHERE vi.product_variant_id = pv.product_variant_id
              ), '[]'::json)
            ) ORDER BY pv.product_variant_id
          ) FILTER (WHERE pv.product_variant_id IS NOT NULL),
          '[]'::json
        ) AS variants
      FROM products p
      LEFT JOIN product_variants pv ON pv.product_id = p.product_id
      GROUP BY p.product_id
      ORDER BY p.product_category ASC NULLS LAST, p.product_name ASC
    `);

    const data = result.rows.map((row) => ({
      id: Number(row.product_id),
      name: row.product_name,
      category: row.product_category || "Menu",
      description: "Prepared fresh by Brew Houze.",
      price: Number(row.price),
      image: row.image_url || "",
      variants: row.variants,
    }));

    return NextResponse.json({ data }, {
      headers: {
        "Cache-Control": "public, max-age=5, stale-while-revalidate=30",
      },
    });
  } catch (error) {
    console.error("GET /api/products failed:", error);
    return NextResponse.json({ error: "Could not retrieve the menu." }, { status: 500 });
  }
}
