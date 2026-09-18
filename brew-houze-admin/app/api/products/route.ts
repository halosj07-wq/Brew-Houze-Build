import { NextResponse } from "next/server";
import pool from "@/lib/db";

type ProductRow = {
  product_id: number;
  product_name: string;
  product_category: string | null;
  image_url: string | null;
  image_data: string | null;
  image_mime_type: string | null;
  price: number;
  product_variant_id: number | null;
  size_label: string | null;
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
};

type Product = {
  id: number;
  name: string;
  category: string;
  imageUrl: string;
  imageData: string;
  price: number;
  hasSales: boolean;
  variants: {
    id: number;
    size: string;
    price: number;
    hasSales: boolean;
    ingredients: { inventoryId: number; label: string | null; qty: number; unit: string | null }[];
  }[];
  ingredients: {
    inventoryId: number;
    label: string | null;
    qty: number;
    unit: string | null;
  }[];
};

type IngredientInput = {
  inventory_id?: unknown;
  required_quantity?: unknown;
};

type RequestBody = {
  product_name?: unknown;
  product_category?: unknown;
  image_url?: unknown;
  image_data?: unknown;
  image_mime_type?: unknown;
  price?: unknown;
  ingredients?: unknown;
  variants?: unknown;
  product_id?: unknown;
};

function mapProducts(rows: ProductRow[]): Product[] {
  const products = new Map<number, Product>();

  for (const row of rows) {
    if (!products.has(row.product_id)) {
      products.set(row.product_id, {
        id: Number(row.product_id),
        name: row.product_name,
        category: row.product_category ?? "",
        imageUrl: row.image_url ?? "",
        imageData: row.image_data && row.image_mime_type ? `data:${row.image_mime_type};base64,${row.image_data}` : "",
        price: Number(row.price),
        hasSales: Boolean(row.product_has_sales),
        ingredients: [],
        variants: [],
      });
    }

    if (row.product_variant_id !== null) {
      const product = products.get(row.product_id);
      if (product) {
        let variant = product.variants.find((item) => item.id === Number(row.product_variant_id));
        if (!variant) {
          variant = { id: Number(row.product_variant_id), size: row.size_label ?? "", price: Number(row.variant_price ?? row.price), hasSales: Boolean(row.variant_has_sales), ingredients: [] };
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
    const result = await pool.query(`
      SELECT
        p.product_id,
        p.product_name,
        p.product_category,
        p.price,
        p.image_url,
        encode(p.image_data, 'base64') AS image_data,
        p.image_mime_type,
        pv.product_variant_id,
        pv.size_label,
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
      FROM products p
      LEFT JOIN product_variants pv
        ON pv.product_id = p.product_id
      LEFT JOIN variant_ingredients vi
        ON vi.product_variant_id = pv.product_variant_id
      LEFT JOIN inventory vi_item
        ON vi_item.inventory_id = vi.inventory_id
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
    const productCategory = String(body?.product_category ?? "").trim();
    const imageUrl = String(body?.image_url ?? "").trim();
    const importedImage = parseImageData(body?.image_data);
    const price = Number(body?.price);
    const variants = Array.isArray(body?.variants)
      ? body.variants as { size?: unknown; price?: unknown; ingredients?: unknown }[]
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
      ingredients: Array.isArray(variant.ingredients) ? variant.ingredients as IngredientInput[] : [],
    })).map((variant) => ({ ...variant, ingredients: variant.ingredients.map((ingredient) => ({ inventoryId: Number(ingredient.inventory_id), requiredQuantity: Number(ingredient.required_quantity) })).filter((ingredient) => Number.isInteger(ingredient.inventoryId) && ingredient.inventoryId > 0 && Number.isFinite(ingredient.requiredQuantity) && ingredient.requiredQuantity > 0) })).filter((variant) => variant.size && Number.isFinite(variant.price) && variant.price >= 0 && variant.ingredients.length > 0);
    if (normalizedVariants.length === 0) {
      return NextResponse.json({ error: "At least one variant with an ingredient is required." }, { status: 400 });
    }

    await client.query("BEGIN");

    const productResult = await client.query(`
      INSERT INTO products (product_name, product_category, price, image_url, image_data, image_mime_type)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING product_id, product_name, product_category, price, image_url
    `, [productName, productCategory, price, imageUrl || null, importedImage.data, importedImage.mimeType]);

    const product = productResult.rows[0];

    for (const variant of normalizedVariants) {
      const variantResult = await client.query("INSERT INTO product_variants (product_id, size_label, price) VALUES ($1, $2, $3) RETURNING product_variant_id", [product.product_id, variant.size, variant.price]);
      for (const ingredient of variant.ingredients) {
        const inventoryResult = await client.query("SELECT inventory_id FROM inventory WHERE inventory_id = $1", [ingredient.inventoryId]);
        if (inventoryResult.rowCount === 0) throw new Error(`Inventory item ${ingredient.inventoryId} does not exist.`);
        await client.query("INSERT INTO variant_ingredients (product_variant_id, inventory_id, required_quantity) VALUES ($1, $2, $3)", [variantResult.rows[0].product_variant_id, ingredient.inventoryId, ingredient.requiredQuantity]);
      }
    }

    await client.query("COMMIT");

    const result = await pool.query(`
      SELECT
        p.product_id,
        p.product_name,
        p.product_category,
        p.price,
        p.image_url,
        encode(p.image_data, 'base64') AS image_data,
        p.image_mime_type,
        pv.product_variant_id, pv.size_label, pv.price AS variant_price,
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
      FROM products p
      LEFT JOIN product_variants pv ON pv.product_id = p.product_id
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
    const productCategory = String(body?.product_category ?? "").trim();
    const imageUrl = String(body?.image_url ?? "").trim();
    const importedImage = parseImageData(body?.image_data);
    const price = Number(body?.price);
    const variants = Array.isArray(body?.variants)
      ? body.variants as { size?: unknown; price?: unknown; ingredients?: unknown }[]
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
      ingredients: Array.isArray(variant.ingredients) ? variant.ingredients as IngredientInput[] : [],
    })).map((variant) => ({ ...variant, ingredients: variant.ingredients.map((ingredient) => ({ inventoryId: Number(ingredient.inventory_id), requiredQuantity: Number(ingredient.required_quantity) })).filter((ingredient) => Number.isInteger(ingredient.inventoryId) && ingredient.inventoryId > 0 && Number.isFinite(ingredient.requiredQuantity) && ingredient.requiredQuantity > 0) })).filter((variant) => variant.size && Number.isFinite(variant.price) && variant.price >= 0 && variant.ingredients.length > 0);
    if (normalizedVariants.length === 0) {
      return NextResponse.json({ error: "At least one variant with an ingredient is required." }, { status: 400 });
    }

    await client.query("BEGIN");

    const productResult = await client.query(`
      UPDATE products
      SET product_name = $1, product_category = $2, price = $3, image_url = $4, image_data = $5, image_mime_type = $6
      WHERE product_id = $7
      RETURNING product_id
    `, [productName, productCategory, price, imageUrl || null, importedImage.data, importedImage.mimeType, productId]);

    if (productResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }

    await client.query("DELETE FROM product_ingredients WHERE product_id = $1", [productId]);

    const existingVariantsResult = await client.query(
      "SELECT product_variant_id, size_label FROM product_variants WHERE product_id = $1",
      [productId]
    );
    const existingVariants = new Map<string, number>(
      existingVariantsResult.rows.map((row) => [String(row.size_label).trim().toLowerCase(), Number(row.product_variant_id)])
    );
    const submittedSizes = new Set(normalizedVariants.map((variant) => variant.size.toLowerCase()));

    for (const existing of existingVariantsResult.rows) {
      const existingSize = String(existing.size_label).trim().toLowerCase();
      if (!submittedSizes.has(existingSize)) {
        const salesResult = await client.query(
          "SELECT COUNT(*)::int AS count FROM sales_order_items WHERE product_variant_id = $1",
          [existing.product_variant_id]
        );
        if (Number(salesResult.rows[0]?.count ?? 0) > 0) {
          throw new Error(`The ${existing.size_label} variant cannot be removed because it is included in completed sales.`);
        }
        await client.query("DELETE FROM variant_ingredients WHERE product_variant_id = $1", [existing.product_variant_id]);
        await client.query("DELETE FROM product_variants WHERE product_variant_id = $1", [existing.product_variant_id]);
      }
    }

    for (const variant of normalizedVariants) {
      const existingVariantId = existingVariants.get(variant.size.toLowerCase());
      let variantId: number;
      if (existingVariantId) {
        variantId = existingVariantId;
        await client.query("UPDATE product_variants SET size_label = $1, price = $2 WHERE product_variant_id = $3", [variant.size, variant.price, variantId]);
        await client.query("DELETE FROM variant_ingredients WHERE product_variant_id = $1", [variantId]);
      } else {
        const variantResult = await client.query("INSERT INTO product_variants (product_id, size_label, price) VALUES ($1, $2, $3) RETURNING product_variant_id", [productId, variant.size, variant.price]);
        variantId = Number(variantResult.rows[0].product_variant_id);
      }
      for (const ingredient of variant.ingredients) {
        const inventoryResult = await client.query("SELECT inventory_id FROM inventory WHERE inventory_id = $1", [ingredient.inventoryId]);
        if (inventoryResult.rowCount === 0) throw new Error(`Inventory item ${ingredient.inventoryId} does not exist.`);
        await client.query("INSERT INTO variant_ingredients (product_variant_id, inventory_id, required_quantity) VALUES ($1, $2, $3)", [variantId, ingredient.inventoryId, ingredient.requiredQuantity]);
      }
    }

    await client.query("COMMIT");

    const result = await pool.query(`
      SELECT
        p.product_id,
        p.product_name,
        p.product_category,
        p.price,
        p.image_url,
        encode(p.image_data, 'base64') AS image_data,
        p.image_mime_type,
        pv.product_variant_id, pv.size_label, pv.price AS variant_price,
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
      FROM products p
      LEFT JOIN product_variants pv ON pv.product_id = p.product_id
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

    if (!Number.isInteger(productId) || productId <= 0) {
      return NextResponse.json({ error: "A valid product_id is required." }, { status: 400 });
    }

    await client.query("BEGIN");
    if (variantSize) {
      const variantResult = await client.query(`
        SELECT product_variant_id
        FROM product_variants
        WHERE product_id = $1 AND LOWER(size_label) = LOWER($2)
        LIMIT 1
      `, [productId, variantSize]);
      if (variantResult.rowCount === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: `${variantSize} variant was not found.` }, { status: 404 });
      }

      const variantId = Number(variantResult.rows[0].product_variant_id);
      const salesResult = await client.query(
        "SELECT COUNT(*)::int AS count FROM sales_order_items WHERE product_variant_id = $1",
        [variantId]
      );
      if (Number(salesResult.rows[0]?.count ?? 0) > 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: `The ${variantSize} variant cannot be archived because it is included in completed sales.` }, { status: 409 });
      }
      const variantCount = await client.query(
        "SELECT COUNT(*)::int AS count FROM product_variants WHERE product_id = $1",
        [productId]
      );
      if (Number(variantCount.rows[0]?.count ?? 0) <= 1) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Archive the whole product instead of archiving its final variant." }, { status: 409 });
      }

      await client.query("DELETE FROM variant_ingredients WHERE product_variant_id = $1", [variantId]);
      await client.query("DELETE FROM product_variants WHERE product_variant_id = $1", [variantId]);
      await client.query("COMMIT");
      return NextResponse.json({ data: { product_id: productId, variant_size: variantSize } });
    }

    const salesResult = await client.query(`
      SELECT COUNT(*)::int AS count
      FROM sales_order_items
      WHERE product_id = $1
    `, [productId]);

    if (Number(salesResult.rows[0]?.count ?? 0) > 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({
        error: "This product cannot be archived because it is included in completed sales. Remove the related test sale from Finance first.",
      }, { status: 409 });
    }

    await client.query("DELETE FROM variant_ingredients WHERE product_variant_id IN (SELECT product_variant_id FROM product_variants WHERE product_id = $1)", [productId]);
    await client.query("DELETE FROM product_variants WHERE product_id = $1", [productId]);
    await client.query("DELETE FROM product_ingredients WHERE product_id = $1", [productId]);

    const result = await client.query(`
      DELETE FROM products
      WHERE product_id = $1
      RETURNING product_id
    `, [productId]);

    if (result.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }

    await client.query("COMMIT");
    return NextResponse.json({ data: { product_id: Number(result.rows[0].product_id) } });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("DELETE /api/products failed:", error);
    const pgError = error as { code?: string };
    if (pgError.code === "23503") {
      return NextResponse.json({
        error: "This product is still referenced by existing records and cannot be archived.",
      }, { status: 409 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not archive product." }, { status: 500 });
  } finally {
    client.release();
  }
}
