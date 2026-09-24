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
        COALESCE((
          SELECT json_agg(json_build_object(
            'addition_id', a.addition_id,
            'addition_name', a.addition_name,
            'quantity', a.quantity,
            'price', a.price,
            'unit_of_measure', i_addition.unit_of_measure,
            'inventory_id', a.inventory_id,
            'available_quantity', i_addition.quantity
          ) ORDER BY a.addition_name)
          FROM product_additions pa
          JOIN additions a ON a.addition_id = pa.addition_id AND a.is_active = TRUE
          JOIN inventory i_addition ON i_addition.inventory_id = a.inventory_id
          WHERE pa.product_id = p.product_id
        ), '[]'::json) AS additions,
        COALESCE(
          json_agg(
            json_build_object(
              'product_variant_id', pv.product_variant_id,
              'price', pv.price,
              'size_label', pv.size_label,
              'temperature', pv.temperature,
              'max_quantity', COALESCE((
                SELECT FLOOR(MIN(inv_check.quantity / NULLIF(vi_check.required_quantity, 0)))::int
                FROM variant_ingredients vi_check
                JOIN inventory inv_check ON inv_check.inventory_id = vi_check.inventory_id
                WHERE vi_check.product_variant_id = pv.product_variant_id
              ), 0),
              'ingredients', COALESCE((
                SELECT json_agg(json_build_object(
                  'inventory_id', vi_detail.inventory_id,
                  'required_quantity', vi_detail.required_quantity,
                  'available_quantity', inv_detail.quantity
                ) ORDER BY vi_detail.inventory_id)
                FROM variant_ingredients vi_detail
                JOIN inventory inv_detail ON inv_detail.inventory_id = vi_detail.inventory_id
                WHERE vi_detail.product_variant_id = pv.product_variant_id
              ), '[]'::json),
              'additions', COALESCE((
                SELECT json_agg(json_build_object(
                  'addition_id', a.addition_id,
                  'addition_name', a.addition_name,
                  'quantity', a.quantity,
                  'price', a.price,
                  'unit_of_measure', i_addition.unit_of_measure
                ) ORDER BY a.addition_name)
                FROM product_additions pa
                JOIN additions a ON a.addition_id = pa.addition_id AND a.is_active = TRUE
                JOIN inventory i_addition ON i_addition.inventory_id = a.inventory_id
                WHERE pa.product_id = p.product_id
              ), '[]'::json),
              'available', COALESCE((
                SELECT FLOOR(MIN(inv_check.quantity / NULLIF(vi_check.required_quantity, 0)))::int
                FROM variant_ingredients vi_check
                JOIN inventory inv_check ON inv_check.inventory_id = vi_check.inventory_id
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

    return NextResponse.json({ data: result.rows });
  } catch (error) {
    console.error("GET /api/products failed:", error);
    return NextResponse.json({ error: "Unable to load products." }, { status: 500 });
  }
}
