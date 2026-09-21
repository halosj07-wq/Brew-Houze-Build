import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

async function ensureReversalColumns() {
  await pool.query(`
    ALTER TABLE sales_orders
      ADD COLUMN IF NOT EXISTS reversed_by_admin_id INTEGER REFERENCES admin_users(admin_id),
      ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS reversal_type VARCHAR(20)
  `);
}

export async function POST(request: Request) {
  const session = verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: { order_id?: unknown; action?: unknown };
  try {
    body = await request.json() as { order_id?: unknown; action?: unknown };
  } catch {
    return NextResponse.json({ error: "A valid order action is required." }, { status: 400 });
  }

  const orderId = Number(body.order_id);
  const action = body.action;
  if (!Number.isInteger(orderId) || orderId <= 0 || (action !== "void" && action !== "refund")) {
    return NextResponse.json({ error: "A valid order_id and action are required." }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await ensureReversalColumns();
    const permission = await client.query(`
      SELECT LOWER(role) AS role, COALESCE(can_void_orders, FALSE) AS can_void_orders,
        COALESCE(can_refund_orders, FALSE) AS can_refund_orders
      FROM admin_users
      WHERE admin_id = $1
    `, [session.adminId]);
    const account = permission.rows[0];
    if (!account || account.role !== "cashier") {
      return NextResponse.json({ error: "Only cashier accounts can reverse orders." }, { status: 403 });
    }
    if (action === "void" && !account.can_void_orders) {
      return NextResponse.json({ error: "You do not have permission to void orders." }, { status: 403 });
    }
    if (action === "refund" && !account.can_refund_orders) {
      return NextResponse.json({ error: "You do not have permission to refund orders." }, { status: 403 });
    }

    await client.query("BEGIN");
    const orderResult = await client.query(`
      SELECT order_id, status, queue_status
      FROM sales_orders
      WHERE order_id = $1
      FOR UPDATE
    `, [orderId]);
    if (orderResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }
    const order = orderResult.rows[0];
    if (["void", "voided", "refund", "refunded"].includes(String(order.status).toLowerCase())) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: `Order is already ${order.status}.` }, { status: 409 });
    }

    const inventoryRows = await client.query(`
      SELECT vi.inventory_id, soi.quantity * vi.required_quantity AS quantity
      FROM sales_order_items soi
      JOIN variant_ingredients vi ON vi.product_variant_id = soi.product_variant_id
      WHERE soi.order_id = $1
      UNION ALL
      SELECT a.inventory_id, soia.quantity * a.quantity AS quantity
      FROM sales_order_items soi
      JOIN sales_order_item_additions soia ON soia.order_item_id = soi.order_item_id
      JOIN additions a ON a.addition_id = soia.addition_id
      WHERE soi.order_id = $1
    `, [orderId]);
    const restorations = new Map<number, number>();
    for (const row of inventoryRows.rows) {
      const inventoryId = Number(row.inventory_id);
      restorations.set(inventoryId, (restorations.get(inventoryId) ?? 0) + Number(row.quantity));
    }
    for (const [inventoryId, quantity] of restorations) {
      await client.query(`
        UPDATE inventory
        SET quantity = quantity + $1, updated_at = CURRENT_TIMESTAMP
        WHERE inventory_id = $2
      `, [quantity, inventoryId]);
    }

    const updated = await client.query(`
      UPDATE sales_orders
      SET status = CASE WHEN $2 = 'void' THEN 'voided' ELSE 'refunded' END,
          queue_status = 'flushed',
          reversed_by_admin_id = $3,
          reversed_at = CURRENT_TIMESTAMP,
          reversal_type = $2
      WHERE order_id = $1
      RETURNING order_id, status, total_amount
    `, [orderId, action, session.adminId]);
    await client.query("COMMIT");
    return NextResponse.json({ data: updated.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("POST /api/order-actions failed:", error);
    return NextResponse.json({ error: "Could not reverse the order." }, { status: 500 });
  } finally {
    client.release();
  }
}
