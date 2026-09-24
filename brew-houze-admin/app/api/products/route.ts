import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

async function getAdminId(): Promise<number | null> {
  const session = verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  return session?.adminId ?? null;
}

type ProductRow = {
  product_id: number;
  product_name: string;
  product_description: string | null;
  product_category: string | null;
  image_url: string | null;
  image_data: string | null;
  image_mime_type: string | null;
  price: number;
  product_variant_id: number | null;
  size_label: string | null;
  temperature: "hot" | "cold" | "both" | null;
  variant_price: number | null;
  variant_inventory_id: number | null;
  variant_required_quantity: number | null;
  variant_item_name: string | null;
  variant_unit_of_measure: string | null;
  variant_has_sales: boolean | null;
  product_has_sales: boolean;
  inventory_id: number | null;
  required_quantity: number | null;
  item_name: string | null;
  unit_of_measure: string | null;
  product_ingredients: { inventoryId: number; label: string | null; qty: number; unit: string | null }[] | null;
  product_additions: { additionId: number; name: string; quantity: number; price: number; unit: string }[] | null;
};

type Product = {
  id: number;
  name: string;
  description: string;
  category: string;
  imageUrl: string;
  imageData: string;
  price: number;
  hasSales: boolean;
  variants: {
    id: number;
    size: string;
    price: number;
    temperature: "hot" | "cold" | "both";
    hasSales: boolean;
    ingredients: { inventoryId: number; label: string | null; qty: number; unit: string | null }[];
  }[];
  ingredients: {
    inventoryId: number;
    label: string | null;
    qty: number;
    unit: string | null;
  }[];
  additions: { id: number; name: string; quantity: number; price: number; unit: string }[];
};

type IngredientInput = {
  inventory_id?: unknown;
  required_quantity?: unknown;
};

type RequestBody = {
  product_name?: unknown;
  product_description?: unknown;
  product_category?: unknown;
  image_url?: unknown;
  image_data?: unknown;
  image_mime_type?: unknown;
  price?: unknown;
  ingredients?: unknown;
  variants?: unknown;
  addition_ids?: unknown;
  product_id?: unknown;
};

function mapProducts(rows: ProductRow[]): Product[] {
  const products = new Map<number, Product>();

  for (const row of rows) {
    if (!products.has(row.product_id)) {
      products.set(row.product_id, {
        id: Number(row.product_id),
        name: row.product_name,
        description: row.product_description ?? "",
        category: row.product_category ?? "",
        imageUrl: row.image_url ?? "",
        imageData: row.image_data && row.image_mime_type ? `data:${row.image_mime_type};base64,${row.image_data}` : "",
        price: Number(row.price),
        hasSales: Boolean(row.product_has_sales),
        ingredients: (row.product_ingredients ?? []).map((ingredient) => ({
          inventoryId: Number(ingredient.inventoryId),
          label: ingredient.label,
          qty: Number(ingredient.qty),
          unit: ingredient.unit,
        })),
        variants: [],
        additions: (row.product_additions ?? []).map((addition) => ({ id: Number(addition.additionId), name: addition.name, quantity: Number(addition.quantity), price: Number(addition.price), unit: addition.unit })),
      });
    }

    if (row.product_variant_id !== null) {
      const product = products.get(row.product_id);
      if (product) {
        let variant = product.variants.find((item) => item.id === Number(row.product_variant_id));
        if (!variant) {
          variant = { id: Number(row.product_variant_id), size: row.size_label ?? "", price: Number(row.variant_price ?? row.price), temperature: row.temperature ?? "both", hasSales: Boolean(row.variant_has_sales), ingredients: [] };
          product.variants.push(variant);
        }
        if (row.variant_inventory_id !== null) {
          variant.ingredients.push({ inventoryId: Number(row.variant_inventory_id), label: row.variant_item_name, qty: Number(row.variant_required_quantity), unit: row.variant_unit_of_measure });
        }
      }
    }

    if (row.inventory_id !== null) {
      const product = products.get(row.product_id);

      if (product) {
        product.ingredients.push({
          inventoryId: Number(row.inventory_id),
          label: row.item_name,
          qty: Number(row.required_quantity),
          unit: row.unit_of_measure,
        });
      }
    }
  }

  return Array.from(products.values());
}

function parseImageData(value: unknown): { data: Buffer | null; mimeType: string | null } {
  const imageData = String(value ?? "");
  const match = imageData.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return { data: null, mimeType: null };
  const data = Buffer.from(match[2], "base64");
  if (data.length > 5 * 1024 * 1024) throw new Error("Imported images must be 5 MB or smaller.");
  return { data, mimeType: match[1] };
}

export async function GET() {
  try {
    const additionTableResult = await pool.query(`
      SELECT
        to_regclass('public.product_additions') IS NOT NULL
        AND to_regclass('public.additions') IS NOT NULL
        AND to_regclass('public.inventory') IS NOT NULL AS available
    `);
    const productAdditionsExpression = additionTableResult.rows[0]?.available
      ? `(
          SELECT COALESCE(json_agg(json_build_object(
            'additionId', a.addition_id,
            'name', a.addition_name,
            'quantity', a.quantity,
            'price', a.price,
            'unit', i.unit_of_measure
          ) ORDER BY a.addition_name), '[]'::json)
          FROM product_additions pa
          JOIN additions a ON a.addition_id = pa.addition_id AND a.is_active = TRUE
          JOIN inventory i ON i.inventory_id = a.inventory_id
          WHERE pa.product_id = p.product_id
        )`
      : "'[]'::json";
    const result = await pool.query(`
      SELECT
        p.product_id,
        p.product_name,
        p.product_description,
        p.product_category,
        p.price,
        p.image_url,
        encode(p.image_data, 'base64') AS image_data,
        p.image_mime_type,
        pv.product_variant_id,
        pv.size_label,
        pv.temperature,
        pv.price AS variant_price,
        vi.inventory_id AS variant_inventory_id,
        vi.required_quantity AS variant_required_quantity,
        vi_item.item_name AS variant_item_name,
        vi_item.unit_of_measure AS variant_unit_of_measure
        ,EXISTS (
          SELECT 1 FROM sales_order_items soi
          WHERE soi.product_variant_id = pv.product_variant_id
        ) AS variant_has_sales
        ,EXISTS (
          SELECT 1 FROM sales_order_items soi
          WHERE soi.product_id = p.product_id
        ) AS product_has_sales
        ,(
          SELECT COALESCE(json_agg(json_build_object(
            'inventoryId', pi.inventory_id,
            'label', pi_item.item_name,
            'qty', pi.required_quantity,
            'unit', pi_item.unit_of_measure
          ) ORDER BY pi.product_ingredient_id), '[]'::json)
          FROM product_ingredients pi
          JOIN inventory pi_item ON pi_item.inventory_id = pi.inventory_id
          WHERE pi.product_id = p.product_id
        ) AS product_ingredients
        ,${productAdditionsExpression} AS product_additions
      FROM products p
      LEFT JOIN product_variants pv
        ON pv.product_id = p.product_id AND pv.is_archived = FALSE
      LEFT JOIN variant_ingredients vi
        ON vi.product_variant_id = pv.product_variant_id
      LEFT JOIN inventory vi_item
        ON vi_item.inventory_id = vi.inventory_id
      WHERE p.is_archived = FALSE
      ORDER BY p.product_category ASC, p.product_name ASC, pv.product_variant_id ASC, vi.variant_ingredient_id ASC
    `);

    return NextResponse.json({ data: mapProducts(result.rows) });
  } catch (error) {
    console.error("GET /api/products failed:", error);
    return NextResponse.json({ error: "Could not retrieve product data." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const client = await pool.connect();

  try {
    const body = await request.json() as RequestBody;
    const productName = String(body?.product_name ?? "").trim();
    const productDescription = String(body?.product_description ?? "").trim().slice(0, 240);
    const productCategory = String(body?.product_category ?? "").trim();
    const imageUrl = String(body?.image_url ?? "").trim();
    const importedImage = parseImageData(body?.image_data);
    const price = Number(body?.price);
    const variants = Array.isArray(body?.variants)
      ? body.variants as { size?: unknown; price?: unknown; temperature?: unknown; ingredients?: unknown }[]
      : [];
    const additionIds = Array.isArray(body?.addition_ids)
      ? Array.from(new Set(body.addition_ids.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0)))
      : [];

    if (!productName || !productCategory) {
      return NextResponse.json({ error: "Product name and category are required." }, { status: 400 });
    }

    if (!Number.isFinite(price) || price < 0) {
      return NextResponse.json({ error: "Price must be a valid non-negative number." }, { status: 500 });
    }

    const normalizedVariants = variants.map((variant) => ({
      size: String(variant.size ?? "").trim(),
      price: Number(variant.price),
      temperature: ["hot", "cold", "both"].includes(String(variant.temperature)) ? String(variant.temperature) : "both",
      ingredients: Array.isArray(variant.ingredients) ? variant.ingredients as IngredientInput[] : [],
    })).map((variant) => ({ ...variant, ingredients: variant.ingredients.map((ingredient) => ({ inventoryId: Number(ingredient.inventory_id), requiredQuantity: Number(ingredient.required_quantity) })).filter((ingredient) => Number.isInteger(ingredient.inventoryId) && ingredient.inventoryId > 0 && Number.isFinite(ingredient.requiredQuantity) && ingredient.requiredQuantity > 0) })).filter((variant) => variant.size && Number.isFinite(variant.price) && variant.price >= 0 && variant.ingredients.length > 0);
    if (normalizedVariants.length === 0) {
      return NextResponse.json({ error: "At least one variant with an ingredient is required." }, { status: 400 });
    }

    await client.query("BEGIN");

    const productResult = await client.query(`
      INSERT INTO products (product_name, product_description, product_category, price, image_url, image_data, image_mime_type)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING product_id, product_name, product_category, price, image_url
    `, [productName, productDescription, productCategory, price, imageUrl || null, importedImage.data, importedImage.mimeType]);

    const product = productResult.rows[0];

    for (const variant of normalizedVariants) {
      const variantResult = await client.query("INSERT INTO product_variants (product_id, size_label, price, temperature) VALUES ($1, $2, $3, $4) RETURNING product_variant_id", [product.product_id, variant.size, variant.price, variant.temperature]);
      for (const ingredient of variant.ingredients) {
        const inventoryResult = await client.query("SELECT inventory_id FROM inventory WHERE inventory_id = $1 AND is_archived = FALSE", [ingredient.inventoryId]);
        if (inventoryResult.rowCount === 0) throw new Error(`Inventory item ${ingredient.inventoryId} does not exist.`);
        await client.query("INSERT INTO variant_ingredients (product_variant_id, inventory_id, required_quantity) VALUES ($1, $2, $3)", [variantResult.rows[0].product_variant_id, ingredient.inventoryId, ingredient.requiredQuantity]);
      }
    }
    for (const additionId of additionIds) {
      const additionResult = await client.query(
        "INSERT INTO product_additions (product_id, addition_id) SELECT $1, addition_id FROM additions WHERE addition_id = $2 AND is_active = TRUE ON CONFLICT DO NOTHING RETURNING addition_id",
        [product.product_id, additionId]
      );
      if (additionResult.rowCount === 0) throw new Error(`Addition item ${additionId} does not exist.`);
    }

    await client.query("COMMIT");

    const result = await pool.query(`
      SELECT
        p.product_id,
        p.product_name,
        p.product_description,
        p.product_category,
        p.price,
        p.image_url,
        encode(p.image_data, 'base64') AS image_data,
        p.image_mime_type,
        pv.product_variant_id, pv.size_label, pv.temperature, pv.price AS variant_price,
        vi.inventory_id AS variant_inventory_id,
        vi.required_quantity AS variant_required_quantity,
        vi_item.item_name AS variant_item_name,
        vi_item.unit_of_measure AS variant_unit_of_measure
        ,EXISTS (
          SELECT 1 FROM sales_order_items soi
          WHERE soi.product_variant_id = pv.product_variant_id
        ) AS variant_has_sales
        ,EXISTS (
          SELECT 1 FROM sales_order_items soi
          WHERE soi.product_id = p.product_id
        ) AS product_has_sales
        ,(
          SELECT COALESCE(json_agg(json_build_object(
            'inventoryId', pi.inventory_id,
            'label', pi_item.item_name,
            'qty', pi.required_quantity,
            'unit', pi_item.unit_of_measure
          ) ORDER BY pi.product_ingredient_id), '[]'::json)
          FROM product_ingredients pi
          JOIN inventory pi_item ON pi_item.inventory_id = pi.inventory_id
          WHERE pi.product_id = p.product_id
        ) AS product_ingredients
        ,(
          SELECT COALESCE(json_agg(json_build_object('additionId', a.addition_id, 'name', a.addition_name, 'quantity', a.quantity, 'price', a.price, 'unit', i.unit_of_measure) ORDER BY a.addition_name), '[]'::json)
          FROM product_additions pa
          JOIN additions a ON a.addition_id = pa.addition_id AND a.is_active = TRUE
          JOIN inventory i ON i.inventory_id = a.inventory_id
          WHERE pa.product_id = p.product_id
        ) AS product_additions
      FROM products p
      LEFT JOIN product_variants pv ON pv.product_id = p.product_id AND pv.is_archived = FALSE
      LEFT JOIN variant_ingredients vi ON vi.product_variant_id = pv.product_variant_id
      LEFT JOIN inventory vi_item ON vi_item.inventory_id = vi.inventory_id
      WHERE p.product_id = $1
      ORDER BY pv.product_variant_id ASC, vi.variant_ingredient_id ASC
    `, [product.product_id]);

    return NextResponse.json({ data: mapProducts(result.rows)[0] }, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("POST /api/products failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create product." }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function PATCH(request: Request) {
  const client = await pool.connect();

  try {
    const body = await request.json() as RequestBody;
    const productId = Number(body?.product_id);
    const productName = String(body?.product_name ?? "").trim();
    const productDescription = String(body?.product_description ?? "").trim().slice(0, 240);
    const productCategory = String(body?.product_category ?? "").trim();
    const imageUrl = String(body?.image_url ?? "").trim();
    const importedImage = parseImageData(body?.image_data);
    const price = Number(body?.price);
    const variants = Array.isArray(body?.variants)
      ? body.variants as { size?: unknown; price?: unknown; temperature?: unknown; ingredients?: unknown }[]
      : [];
    const additionIds = Array.isArray(body?.addition_ids)
      ? Array.from(new Set(body.addition_ids.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0)))
      : [];

    if (!Number.isInteger(productId) || productId <= 0 || !productName || !productCategory) {
      return NextResponse.json({ error: "Product ID, name, and category are required." }, { status: 400 });
    }

    if (!Number.isFinite(price) || price < 0) {
      return NextResponse.json({ error: "Price must be a valid non-negative number." }, { status: 400 });
    }

    const normalizedVariants = variants.map((variant) => ({
      size: String(variant.size ?? "").trim(),
      price: Number(variant.price),
      temperature: ["hot", "cold", "both"].includes(String(variant.temperature)) ? String(variant.temperature) : "both",
      ingredients: Array.isArray(variant.ingredients) ? variant.ingredients as IngredientInput[] : [],
    })).map((variant) => ({ ...variant, ingredients: variant.ingredients.map((ingredient) => ({ inventoryId: Number(ingredient.inventory_id), requiredQuantity: Number(ingredient.required_quantity) })).filter((ingredient) => Number.isInteger(ingredient.inventoryId) && ingredient.inventoryId > 0 && Number.isFinite(ingredient.requiredQuantity) && ingredient.requiredQuantity > 0) })).filter((variant) => variant.size && Number.isFinite(variant.price) && variant.price >= 0 && variant.ingredients.length > 0);
    if (normalizedVariants.length === 0) {
      return NextResponse.json({ error: "At least one variant with an ingredient is required." }, { status: 400 });
    }

    await client.query("BEGIN");

    const productResult = await client.query(`
      UPDATE products
      SET product_name = $1, product_description = $2, product_category = $3, price = $4, image_url = $5, image_data = $6, image_mime_type = $7
      WHERE product_id = $8
      RETURNING product_id
    `, [productName, productDescription, productCategory, price, imageUrl || null, importedImage.data, importedImage.mimeType, productId]);

    if (productResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }

    await client.query("DELETE FROM product_ingredients WHERE product_id = $1", [productId]);
    await client.query("DELETE FROM product_additions WHERE product_id = $1", [productId]);
    for (const additionId of additionIds) {
      const additionResult = await client.query(
        "INSERT INTO product_additions (product_id, addition_id) SELECT $1, addition_id FROM additions WHERE addition_id = $2 AND is_active = TRUE ON CONFLICT DO NOTHING RETURNING addition_id",
        [productId, additionId]
      );
      if (additionResult.rowCount === 0) throw new Error(`Addition item ${additionId} does not exist.`);
    }

    const existingVariantsResult = await client.query(
      "SELECT product_variant_id, size_label, temperature FROM product_variants WHERE product_id = $1 AND is_archived = FALSE",
      [productId]
    );
    const existingVariants = new Map<string, number>(
      existingVariantsResult.rows.map((row) => [`${String(row.size_label).trim().toLowerCase()}|${String(row.temperature ?? "both").toLowerCase()}`, Number(row.product_variant_id)])
    );
    const submittedSizes = new Set(normalizedVariants.map((variant) => `${variant.size.toLowerCase()}|${variant.temperature}`));

    for (const existing of existingVariantsResult.rows.filter((row) => String(row.temperature ?? "both").toLowerCase() === "both")) {
      const sizeKey = String(existing.size_label).trim().toLowerCase();
      const replacementTemperature = submittedSizes.has(`${sizeKey}|hot`) ? "hot" : submittedSizes.has(`${sizeKey}|cold`) ? "cold" : null;
      if (replacementTemperature) {
        await client.query("UPDATE product_variants SET temperature = $1 WHERE product_variant_id = $2", [replacementTemperature, existing.product_variant_id]);
        existing.temperature = replacementTemperature;
        existingVariants.set(`${sizeKey}|${replacementTemperature}`, Number(existing.product_variant_id));
      }
    }

    for (const existing of existingVariantsResult.rows) {
      const existingKey = `${String(existing.size_label).trim().toLowerCase()}|${String(existing.temperature ?? "both").toLowerCase()}`;
      if (!submittedSizes.has(existingKey)) {
        await client.query(
          "UPDATE product_variants SET is_archived = TRUE, archived_at = CURRENT_TIMESTAMP, archived_by = $2 WHERE product_variant_id = $1",
          [existing.product_variant_id, await getAdminId()]
        );
      }
    }

    for (const variant of normalizedVariants) {
      const existingVariantId = existingVariants.get(`${variant.size.toLowerCase()}|${variant.temperature}`);
      let variantId: number;
      if (existingVariantId) {
        variantId = existingVariantId;
        await client.query("UPDATE product_variants SET size_label = $1, price = $2, temperature = $3 WHERE product_variant_id = $4", [variant.size, variant.price, variant.temperature, variantId]);
        await client.query("DELETE FROM variant_ingredients WHERE product_variant_id = $1", [variantId]);
      } else {
        const variantResult = await client.query("INSERT INTO product_variants (product_id, size_label, price, temperature) VALUES ($1, $2, $3, $4) RETURNING product_variant_id", [productId, variant.size, variant.price, variant.temperature]);
        variantId = Number(variantResult.rows[0].product_variant_id);
      }
      for (const ingredient of variant.ingredients) {
        const inventoryResult = await client.query("SELECT inventory_id FROM inventory WHERE inventory_id = $1 AND is_archived = FALSE", [ingredient.inventoryId]);
        if (inventoryResult.rowCount === 0) throw new Error(`Inventory item ${ingredient.inventoryId} does not exist.`);
        await client.query("INSERT INTO variant_ingredients (product_variant_id, inventory_id, required_quantity) VALUES ($1, $2, $3)", [variantId, ingredient.inventoryId, ingredient.requiredQuantity]);
      }
    }

    await client.query("COMMIT");

    const result = await pool.query(`
      SELECT
        p.product_id,
        p.product_name,
        p.product_description,
        p.product_category,
        p.price,
        p.image_url,
        encode(p.image_data, 'base64') AS image_data,
        p.image_mime_type,
        pv.product_variant_id, pv.size_label, pv.temperature, pv.price AS variant_price,
        vi.inventory_id AS variant_inventory_id,
        vi.required_quantity AS variant_required_quantity,
        vi_item.item_name AS variant_item_name,
        vi_item.unit_of_measure AS variant_unit_of_measure
        ,EXISTS (
          SELECT 1 FROM sales_order_items soi
          WHERE soi.product_variant_id = pv.product_variant_id
        ) AS variant_has_sales
        ,EXISTS (
          SELECT 1 FROM sales_order_items soi
          WHERE soi.product_id = p.product_id
        ) AS product_has_sales
        ,(
          SELECT COALESCE(json_agg(json_build_object('additionId', a.addition_id, 'name', a.addition_name, 'quantity', a.quantity, 'unit', i.unit_of_measure) ORDER BY a.addition_name), '[]'::json)
          FROM product_additions pa
          JOIN additions a ON a.addition_id = pa.addition_id AND a.is_active = TRUE
          JOIN inventory i ON i.inventory_id = a.inventory_id
          WHERE pa.product_id = p.product_id
        ) AS product_additions
      FROM products p
      LEFT JOIN product_variants pv ON pv.product_id = p.product_id AND pv.is_archived = FALSE
      LEFT JOIN variant_ingredients vi ON vi.product_variant_id = pv.product_variant_id
      LEFT JOIN inventory vi_item ON vi_item.inventory_id = vi.inventory_id
      WHERE p.product_id = $1
      ORDER BY pv.product_variant_id ASC, vi.variant_ingredient_id ASC
    `, [productId]);

    return NextResponse.json({ data: mapProducts(result.rows)[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("PATCH /api/products failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update product." }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(request: Request) {
  const client = await pool.connect();
  try {
    const body = await request.json() as RequestBody;
    const productId = Number(body?.product_id);
    const variantSize = body && "variant_size" in body && body.variant_size ? String(body.variant_size).trim() : "";
    const [requestedSize, requestedTemperature] = variantSize.split("|");
    const adminId = await getAdminId();

    if (!Number.isInteger(productId) || productId <= 0) {
      return NextResponse.json({ error: "A valid product_id is required." }, { status: 400 });
    }

    await client.query("BEGIN");
    if (variantSize) {
      const variantResult = await client.query(`
        SELECT product_variant_id
        FROM product_variants
        WHERE product_id = $1 AND LOWER(size_label) = LOWER($2)
          AND ($3 = '' OR LOWER(COALESCE(temperature, 'both')) = LOWER($3))
          AND is_archived = FALSE
        LIMIT 1
      `, [productId, requestedSize || variantSize, requestedTemperature || ""]);
      if (variantResult.rowCount === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: `${variantSize} variant was not found.` }, { status: 404 });
      }

      const variantId = Number(variantResult.rows[0].product_variant_id);
      const variantCount = await client.query(
        "SELECT COUNT(*)::int AS count FROM product_variants WHERE product_id = $1 AND is_archived = FALSE",
        [productId]
      );
      if (Number(variantCount.rows[0]?.count ?? 0) <= 1) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Archive the whole product instead of archiving its final variant." }, { status: 409 });
      }

      await client.query(
        "UPDATE product_variants SET is_archived = TRUE, archived_at = CURRENT_TIMESTAMP, archived_by = $2 WHERE product_variant_id = $1",
        [variantId, adminId]
      );
      await client.query("COMMIT");
      return NextResponse.json({ data: { product_id: productId, variant_size: variantSize } });
    }

    await client.query(
      "UPDATE product_variants SET is_archived = TRUE, archived_at = CURRENT_TIMESTAMP, archived_by = $2 WHERE product_id = $1 AND is_archived = FALSE",
      [productId, adminId]
    );

    const result = await client.query(`
      UPDATE products
      SET is_archived = TRUE, archived_at = CURRENT_TIMESTAMP, archived_by = $2
      WHERE product_id = $1
      RETURNING product_id
    `, [productId, adminId]);

    if (result.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }

    await client.query("COMMIT");
    return NextResponse.json({ data: { product_id: Number(result.rows[0].product_id) } });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("DELETE /api/products failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not archive product." }, { status: 500 });
  } finally {
    client.release();
  }
}
