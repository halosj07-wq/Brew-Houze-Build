import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

type CheckoutItem = { product_variant_id: number; quantity: number };

export async function POST(request: Request) {
  const session = verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const client = await pool.connect();
  try {
    const body = await request.json() as { items?: unknown };
    const items = Array.isArray(body.items)
      ? body.items.map((item) => ({
          productVariantId: Number((item as CheckoutItem).product_variant_id),
          quantity: Number((item as CheckoutItem).quantity),
        })).filter((item) => Number.isInteger(item.productVariantId) && item.productVariantId > 0 && Number.isInteger(item.quantity) && item.quantity > 0)
      : [];

    if (items.length === 0) return NextResponse.json({ error: "At least one valid cart item is required." }, { status: 400 });

    const quantities = new Map<number, number>();
    for (const item of items) quantities.set(item.productVariantId, (quantities.get(item.productVariantId) ?? 0) + item.quantity);

    await client.query("BEGIN");
    const variantIds = Array.from(quantities.keys());
    const variants = await client.query(`
      SELECT pv.product_variant_id, pv.product_id, pv.price, p.product_name, pv.size_label
      FROM product_variants pv
      JOIN products p ON p.product_id = pv.product_id
      WHERE pv.product_variant_id = ANY($1::int[])
      FOR UPDATE OF pv
    `, [variantIds]);

    if (variants.rowCount !== variantIds.length) throw new Error("One or more selected products are no longer available.");

    const deductions = new Map<number, number>();
    for (const variant of variants.rows) {
      const ingredientRows = await client.query(`
        SELECT vi.inventory_id, vi.required_quantity, i.item_name, i.quantity
        FROM variant_ingredients vi
        JOIN inventory i ON i.inventory_id = vi.inventory_id
        WHERE vi.product_variant_id = $1
        FOR UPDATE OF i
      `, [variant.product_variant_id]);
      if (ingredientRows.rowCount === 0) throw new Error(`${variant.product_name} has no configured ingredients.`);
      const orderedQuantity = quantities.get(Number(variant.product_variant_id)) ?? 0;
      for (const ingredient of ingredientRows.rows) {
        const inventoryId = Number(ingredient.inventory_id);
        const deduction = Number(ingredient.required_quantity) * orderedQuantity;
        deductions.set(inventoryId, (deductions.get(inventoryId) ?? 0) + deduction);
      }
    }

    for (const [inventoryId, deduction] of deductions) {
      const result = await client.query(`
        UPDATE inventory
        SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP
        WHERE inventory_id = $2 AND quantity >= $1
        RETURNING inventory_id
      `, [deduction, inventoryId]);
      if (result.rowCount !== 1) {
        const item = await client.query("SELECT item_name FROM inventory WHERE inventory_id = $1", [inventoryId]);
        throw new Error(`Insufficient stock for ${item.rows[0]?.item_name ?? "an ingredient"}.`);
      }
    }

    // Serialize queue assignment so two cashiers cannot receive the same daily number.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('brew-houze-queue-' || CURRENT_DATE::text))");
    const queueResult = await client.query(`
      SELECT COALESCE(MAX(queue_number), 0) + 1 AS queue_number
      FROM sales_orders
      WHERE created_at >= CURRENT_DATE
        AND created_at < CURRENT_DATE + INTERVAL '1 day'
    `);
    const queueNumber = Number(queueResult.rows[0].queue_number);
    const total = variants.rows.reduce((sum: number, variant: { product_variant_id: number; price: number }) => sum + Number(variant.price) * (quantities.get(Number(variant.product_variant_id)) ?? 0), 0);
    const order = await client.query(`
      INSERT INTO sales_orders (cashier_admin_id, total_amount, status, queue_number, queue_status)
      VALUES ($1, $2, 'completed', $3, 'waiting')
      RETURNING order_id, created_at, queue_number
    `, [session.adminId, total, queueNumber]);

    for (const variant of variants.rows) {
      await client.query(`
        INSERT INTO sales_order_items (order_id, product_id, product_variant_id, quantity, unit_price)
        VALUES ($1, $2, $3, $4, $5)
      `, [order.rows[0].order_id, variant.product_id, variant.product_variant_id, quantities.get(Number(variant.product_variant_id)), variant.price]);
    }

    await client.query("COMMIT");
    return NextResponse.json({ data: { orderId: order.rows[0].order_id, queueNumber: order.rows[0].queue_number, total, createdAt: order.rows[0].created_at } });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("POST /api/checkout failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to complete checkout." }, { status: 400 });
  } finally {
    client.release();
  }
}
