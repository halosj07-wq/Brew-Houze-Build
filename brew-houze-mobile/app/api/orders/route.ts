import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import pool from "@/lib/db";

type OrderItemInput = { product_variant_id?: unknown; quantity?: unknown };

export async function POST(request: Request) {
  const client = await pool.connect();
  try {
    const body = await request.json() as { items?: unknown };
    const items = Array.isArray(body.items)
      ? body.items.map((item) => ({
          productVariantId: Number((item as OrderItemInput).product_variant_id),
          quantity: Number((item as OrderItemInput).quantity),
        })).filter((item) => Number.isInteger(item.productVariantId) && item.productVariantId > 0 && Number.isInteger(item.quantity) && item.quantity > 0)
      : [];
    if (items.length === 0) return NextResponse.json({ error: "At least one valid order item is required." }, { status: 400 });

    const quantities = new Map<number, number>();
    for (const item of items) quantities.set(item.productVariantId, (quantities.get(item.productVariantId) ?? 0) + item.quantity);
    await client.query("BEGIN");

    const variantIds = Array.from(quantities.keys());
    const variants = await client.query(`
      SELECT pv.product_variant_id, pv.product_id, pv.price, p.product_name
      FROM product_variants pv
      JOIN products p ON p.product_id = pv.product_id
      WHERE pv.product_variant_id = ANY($1::int[])
      FOR UPDATE OF pv
    `, [variantIds]);
    if (variants.rowCount !== variantIds.length) throw new Error("One or more selected products are no longer available.");

    const deductions = new Map<number, number>();
    for (const variant of variants.rows) {
      const ingredients = await client.query(`
        SELECT vi.inventory_id, vi.required_quantity, i.item_name, i.quantity
        FROM variant_ingredients vi
        JOIN inventory i ON i.inventory_id = vi.inventory_id
        WHERE vi.product_variant_id = $1
        FOR UPDATE OF i
      `, [variant.product_variant_id]);
      if (ingredients.rowCount === 0) throw new Error(`${variant.product_name} has no configured ingredients.`);
      const quantity = quantities.get(Number(variant.product_variant_id)) ?? 0;
      for (const ingredient of ingredients.rows) {
        const deduction = Number(ingredient.required_quantity) * quantity;
        deductions.set(Number(ingredient.inventory_id), (deductions.get(Number(ingredient.inventory_id)) ?? 0) + deduction);
      }
    }

    for (const [inventoryId, deduction] of deductions) {
      const updated = await client.query(`
        UPDATE inventory
        SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP
        WHERE inventory_id = $2 AND quantity >= $1
        RETURNING inventory_id
      `, [deduction, inventoryId]);
      if (updated.rowCount !== 1) {
        const item = await client.query("SELECT item_name FROM inventory WHERE inventory_id = $1", [inventoryId]);
        throw new Error(`Insufficient stock for ${item.rows[0]?.item_name ?? "an ingredient"}.`);
      }
    }

    await client.query("SELECT pg_advisory_xact_lock(hashtext('brew-houze-queue-' || CURRENT_DATE::text))");
    const queueResult = await client.query(`
      SELECT COALESCE(MAX(queue_number), 0) + 1 AS queue_number
      FROM sales_orders
      WHERE created_at >= CURRENT_DATE AND created_at < CURRENT_DATE + INTERVAL '1 day'
    `);
    const queueNumber = Number(queueResult.rows[0].queue_number);
    const customerToken = randomUUID();
    const total = variants.rows.reduce((sum: number, variant: { product_variant_id: number; price: number }) => sum + Number(variant.price) * (quantities.get(Number(variant.product_variant_id)) ?? 0), 0);
    const order = await client.query(`
      INSERT INTO sales_orders (cashier_admin_id, total_amount, status, queue_number, queue_status, order_source, customer_order_token)
      VALUES (NULL, $1, 'completed', $2, 'waiting', 'online', $3)
      RETURNING order_id, queue_number, created_at
    `, [total, queueNumber, customerToken]);

    for (const variant of variants.rows) {
      await client.query(`
        INSERT INTO sales_order_items (order_id, product_id, product_variant_id, quantity, unit_price)
        VALUES ($1, $2, $3, $4, $5)
      `, [order.rows[0].order_id, variant.product_id, variant.product_variant_id, quantities.get(Number(variant.product_variant_id)), variant.price]);
    }

    await client.query("COMMIT");
    return NextResponse.json({ data: { orderId: order.rows[0].order_id, queueNumber: order.rows[0].queue_number, trackingToken: customerToken, total, createdAt: order.rows[0].created_at } }, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("POST /api/orders failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to place order." }, { status: 400 });
  } finally {
    client.release();
  }
}
