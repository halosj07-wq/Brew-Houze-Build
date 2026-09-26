import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

export async function GET() {
  try {
    const session = verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const result = await pool.query(`
      SELECT
        p.product_id,
        p.product_name,
        p.product_description,
        p.product_category,
        p.image_url,
        p.product_type,
        COALESCE(
          json_agg(
            json_build_object(
              'product_variant_id', pv.product_variant_id,
              'price', pv.price,
              'size_label', pv.size_label,
              'temperature', pv.temperature,
              'max_quantity', COALESCE((
                SELECT FLOOR(MIN(
                  (CASE
                    WHEN inv_check.derived_from_inventory_id IS NOT NULL THEN
                      CASE
                        WHEN inv_check.is_whole_unit THEN FLOOR(COALESCE(inv_check_parent.quantity, 0) / inv_check.derived_ratio)
                        ELSE COALESCE(inv_check_parent.quantity, 0) / inv_check.derived_ratio
                      END
                    ELSE inv_check.quantity
                  END) / NULLIF(vi_check.required_quantity, 0)
                ))::int
                FROM variant_ingredients vi_check
                JOIN inventory inv_check ON inv_check.inventory_id = vi_check.inventory_id
                LEFT JOIN inventory inv_check_parent ON inv_check_parent.inventory_id = inv_check.derived_from_inventory_id
                WHERE vi_check.product_variant_id = pv.product_variant_id
              ), 0),
              'ingredients', COALESCE((
                SELECT json_agg(json_build_object(
                  'inventory_id', vi_detail.inventory_id,
                  'required_quantity', vi_detail.required_quantity,
                  'available_quantity', CASE
                    WHEN inv_detail.derived_from_inventory_id IS NOT NULL THEN
                      CASE
                        WHEN inv_detail.is_whole_unit THEN FLOOR(COALESCE(inv_detail_parent.quantity, 0) / inv_detail.derived_ratio)
                        ELSE COALESCE(inv_detail_parent.quantity, 0) / inv_detail.derived_ratio
                      END
                    ELSE inv_detail.quantity
                  END
                ) ORDER BY vi_detail.inventory_id)
                FROM variant_ingredients vi_detail
                JOIN inventory inv_detail ON inv_detail.inventory_id = vi_detail.inventory_id
                LEFT JOIN inventory inv_detail_parent ON inv_detail_parent.inventory_id = inv_detail.derived_from_inventory_id
                WHERE vi_detail.product_variant_id = pv.product_variant_id
              ), '[]'::json),
              'available', COALESCE((
                SELECT FLOOR(MIN(
                  (CASE
                    WHEN inv_check.derived_from_inventory_id IS NOT NULL THEN
                      CASE
                        WHEN inv_check.is_whole_unit THEN FLOOR(COALESCE(inv_check_parent.quantity, 0) / inv_check.derived_ratio)
                        ELSE COALESCE(inv_check_parent.quantity, 0) / inv_check.derived_ratio
                      END
                    ELSE inv_check.quantity
                  END) / NULLIF(vi_check.required_quantity, 0)
                ))::int
                FROM variant_ingredients vi_check
                JOIN inventory inv_check ON inv_check.inventory_id = vi_check.inventory_id
                LEFT JOIN inventory inv_check_parent ON inv_check_parent.inventory_id = inv_check.derived_from_inventory_id
                WHERE vi_check.product_variant_id = pv.product_variant_id
              ), 0) > 0
            )
            ORDER BY pv.product_variant_id
          ) FILTER (WHERE pv.product_variant_id IS NOT NULL),
          '[]'::json
        ) AS variants
      FROM products p
      LEFT JOIN product_variants pv ON pv.product_id = p.product_id AND pv.is_archived = FALSE
      WHERE p.is_archived = FALSE
      GROUP BY p.product_id
      ORDER BY p.product_category, p.product_name
    `);

    // Add-ons are punched from their own section of the POS list and attached to the selected
    // recipe item in the cart, so they are returned once rather than per product.
    const additionsResult = await pool.query(`
      SELECT
        a.addition_id,
        a.addition_name,
        a.quantity,
        a.price,
        i.unit_of_measure,
        a.inventory_id,
        CASE
          WHEN i.derived_from_inventory_id IS NOT NULL THEN
            CASE
              WHEN i.is_whole_unit THEN FLOOR(COALESCE(parent.quantity, 0) / i.derived_ratio)
              ELSE COALESCE(parent.quantity, 0) / i.derived_ratio
            END
          ELSE i.quantity
        END AS available_quantity
      FROM additions a
      JOIN inventory i ON i.inventory_id = a.inventory_id AND i.is_archived = FALSE
      LEFT JOIN inventory parent ON parent.inventory_id = i.derived_from_inventory_id
      WHERE a.is_active = TRUE
      ORDER BY a.addition_name
    `);

    return NextResponse.json({ data: result.rows, additions: additionsResult.rows });
  } catch (error) {
    console.error("GET /api/products failed:", error);
    return NextResponse.json({ error: "Unable to load products." }, { status: 500 });
  }
}
