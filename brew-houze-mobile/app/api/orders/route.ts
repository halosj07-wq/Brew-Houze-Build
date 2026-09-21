import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import pool from "@/lib/db";

type OrderItemInput = { product_variant_id?: unknown; quantity?: unknown; addition_ids?: unknown };

function parseAdditionIds(value: unknown): number[] {
  return Array.isArray(value) ? value.map((id: unknown) => Number(id)).filter((id: number) => Number.isInteger(id) && id > 0) : [];
}

export async function POST(request: Request) {
  const client = await pool.connect();
  try {
    const body = await request.json() as { items?: unknown };
    const items = Array.isArray(body.items)
      ? body.items.map((item) => ({
          productVariantId: Number((item as OrderItemInput).product_variant_id),
          quantity: Number((item as OrderItemInput).quantity),
          additionIds: Array.from(new Set(parseAdditionIds((item as OrderItemInput).addition_ids))),
        })).filter((item) => Number.isInteger(item.productVariantId) && item.productVariantId > 0 && Number.isInteger(item.quantity) && item.quantity > 0)
      : [];
    if (items.length === 0) return NextResponse.json({ error: "At least one valid order item is required." }, { status: 400 });

    const quantities = new Map<number, number>();
    const groupedItems = new Map<string, { productVariantId: number; quantity: number; additionIds: number[] }>();
    for (const item of items) {
      quantities.set(item.productVariantId, (quantities.get(item.productVariantId) ?? 0) + item.quantity);
      const additionIds = [...item.additionIds].sort((a, b) => a - b);
      const key = `${item.productVariantId}:${additionIds.join(",")}`;
      const current = groupedItems.get(key);
      groupedItems.set(key, current ? { ...current, quantity: current.quantity + item.quantity } : { productVariantId: item.productVariantId, quantity: item.quantity, additionIds });
    }
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
    let additionTotal = 0;
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
      for (const group of Array.from(groupedItems.values()).filter((item) => item.productVariantId === Number(variant.product_variant_id))) {
        if (group.additionIds.length === 0) continue;
        const additions = await client.query(`
          SELECT a.addition_id, a.addition_name, a.inventory_id, a.quantity, a.price
          FROM product_additions pa
          JOIN additions a ON a.addition_id = pa.addition_id AND a.is_active = TRUE
          WHERE pa.product_id = $1 AND a.addition_id = ANY($2::int[])
          FOR UPDATE OF a
        `, [variant.product_id, group.additionIds]);
        if (additions.rowCount !== group.additionIds.length) throw new Error(`${variant.product_name} has an invalid addition selection.`);
        for (const addition of additions.rows) {
          additionTotal += Number(addition.price) * group.quantity;
          const deduction = Number(addition.quantity) * group.quantity;
          deductions.set(Number(addition.inventory_id), (deductions.get(Number(addition.inventory_id)) ?? 0) + deduction);
        }
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

    await client.query("SELECT pg_advisory_xact_lock(hashtext('brew-houze-queue-' || ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date)::text))");
    const queueResult = await client.query(`
      SELECT COALESCE(MAX(queue_number), 0) + 1 AS queue_number
      FROM sales_orders
      WHERE DATE(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila') = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date
    `);
    const queueNumber = Number(queueResult.rows[0].queue_number);
    const customerToken = randomUUID();
    const total = variants.rows.reduce((sum: number, variant: { product_variant_id: number; price: number }) => sum + Number(variant.price) * (quantities.get(Number(variant.product_variant_id)) ?? 0), 0) + additionTotal;
    const order = await client.query(`
      INSERT INTO sales_orders (cashier_admin_id, total_amount, status, queue_number, queue_status, order_source, customer_order_token, payment_method, received_amount, change_amount)
      VALUES (NULL, $1, 'completed', $2, 'waiting', 'online', $3, 'online', $1, 0)
      RETURNING order_id, queue_number,
        TO_CHAR(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS created_at
    `, [total, queueNumber, customerToken]);

    for (const variant of variants.rows) {
      for (const group of Array.from(groupedItems.values()).filter((item) => item.productVariantId === Number(variant.product_variant_id))) {
      await client.query(`
        INSERT INTO sales_order_items (order_id, product_id, product_variant_id, quantity, unit_price)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING order_item_id
      `, [order.rows[0].order_id, variant.product_id, variant.product_variant_id, group.quantity, variant.price]).then(async (itemResult) => {
        for (const additionId of group.additionIds) {
          await client.query(`
            INSERT INTO sales_order_item_additions (order_item_id, addition_id, quantity, unit_price)
            SELECT $1, a.addition_id, $3, a.price
            FROM additions a
            WHERE a.addition_id = $2
          `, [itemResult.rows[0].order_item_id, additionId, group.quantity]);
        }
      });
      }
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
