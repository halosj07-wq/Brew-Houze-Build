import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET() {
  try {
    const result = await pool.query(`
      SELECT
        p.product_id,
        p.product_name,
        p.product_description,
        p.product_category,
        p.price,
        p.image_url,
        COALESCE((
          SELECT json_agg(json_build_object(
            'id', a.addition_id,
            'name', a.addition_name,
            'quantity', a.quantity,
            'price', a.price,
            'unit', i_addition.unit_of_measure,
            'inventoryId', a.inventory_id,
            'availableQuantity', CASE
              WHEN i_addition.derived_from_inventory_id IS NOT NULL THEN
                CASE
                  WHEN i_addition.is_whole_unit THEN FLOOR(COALESCE(i_addition_parent.quantity, 0) / i_addition.derived_ratio)
                  ELSE COALESCE(i_addition_parent.quantity, 0) / i_addition.derived_ratio
                END
              ELSE i_addition.quantity
            END
          ) ORDER BY a.addition_name)
          FROM product_additions pa
          JOIN additions a ON a.addition_id = pa.addition_id AND a.is_active = TRUE
          JOIN inventory i_addition ON i_addition.inventory_id = a.inventory_id
          LEFT JOIN inventory i_addition_parent ON i_addition_parent.inventory_id = i_addition.derived_from_inventory_id
          WHERE pa.product_id = p.product_id
        ), '[]'::json) AS additions,
        COALESCE(
          json_agg(
            json_build_object(
              'id', pv.product_variant_id,
              'size', pv.size_label,
              'temperature', pv.temperature,
              'price', pv.price,
              'maxQuantity', COALESCE((
                SELECT FLOOR(MIN(
                  (CASE
                    WHEN i.derived_from_inventory_id IS NOT NULL THEN
                      CASE
                        WHEN i.is_whole_unit THEN FLOOR(COALESCE(i_parent.quantity, 0) / i.derived_ratio)
                        ELSE COALESCE(i_parent.quantity, 0) / i.derived_ratio
                      END
                    ELSE i.quantity
                  END) / NULLIF(vi.required_quantity, 0)
                ))::int
                FROM variant_ingredients vi
                JOIN inventory i ON i.inventory_id = vi.inventory_id
                LEFT JOIN inventory i_parent ON i_parent.inventory_id = i.derived_from_inventory_id
                WHERE vi.product_variant_id = pv.product_variant_id
              ), 0),
              'available', COALESCE((
                SELECT FLOOR(MIN(
                  (CASE
                    WHEN i.derived_from_inventory_id IS NOT NULL THEN
                      CASE
                        WHEN i.is_whole_unit THEN FLOOR(COALESCE(i_parent.quantity, 0) / i.derived_ratio)
                        ELSE COALESCE(i_parent.quantity, 0) / i.derived_ratio
                      END
                    ELSE i.quantity
                  END) / NULLIF(vi.required_quantity, 0)
                ))::int
                FROM variant_ingredients vi
                JOIN inventory i ON i.inventory_id = vi.inventory_id
                LEFT JOIN inventory i_parent ON i_parent.inventory_id = i.derived_from_inventory_id
                WHERE vi.product_variant_id = pv.product_variant_id
              ), 0) > 0,
              'ingredients', COALESCE((
                SELECT json_agg(json_build_object(
                  'inventoryId', vi.inventory_id,
                  'requiredQuantity', vi.required_quantity,
                  'availableQuantity', CASE
                    WHEN i.derived_from_inventory_id IS NOT NULL THEN
                      CASE
                        WHEN i.is_whole_unit THEN FLOOR(COALESCE(i_parent.quantity, 0) / i.derived_ratio)
                        ELSE COALESCE(i_parent.quantity, 0) / i.derived_ratio
                      END
                    ELSE i.quantity
                  END
                ) ORDER BY vi.inventory_id)
                FROM variant_ingredients vi
                JOIN inventory i ON i.inventory_id = vi.inventory_id
                LEFT JOIN inventory i_parent ON i_parent.inventory_id = i.derived_from_inventory_id
                WHERE vi.product_variant_id = pv.product_variant_id
              ), '[]'::json)
            ) ORDER BY pv.product_variant_id
          ) FILTER (WHERE pv.product_variant_id IS NOT NULL),
          '[]'::json
        ) AS variants
      FROM products p
      LEFT JOIN product_variants pv ON pv.product_id = p.product_id AND pv.is_archived = FALSE
      WHERE p.is_archived = FALSE
      GROUP BY p.product_id
      ORDER BY p.product_category ASC NULLS LAST, p.product_name ASC
    `);

    const data = result.rows.map((row) => ({
      id: Number(row.product_id),
      name: row.product_name,
      description: row.product_description || "Prepared fresh by Brew Houze.",
      category: row.product_category || "Menu",
      price: Number(row.price),
      image: row.image_url || "",
      additions: row.additions ?? [],
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
