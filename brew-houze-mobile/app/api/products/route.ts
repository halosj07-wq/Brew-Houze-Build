import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { paymongoConfigured, paymongoTestMode, PAYMONGO_MIN_AMOUNT } from "@/lib/paymongo";
import { gcashAccount, gcashMethod } from "@/lib/gcash";

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
        -- Uploaded photos are served separately (see products/[id]/image) and cached for good.
        (p.image_data IS NOT NULL) AS has_image_data,
        p.xmin::text AS image_version,
        p.product_type,
        p.station,
        -- Categories in the order they were added (the printed menu order).
        (SELECT pc.category_id FROM product_categories pc WHERE pc.category_name = p.product_category) AS category_order,
        -- Units sold in the last 30 days, for the Popular chip.
        COALESCE((
          SELECT SUM(soi.quantity) FROM sales_order_items soi JOIN sales_orders so ON so.order_id = soi.order_id
          WHERE soi.product_id = p.product_id AND so.is_archived = FALSE
            AND so.status NOT IN ('void', 'voided', 'refund', 'refunded')
            AND so.created_at >= (NOW() AT TIME ZONE 'UTC') - INTERVAL '30 days'
        ), 0)::int AS recent_sold,
        -- Barista Featured Specials (see featured-products-migration.sql).
        p.is_featured, p.badge_label, p.featured_order,
        -- Any active addition can be attached to a recipe item. Direct-sale (stock) products
        -- such as canned drinks take no additions.
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
          FROM additions a
          JOIN inventory i_addition ON i_addition.inventory_id = a.inventory_id AND i_addition.is_archived = FALSE
          LEFT JOIN inventory i_addition_parent ON i_addition_parent.inventory_id = i_addition.derived_from_inventory_id
          WHERE a.is_active = TRUE AND p.product_type = 'recipe' AND a.station = p.station
            -- Limited to some categories: only on products of those categories.
            AND (NOT EXISTS (SELECT 1 FROM addition_categories ac WHERE ac.addition_id = a.addition_id)
              OR EXISTS (SELECT 1 FROM addition_categories ac JOIN product_categories pc ON pc.category_id = ac.category_id WHERE ac.addition_id = a.addition_id AND LOWER(pc.category_name) = LOWER(p.product_category)))
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
      productType: row.product_type === "stock" ? "stock" : "recipe",
      station: row.station === "kitchen" ? "kitchen" : "bar",
      categoryOrder: row.category_order === null ? null : Number(row.category_order),
      recentSold: Number(row.recent_sold ?? 0),
      featured: Boolean(row.is_featured),
      featuredOrder: Number(row.featured_order ?? 0),
      badge: (row.badge_label as string | null) || undefined,
      image: row.has_image_data ? `/api/products/${row.product_id}/image?v=${row.image_version}` : row.image_url || "",
      additions: row.additions ?? [],
      variants: row.variants,
    }));

    // Customers can only order while a shift is open; otherwise the menu shows the café as closed.
    const shiftResult = await pool.query("SELECT EXISTS (SELECT 1 FROM shifts WHERE closed_at IS NULL) AS store_open");

    // How customers pay: GCash through PayMongo when its keys are set on this server, or (the café,
    // GCASH_METHOD=direct_qr) straight to the café's GCash QR once an admin has set it.
    let payment: Record<string, unknown> = { method: "none" };
    if (gcashMethod() === "direct_qr") {
      const account = await gcashAccount();
      if (account.hasQr) payment = { method: "gcash", direct: true, accountName: account.name, accountNumber: account.number, qrVersion: account.version };
    } else if (paymongoConfigured()) payment = { method: "gcash", testMode: paymongoTestMode(), minimumAmount: PAYMONGO_MIN_AMOUNT };
    return NextResponse.json({ data, storeOpen: Boolean(shiftResult.rows[0]?.store_open), payment }, {
      headers: {
        "Cache-Control": "public, max-age=5, stale-while-revalidate=30",
      },
    });
  } catch (error) {
    console.error("GET /api/products failed:", error);
    return NextResponse.json({ error: "Could not retrieve the menu." }, { status: 500 });
  }
}
