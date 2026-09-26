import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { PoolClient } from "pg";
import pool from "@/lib/db";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

// Same redirection checkout uses: a bound item's quantity is moved onto its source item,
// scaled by its ratio, since bound items never carry stock of their own.
async function resolveBoundDeductions(client: PoolClient, deductions: Map<number, number>) {
  for (let depth = 0; depth < 10; depth++) {
    const ids = Array.from(deductions.keys());
    if (ids.length === 0) break;
    const bindings = await client.query(
      "SELECT inventory_id, derived_from_inventory_id, derived_ratio FROM inventory WHERE inventory_id = ANY($1::int[]) AND derived_from_inventory_id IS NOT NULL",
      [ids]
    );
    if (bindings.rowCount === 0) break;
    for (const row of bindings.rows) {
      const inventoryId = Number(row.inventory_id);
      const parentId = Number(row.derived_from_inventory_id);
      const boundQuantity = deductions.get(inventoryId) ?? 0;
      deductions.delete(inventoryId);
      deductions.set(parentId, (deductions.get(parentId) ?? 0) + boundQuantity * Number(row.derived_ratio));
    }
  }
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
    const permission = await client.query(`
      SELECT LOWER(role) AS role, COALESCE(can_void_orders, FALSE) AS can_void_orders,
        COALESCE(can_refund_orders, FALSE) AS can_refund_orders
      FROM admin_users
      WHERE admin_id = $1
    `, [session.adminId]);
    const account = permission.rows[0];
    if (!account || (account.role !== "cashier" && account.role !== "admin")) {
      return NextResponse.json({ error: "Only cashier or admin accounts can reverse orders." }, { status: 403 });
    }
    const isAdmin = account.role === "admin";
    if (action === "void" && !isAdmin && !account.can_void_orders) {
      return NextResponse.json({ error: "You do not have permission to void orders." }, { status: 403 });
    }
    if (action === "refund" && !isAdmin && !account.can_refund_orders) {
      return NextResponse.json({ error: "You do not have permission to refund orders." }, { status: 403 });
    }

    await client.query("BEGIN");
    // A void/refund is recorded in the shift it happens in (cash leaves that shift's drawer),
    // so one must be open. The share lock keeps it open until this reversal is saved.
    const shiftResult = await client.query("SELECT shift_id FROM shifts WHERE closed_at IS NULL FOR SHARE");
    if (shiftResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Open a shift before voiding or refunding an order." }, { status: 409 });
    }
    const shiftId = Number(shiftResult.rows[0].shift_id);
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

    // Restore exactly what checkout deducted, as recorded in the inventory log. Those rows are
    // already resolved to source items for bound inventory, and stay correct even if the
    // product's recipe was edited after the sale.
    const loggedRows = await client.query(`
      SELECT inventory_id, -SUM(quantity_delta) AS quantity
      FROM inventory_log
      WHERE order_id = $1 AND change_type = 'order_deduction' AND inventory_id IS NOT NULL
      GROUP BY inventory_id
    `, [orderId]);
    const hasDeductionLog = (await client.query(
      "SELECT 1 FROM inventory_log WHERE order_id = $1 AND change_type = 'order_deduction' LIMIT 1",
      [orderId]
    )).rowCount !== 0;
    const restorations = new Map<number, number>();
    if (hasDeductionLog) {
      for (const row of loggedRows.rows) {
        restorations.set(Number(row.inventory_id), Number(row.quantity));
      }
    } else {
      // Orders placed before the inventory log existed: fall back to the current recipe,
      // redirecting bound items onto their source item the same way checkout does.
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
      for (const row of inventoryRows.rows) {
        const inventoryId = Number(row.inventory_id);
        restorations.set(inventoryId, (restorations.get(inventoryId) ?? 0) + Number(row.quantity));
      }
      await resolveBoundDeductions(client, restorations);
    }
    const restorationDetails = new Map<number, { itemName: string; category: string; unit: string; quantityBefore: number; quantityAfter: number }>();
    for (const [inventoryId, quantity] of Array.from(restorations).sort(([a], [b]) => a - b)) {
      if (!(quantity > 0)) continue;
      const restored = await client.query(`
        UPDATE inventory
        SET quantity = quantity + $1, updated_at = CURRENT_TIMESTAMP
        WHERE inventory_id = $2
        RETURNING item_name, ingredient_category, unit_of_measure, quantity
      `, [quantity, inventoryId]);
      const row = restored.rows[0];
      if (row) {
        restorationDetails.set(inventoryId, {
          itemName: row.item_name,
          category: row.ingredient_category,
          unit: row.unit_of_measure,
          quantityAfter: Number(row.quantity),
          quantityBefore: Number(row.quantity) - quantity,
        });
      }
    }

    const updated = await client.query(`
      UPDATE sales_orders
      SET status = CASE WHEN $2 = 'void' THEN 'voided' ELSE 'refunded' END,
          queue_status = 'flushed',
          reversed_by_admin_id = $3,
          reversed_at = CURRENT_TIMESTAMP,
          reversal_type = $2,
          reversed_shift_id = $4
      WHERE order_id = $1
      RETURNING order_id, status, total_amount
    `, [orderId, action, session.adminId, shiftId]);

    for (const [inventoryId, detail] of restorationDetails) {
      await client.query(`
        INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, order_id, admin_id, source_app)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'cashier')
      `, [inventoryId, detail.itemName, detail.category, detail.unit, action === "void" ? "void_restore" : "refund_restore", detail.quantityBefore, detail.quantityAfter, detail.quantityAfter - detail.quantityBefore, orderId, session.adminId]);
    }
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
