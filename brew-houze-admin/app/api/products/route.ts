import { NextResponse } from "next/server";
import type { PoolClient } from "pg";
import pool from "@/lib/db";
import { getSession } from "@/lib/sessions";
import { signalChange } from "@/lib/realtime";
import { audited } from "@/lib/audit";

async function getAdminId(): Promise<number | null> {
  const session = await getSession();
  return session?.adminId ?? null;
}

// A "recipe" product consumes several inventory components per sale (Americano).
// A "stock" product is a direct-sale item: each variant consumes exactly one inventory item
// (Coke Can x 1 piece). A "bundle" is several menu items sold together at one price (a combo,
// see bundle-products-migration.sql): its items are kept in product_bundle_items, and its one
// variant's recipe is theirs added up. All store their consumption in variant_ingredients, so
// checkout deduction, availability, and void/refund restoration are shared by every type.
type ProductType = "recipe" | "stock" | "bundle";
// Where it is made: the bar (drinks) or the kitchen (food). Each has its own queue in the staff app.
type Station = "bar" | "kitchen";
const parseStation = (value: unknown): Station => (value === "kitchen" ? "kitchen" : "bar");

type ProductRow = {
  product_id: number;
  product_name: string;
  product_description: string | null;
  product_category: string | null;
  product_type: ProductType;
  station: Station | null;
  image_url: string | null;
  has_image_data: boolean;
  image_version: string;
  price: number;
  product_variant_id: number | null;
  size_label: string | null;
  temperature: "hot" | "cold" | null;
  variant_price: number | null;
  variant_inventory_id: number | null;
  variant_required_quantity: number | null;
  variant_item_name: string | null;
  variant_unit_of_measure: string | null;
  variant_has_sales: boolean | null;
  product_has_sales: boolean;
  product_ingredients: { inventoryId: number; label: string | null; qty: number; unit: string | null }[] | null;
};

type Product = {
  // A bundle's items (menu item, its size, how many), in order.
  bundleItems?: { variantId: number; productId: number; name: string; size: string; temperature: string | null; quantity: number; price: number }[];
  id: number;
  name: string;
  description: string;
  category: string;
  productType: ProductType;
  station: Station;
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
};

type IngredientInput = {
  inventory_id?: unknown;
  required_quantity?: unknown;
};

type VariantInput = { size?: unknown; price?: unknown; temperature?: unknown; ingredients?: unknown };

type RequestBody = {
  product_name?: unknown;
  product_description?: unknown;
  product_category?: unknown;
  product_type?: unknown;
  station?: unknown;
  image_url?: unknown;
  image_data?: unknown;
  image_mime_type?: unknown;
  price?: unknown;
  ingredients?: unknown;
  variants?: unknown;
  product_id?: unknown;
  // A bundle's items: [{ variant_id, quantity }]
  bundle_items?: unknown;
};

type NormalizedVariant = {
  size: string;
  price: number;
  temperature: string | null;
  ingredients: { inventoryId: number; requiredQuantity: number }[];
};

const productSelect = `
  SELECT
    p.product_id,
    p.product_name,
    p.product_description,
    p.product_category,
    p.product_type,
    p.station,
    p.price,
    p.image_url,
    -- Uploaded photos are served by /api/products/[id]/image, not in this list: the list has a
    -- row per size and component, and a large catalog would carry every photo many times over.
    (p.image_data IS NOT NULL) AS has_image_data,
    p.xmin::text AS image_version,
    pv.product_variant_id,
    pv.size_label,
    pv.temperature,
    pv.price AS variant_price,
    vi.inventory_id AS variant_inventory_id,
    vi.required_quantity AS variant_required_quantity,
    vi_item.item_name AS variant_item_name,
    vi_item.unit_of_measure AS variant_unit_of_measure,
    EXISTS (
      SELECT 1 FROM sales_order_items soi
      WHERE soi.product_variant_id = pv.product_variant_id
    ) AS variant_has_sales,
    EXISTS (
      SELECT 1 FROM sales_order_items soi
      WHERE soi.product_id = p.product_id
    ) AS product_has_sales,
    (
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
  FROM products p
  LEFT JOIN product_variants pv
    ON pv.product_id = p.product_id AND pv.is_archived = FALSE
  LEFT JOIN variant_ingredients vi
    ON vi.product_variant_id = pv.product_variant_id
  LEFT JOIN inventory vi_item
    ON vi_item.inventory_id = vi.inventory_id
`;

function mapProducts(rows: ProductRow[]): Product[] {
  const products = new Map<number, Product>();

  for (const row of rows) {
    if (!products.has(row.product_id)) {
      products.set(row.product_id, {
        id: Number(row.product_id),
        name: row.product_name,
        description: row.product_description ?? "",
        category: row.product_category ?? "",
        productType: row.product_type === "stock" ? "stock" : row.product_type === "bundle" ? "bundle" : "recipe",
        station: parseStation(row.station),
        imageUrl: row.image_url ?? "",
        imageData: row.has_image_data ? imageLink(Number(row.product_id), row.image_version) : "",
        price: Number(row.price),
        hasSales: Boolean(row.product_has_sales),
        ingredients: (row.product_ingredients ?? []).map((ingredient) => ({
          inventoryId: Number(ingredient.inventoryId),
          label: ingredient.label,
          qty: Number(ingredient.qty),
          unit: ingredient.unit,
        })),
        variants: [],
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
  }

  return Array.from(products.values());
}

async function loadProduct(productId: number): Promise<Product | undefined> {
  const result = await pool.query(`
    ${productSelect}
    WHERE p.product_id = $1
    ORDER BY pv.product_variant_id ASC, vi.variant_ingredient_id ASC
  `, [productId]);
  const product = mapProducts(result.rows)[0];
  if (product?.productType !== "bundle") return product;
  return { ...product, bundleItems: (await bundleItemsOf([product.id])).get(product.id) ?? [] };
}

// Link to a product's uploaded photo. The version changes whenever the product row changes, so
// browsers can cache each link for good.
function imageLink(productId: number, version: string): string {
  return `/api/products/${productId}/image?v=${version}`;
}

// The admin app shrinks photos before upload (about 800 px WebP, tens of KB), so anything near
// this limit did not go through it. SVG is refused: it can carry scripts.
const MAX_IMAGE_BYTES = 1024 * 1024;
const IMAGE_TYPES = ["image/webp", "image/jpeg", "image/png"];

// What to do with the stored photo on save:
// - a data: URL is a new upload;
// - a link to a product's own image keeps it (or, when adding, copies that product's photo);
// - anything else removes it.
type ImageChange = { kind: "set"; data: Buffer; mimeType: string } | { kind: "keep"; fromProductId: number } | { kind: "clear" };
function parseImageData(value: unknown): ImageChange {
  const imageData = String(value ?? "");
  const link = imageData.match(/^\/api\/products\/(\d+)\/image(\?|$)/);
  if (link) return { kind: "keep", fromProductId: Number(link[1]) };
  const match = imageData.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return { kind: "clear" };
  if (!IMAGE_TYPES.includes(match[1])) throw new Error("Use a JPG, PNG or WebP image.");
  const data = Buffer.from(match[2], "base64");
  if (data.length > MAX_IMAGE_BYTES) throw new Error("That image is too large. Choose it again so it can be resized.");
  return { kind: "set", data, mimeType: match[1] };
}

function parseProductType(value: unknown): ProductType | null {
  if (value === undefined || value === null || value === "") return "recipe";
  return value === "recipe" || value === "stock" || value === "bundle" ? value : null;
}

// ── Bundles ──
type BundleItem = { variantId: number; quantity: number };
type BundleInput = { variant_id?: unknown; quantity?: unknown };
const BUNDLE_SIZE = "Combo";

// The items of each bundle (none before bundle-products-migration.sql), by bundle id.
async function bundleItemsOf(productIds: number[] | null): Promise<Map<number, { variantId: number; productId: number; name: string; size: string; temperature: string | null; quantity: number; price: number }[]>> {
  const items = new Map<number, { variantId: number; productId: number; name: string; size: string; temperature: string | null; quantity: number; price: number }[]>();
  try {
    const result = await pool.query(`
      SELECT b.bundle_id, b.product_variant_id, b.quantity, pv.product_id, p.product_name, pv.size_label, pv.temperature, pv.price
      FROM product_bundle_items b JOIN product_variants pv ON pv.product_variant_id = b.product_variant_id JOIN products p ON p.product_id = pv.product_id
      WHERE ($1::int[] IS NULL OR b.bundle_id = ANY($1::int[]))
      ORDER BY b.bundle_id, b.sort_order
    `, [productIds]);
    for (const row of result.rows) {
      const id = Number(row.bundle_id);
      items.set(id, [...(items.get(id) ?? []), { variantId: Number(row.product_variant_id), productId: Number(row.product_id), name: String(row.product_name), size: String(row.size_label ?? ""), temperature: (row.temperature as string | null) ?? null, quantity: Number(row.quantity), price: Number(row.price) }]);
    }
  } catch (error) {
    if ((error as { code?: string }).code !== "42P01") throw error;
  }
  return items;
}

// A bundle as sent from the menu editor: its items (2 or more in all: a menu item and its size, how many) and
// its price; its one variant's recipe is their recipes added up, and it is made where its items are (all at the
// bar: the bar; otherwise the kitchen, each item still showing at its own station in the queue).
async function buildBundle(client: PoolClient, raw: unknown, price: number, bundleId: number | null): Promise<{ items: BundleItem[]; variant: NormalizedVariant; station: Station } | { error: string }> {
  const merged = new Map<number, BundleItem>();
  for (const entry of (Array.isArray(raw) ? raw as BundleInput[] : [])) {
    const variantId = Number(entry.variant_id), quantity = Number(entry.quantity);
    if (!Number.isInteger(variantId) || variantId <= 0 || !Number.isInteger(quantity) || quantity <= 0) return { error: "Choose each item of the bundle and how many (a whole number)." };
    merged.set(variantId, { variantId, quantity: (merged.get(variantId)?.quantity ?? 0) + quantity });
  }
  const items = Array.from(merged.values());
  if (items.reduce((sum, item) => sum + item.quantity, 0) < 2) return { error: "A bundle has at least 2 items." };
  if (!Number.isFinite(price) || price < 0) return { error: "Enter the bundle's price." };
  const found = await client.query(`
    SELECT pv.product_variant_id, p.product_id, p.product_name, p.product_type, p.station
    FROM product_variants pv JOIN products p ON p.product_id = pv.product_id
    WHERE pv.product_variant_id = ANY($1::int[]) AND pv.is_archived = FALSE AND p.is_archived = FALSE
  `, [items.map((item) => item.variantId)]);
  if (found.rowCount !== items.length) return { error: "One of the bundle's items is no longer on the menu." };
  if (found.rows.some((row) => row.product_type === "bundle")) return { error: "A bundle can't contain another bundle." };
  if (bundleId !== null && found.rows.some((row) => Number(row.product_id) === bundleId)) return { error: "A bundle can't contain itself." };
  const recipe = await client.query("SELECT product_variant_id, inventory_id, required_quantity FROM variant_ingredients WHERE product_variant_id = ANY($1::int[])", [items.map((item) => item.variantId)]);
  const ingredients = new Map<number, number>();
  for (const row of recipe.rows) {
    const times = merged.get(Number(row.product_variant_id))?.quantity ?? 0;
    ingredients.set(Number(row.inventory_id), (ingredients.get(Number(row.inventory_id)) ?? 0) + Number(row.required_quantity) * times);
  }
  if (ingredients.size === 0) return { error: "The bundle's items have no recipes yet." };
  const stations = new Set(found.rows.map((row) => parseStation(row.station)));
  return {
    items,
    variant: { size: BUNDLE_SIZE, price, temperature: null, ingredients: Array.from(ingredients, ([inventoryId, requiredQuantity]) => ({ inventoryId, requiredQuantity: Math.round(requiredQuantity * 10000) / 10000 })) },
    station: stations.size === 1 && stations.has("bar") ? "bar" : "kitchen",
  };
}

async function saveBundleItems(client: PoolClient, bundleId: number, items: BundleItem[]) {
  await client.query("DELETE FROM product_bundle_items WHERE bundle_id = $1", [bundleId]);
  for (const [index, item] of items.entries()) {
    await client.query("INSERT INTO product_bundle_items (bundle_id, product_variant_id, quantity, sort_order) VALUES ($1, $2, $3, $4)", [bundleId, item.variantId, item.quantity, index]);
  }
}

// After a menu item's recipe changes, every bundle with it in gets its recipe added up again.
async function refreshBundlesWith(client: PoolClient, productId: number) {
  // (checked first: inside the save's transaction a failed query would undo the whole save)
  const ready = await client.query("SELECT to_regclass('public.product_bundle_items') IS NOT NULL AS ready");
  if (!ready.rows[0]?.ready) return;
  await client.query("DELETE FROM product_bundle_items WHERE bundle_id = $1", [productId]);
  const bundles = await client.query(`
    SELECT DISTINCT b.bundle_id FROM product_bundle_items b JOIN product_variants pv ON pv.product_variant_id = b.product_variant_id
    WHERE pv.product_id = $1
  `, [productId]);
  for (const row of bundles.rows) {
    const bundleId = Number(row.bundle_id);
    const recipe = await client.query(`
      SELECT vi.inventory_id, SUM(vi.required_quantity * b.quantity) AS quantity
      FROM product_bundle_items b JOIN variant_ingredients vi ON vi.product_variant_id = b.product_variant_id
      WHERE b.bundle_id = $1 GROUP BY vi.inventory_id
    `, [bundleId]);
    const variants = await client.query("SELECT product_variant_id FROM product_variants WHERE product_id = $1 AND is_archived = FALSE", [bundleId]);
    for (const variant of variants.rows) {
      await client.query("DELETE FROM variant_ingredients WHERE product_variant_id = $1", [variant.product_variant_id]);
      for (const line of recipe.rows) await client.query("INSERT INTO variant_ingredients (product_variant_id, inventory_id, required_quantity) VALUES ($1, $2, $3)", [variant.product_variant_id, line.inventory_id, Math.round(Number(line.quantity) * 10000) / 10000]);
    }
  }
}

// Validates and normalizes submitted variants. Recipe variants keep their hot/cold temperature
// and need at least one component; stock variants have no temperature, default to a "Regular"
// size, and must consume exactly one inventory item.
function normalizeVariants(rawVariants: unknown, productType: ProductType): { variants: NormalizedVariant[] } | { error: string } {
  const variants = Array.isArray(rawVariants) ? rawVariants as VariantInput[] : [];
  const normalized = variants.map((variant) => ({
    size: String(variant.size ?? "").trim() || (productType === "stock" ? "Regular" : ""),
    price: Number(variant.price),
    // Hot or cold; anything else (a stock item, or a plain option like With Rice) has none.
    temperature: productType !== "stock" && ["hot", "cold"].includes(String(variant.temperature)) ? String(variant.temperature) : null,
    ingredients: (Array.isArray(variant.ingredients) ? variant.ingredients as IngredientInput[] : [])
      .map((ingredient) => ({ inventoryId: Number(ingredient.inventory_id), requiredQuantity: Number(ingredient.required_quantity) }))
      .filter((ingredient) => Number.isInteger(ingredient.inventoryId) && ingredient.inventoryId > 0 && Number.isFinite(ingredient.requiredQuantity) && ingredient.requiredQuantity > 0),
  })).filter((variant) => variant.size && Number.isFinite(variant.price) && variant.price >= 0 && variant.ingredients.length > 0);

  if (normalized.length === 0) {
    return { error: productType === "stock" ? "Select the inventory item this product sells and a selling price." : "At least one variant with an ingredient is required." };
  }
  if (productType === "stock" && normalized.some((variant) => variant.ingredients.length !== 1)) {
    return { error: "A direct-sale product must deduct exactly one inventory item per sale." };
  }
  return { variants: normalized };
}

async function insertVariantComponents(client: PoolClient, variantId: number, variant: NormalizedVariant, productType: ProductType) {
  for (const ingredient of variant.ingredients) {
    const inventoryResult = await client.query("SELECT item_name, is_whole_unit FROM inventory WHERE inventory_id = $1 AND is_archived = FALSE", [ingredient.inventoryId]);
    if (inventoryResult.rowCount === 0) throw new Error(`Inventory item ${ingredient.inventoryId} does not exist.`);
    if (productType === "stock" && inventoryResult.rows[0].is_whole_unit && !Number.isInteger(ingredient.requiredQuantity)) {
      throw new Error(`${inventoryResult.rows[0].item_name} is counted in whole units, so the quantity per sale must be a whole number.`);
    }
    await client.query("INSERT INTO variant_ingredients (product_variant_id, inventory_id, required_quantity) VALUES ($1, $2, $3)", [variantId, ingredient.inventoryId, ingredient.requiredQuantity]);
  }
}

export async function GET() {
  if (!(await getSession())) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  try {
    const result = await pool.query(`
      ${productSelect}
      WHERE p.is_archived = FALSE
      ORDER BY p.product_category ASC, p.product_name ASC, pv.product_variant_id ASC, vi.variant_ingredient_id ASC
    `);

    const products = mapProducts(result.rows);
    const bundles = await bundleItemsOf(products.filter((product) => product.productType === "bundle").map((product) => product.id));
    return NextResponse.json({ data: products.map((product) => (product.productType === "bundle" ? { ...product, bundleItems: bundles.get(product.id) ?? [] } : product)) });
  } catch (error) {
    console.error("GET /api/products failed:", error);
    return NextResponse.json({ error: "Could not retrieve product data." }, { status: 500 });
  }
}

// Another menu item (not archived) with this name, ignoring case, spaces and punctuation ("Ice Coffee" = "Icecoffee"): its name, or null.
async function duplicateProductName(name: string, exceptId: number | null): Promise<string | null> {
  const found = await pool.query(
    "SELECT product_name FROM products WHERE REGEXP_REPLACE(LOWER(product_name), '[^a-z0-9]', '', 'g') = REGEXP_REPLACE(LOWER($1), '[^a-z0-9]', '', 'g') AND is_archived = FALSE AND ($2::int IS NULL OR product_id <> $2) LIMIT 1",
    [name, exceptId],
  );
  return found.rows[0]?.product_name ?? null;
}

async function postHandler(request: Request) {
  // Live screens reload once this is saved (a failed request only causes an extra reload).
  signalChange("stock");
  if (!(await getSession())) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const client = await pool.connect();

  try {
    const body = await request.json() as RequestBody;
    const productName = String(body?.product_name ?? "").trim();
    const productDescription = String(body?.product_description ?? "").trim().slice(0, 240);
    const productCategory = String(body?.product_category ?? "").trim();
    const productType = parseProductType(body?.product_type);
    const imageUrl = String(body?.image_url ?? "").trim();
    const importedImage = parseImageData(body?.image_data);
    const price = Number(body?.price);

    if (!productName || !productCategory) {
      return NextResponse.json({ error: "Product name and category are required." }, { status: 400 });
    }
    if (!productType) {
      return NextResponse.json({ error: "Product type must be recipe or stock." }, { status: 400 });
    }

    if (!Number.isFinite(price) || price < 0) {
      return NextResponse.json({ error: "Price must be a valid non-negative number." }, { status: 400 });
    }

    // A bundle: its items, its recipe added up from theirs, and where it is made
    const bundle = productType === "bundle" ? await buildBundle(client, body?.bundle_items, price, null) : null;
    if (bundle && "error" in bundle) return NextResponse.json({ error: bundle.error }, { status: 400 });
    const variantResult = bundle ? { variants: [bundle.variant] } : normalizeVariants(body?.variants, productType);
    if ("error" in variantResult) {
      return NextResponse.json({ error: variantResult.error }, { status: 400 });
    }
    const sameName = await duplicateProductName(productName, null);
    if (sameName) return NextResponse.json({ error: `${sameName} is already on the menu. Edit it instead, or use another name.` }, { status: 409 });

    await client.query("BEGIN");

    const productResult = await client.query(`
      INSERT INTO products (product_name, product_description, product_category, product_type, price, image_url, image_data, image_mime_type, station)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING product_id
    `, [productName, productDescription, productCategory, productType, price, imageUrl || null, importedImage.kind === "set" ? importedImage.data : null, importedImage.kind === "set" ? importedImage.mimeType : null, bundle && !("error" in bundle) ? bundle.station : parseStation(body?.station)]);
    if (importedImage.kind === "keep") {
      await client.query(`
        UPDATE products SET image_data = source.image_data, image_mime_type = source.image_mime_type
        FROM products source WHERE products.product_id = $1 AND source.product_id = $2
      `, [Number(productResult.rows[0].product_id), importedImage.fromProductId]);
    }

    const productId = Number(productResult.rows[0].product_id);

    for (const variant of variantResult.variants) {
      const inserted = await client.query("INSERT INTO product_variants (product_id, size_label, price, temperature) VALUES ($1, $2, $3, $4) RETURNING product_variant_id", [productId, variant.size, variant.price, variant.temperature]);
      await insertVariantComponents(client, Number(inserted.rows[0].product_variant_id), variant, productType);
    }
    if (bundle && !("error" in bundle)) await saveBundleItems(client, productId, bundle.items);

    await client.query("COMMIT");

    return NextResponse.json({ data: await loadProduct(productId) }, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("POST /api/products failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create product." }, { status: 500 });
  } finally {
    client.release();
  }
}

async function patchHandler(request: Request) {
  // Live screens reload once this is saved (a failed request only causes an extra reload).
  signalChange("stock");
  if (!(await getSession())) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const client = await pool.connect();

  try {
    const body = await request.json() as RequestBody;
    const productId = Number(body?.product_id);
    const productName = String(body?.product_name ?? "").trim();
    const productDescription = String(body?.product_description ?? "").trim().slice(0, 240);
    const productCategory = String(body?.product_category ?? "").trim();
    const productType = parseProductType(body?.product_type);
    const imageUrl = String(body?.image_url ?? "").trim();
    const importedImage = parseImageData(body?.image_data);
    const price = Number(body?.price);

    if (!Number.isInteger(productId) || productId <= 0 || !productName || !productCategory) {
      return NextResponse.json({ error: "Product ID, name, and category are required." }, { status: 400 });
    }
    if (!productType) {
      return NextResponse.json({ error: "Product type must be recipe or stock." }, { status: 400 });
    }

    if (!Number.isFinite(price) || price < 0) {
      return NextResponse.json({ error: "Price must be a valid non-negative number." }, { status: 400 });
    }

    const bundle = productType === "bundle" ? await buildBundle(client, body?.bundle_items, price, productId) : null;
    if (bundle && "error" in bundle) return NextResponse.json({ error: bundle.error }, { status: 400 });
    const variantResult = bundle ? { variants: [bundle.variant] } : normalizeVariants(body?.variants, productType);
    if ("error" in variantResult) {
      return NextResponse.json({ error: variantResult.error }, { status: 400 });
    }
    const normalizedVariants = variantResult.variants;
    const sameName = await duplicateProductName(productName, productId);
    if (sameName) return NextResponse.json({ error: `${sameName} is already on the menu. Use another name.` }, { status: 409 });

    await client.query("BEGIN");

    // A kept photo is not sent back and forth; only a new upload or a removal touches it.
    const keepImage = importedImage.kind === "keep" && importedImage.fromProductId === productId;
    const productResult = await client.query(`
      UPDATE products
      SET product_name = $1, product_description = $2, product_category = $3, product_type = $4, price = $5, image_url = $6,
        image_data = CASE WHEN $10 THEN image_data ELSE $7 END,
        image_mime_type = CASE WHEN $10 THEN image_mime_type ELSE $8 END,
        station = $11
      WHERE product_id = $9
      RETURNING product_id
    `, [productName, productDescription, productCategory, productType, price, imageUrl || null, importedImage.kind === "set" ? importedImage.data : null, importedImage.kind === "set" ? importedImage.mimeType : null, productId, keepImage, bundle && !("error" in bundle) ? bundle.station : parseStation(body?.station)]);

    if (productResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }

    await client.query("DELETE FROM product_ingredients WHERE product_id = $1", [productId]);

    // Variants are matched on size + temperature. A variant without a temperature (stock
    // products) is keyed as "both", the same way legacy rows without a temperature are.
    const existingVariantsResult = await client.query(
      "SELECT product_variant_id, size_label, temperature FROM product_variants WHERE product_id = $1 AND is_archived = FALSE",
      [productId]
    );
    const existingVariants = new Map<string, number>(
      existingVariantsResult.rows.map((row) => [`${String(row.size_label).trim().toLowerCase()}|${String(row.temperature ?? "both").toLowerCase()}`, Number(row.product_variant_id)])
    );
    const submittedSizes = new Set(normalizedVariants.map((variant) => `${variant.size.toLowerCase()}|${variant.temperature ?? "both"}`));

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
      const existingVariantId = existingVariants.get(`${variant.size.toLowerCase()}|${variant.temperature ?? "both"}`);
      let variantId: number;
      if (existingVariantId) {
        variantId = existingVariantId;
        await client.query("UPDATE product_variants SET size_label = $1, price = $2, temperature = $3 WHERE product_variant_id = $4", [variant.size, variant.price, variant.temperature, variantId]);
        await client.query("DELETE FROM variant_ingredients WHERE product_variant_id = $1", [variantId]);
      } else {
        const variantInsert = await client.query("INSERT INTO product_variants (product_id, size_label, price, temperature) VALUES ($1, $2, $3, $4) RETURNING product_variant_id", [productId, variant.size, variant.price, variant.temperature]);
        variantId = Number(variantInsert.rows[0].product_variant_id);
      }
      await insertVariantComponents(client, variantId, variant, productType);
    }
    if (bundle && !("error" in bundle)) await saveBundleItems(client, productId, bundle.items);
    else await refreshBundlesWith(client, productId);

    await client.query("COMMIT");

    return NextResponse.json({ data: await loadProduct(productId) });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("PATCH /api/products failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update product." }, { status: 500 });
  } finally {
    client.release();
  }
}

async function deleteHandler(request: Request) {
  // Live screens reload once this is saved (a failed request only causes an extra reload).
  signalChange("stock");
  if (!(await getSession())) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
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

// Every change made here goes in the audit log (lib/audit.ts).
export const POST = audited("Menu", postHandler);
export const PATCH = audited("Menu", patchHandler);
export const DELETE = audited("Menu", deleteHandler);
