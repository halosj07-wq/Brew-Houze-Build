import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

async function requireAdmin() {
  const session = verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session || String(session.role).toLowerCase() !== "admin") return null;
  return session;
}

const RESTORE_TYPES = ["product", "product_variant", "inventory", "addition", "sales_order", "employee_time_log"] as const;
type RestoreType = (typeof RESTORE_TYPES)[number];

export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Only an admin can view archives." }, { status: 403 });

  try {
    const productsResult = await pool.query(`
      SELECT p.product_id, p.product_name, p.product_category, p.price,
        TO_CHAR(p.archived_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS archived_at,
        a.full_name AS archived_by_name
      FROM products p
      LEFT JOIN admin_users a ON a.admin_id = p.archived_by
      WHERE p.is_archived = TRUE
      ORDER BY p.archived_at DESC NULLS LAST
    `);

    const variantsResult = await pool.query(`
      SELECT pv.product_variant_id, pv.size_label, pv.temperature, pv.price, p.product_id, p.product_name,
        TO_CHAR(pv.archived_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS archived_at,
        a.full_name AS archived_by_name
      FROM product_variants pv
      JOIN products p ON p.product_id = pv.product_id
      LEFT JOIN admin_users a ON a.admin_id = pv.archived_by
      WHERE pv.is_archived = TRUE AND p.is_archived = FALSE
      ORDER BY pv.archived_at DESC NULLS LAST
    `);

    const inventoryResult = await pool.query(`
      SELECT i.inventory_id, i.item_name, i.ingredient_category, i.unit_of_measure, i.quantity,
        TO_CHAR(i.archived_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS archived_at,
        a.full_name AS archived_by_name
      FROM inventory i
      LEFT JOIN admin_users a ON a.admin_id = i.archived_by
      WHERE i.is_archived = TRUE
      ORDER BY i.archived_at DESC NULLS LAST
    `);

    const additionsResult = await pool.query(`
      SELECT ad.addition_id, ad.addition_name, ad.quantity, ad.price, i.item_name, i.unit_of_measure,
        TO_CHAR(ad.archived_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS archived_at,
        a.full_name AS archived_by_name
      FROM additions ad
      JOIN inventory i ON i.inventory_id = ad.inventory_id
      LEFT JOIN admin_users a ON a.admin_id = ad.archived_by
      WHERE ad.is_active = FALSE
      ORDER BY ad.archived_at DESC NULLS LAST
    `);

    const salesOrdersResult = await pool.query(`
      SELECT so.order_id, so.total_amount, so.status,
        TO_CHAR(so.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS created_at,
        TO_CHAR(so.archived_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS archived_at,
        a.full_name AS archived_by_name,
        cashier.full_name AS cashier_name
      FROM sales_orders so
      LEFT JOIN admin_users a ON a.admin_id = so.archived_by
      LEFT JOIN admin_users cashier ON cashier.admin_id = so.cashier_admin_id
      WHERE so.is_archived = TRUE
      ORDER BY so.archived_at DESC NULLS LAST
      LIMIT 500
    `);

    const timeLogsResult = await pool.query(`
      SELECT tl.time_log_id, tl.time_in, tl.time_out, e.full_name AS employee_name,
        TO_CHAR(tl.archived_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS archived_at,
        a.full_name AS archived_by_name
      FROM employee_time_logs tl
      JOIN admin_users e ON e.admin_id = tl.admin_id
      LEFT JOIN admin_users a ON a.admin_id = tl.archived_by
      WHERE tl.is_archived = TRUE
      ORDER BY tl.archived_at DESC NULLS LAST
      LIMIT 500
    `);

    return NextResponse.json({
      data: {
        products: productsResult.rows.map((row) => ({
          id: Number(row.product_id),
          name: row.product_name,
          category: row.product_category,
          price: Number(row.price),
          archivedAt: row.archived_at,
          archivedBy: row.archived_by_name,
        })),
        productVariants: variantsResult.rows.map((row) => ({
          id: Number(row.product_variant_id),
          productId: Number(row.product_id),
          productName: row.product_name,
          size: row.size_label,
          temperature: row.temperature,
          price: Number(row.price),
          archivedAt: row.archived_at,
          archivedBy: row.archived_by_name,
        })),
        inventory: inventoryResult.rows.map((row) => ({
          id: Number(row.inventory_id),
          itemName: row.item_name,
          category: row.ingredient_category,
          unit: row.unit_of_measure,
          quantity: Number(row.quantity),
          archivedAt: row.archived_at,
          archivedBy: row.archived_by_name,
        })),
        additions: additionsResult.rows.map((row) => ({
          id: Number(row.addition_id),
          name: row.addition_name,
          itemName: row.item_name,
          unit: row.unit_of_measure,
          quantity: Number(row.quantity),
          price: Number(row.price),
          archivedAt: row.archived_at,
          archivedBy: row.archived_by_name,
        })),
        salesOrders: salesOrdersResult.rows.map((row) => ({
          id: Number(row.order_id),
          totalAmount: Number(row.total_amount),
          status: row.status,
          createdAt: row.created_at,
          cashierName: row.cashier_name,
          archivedAt: row.archived_at,
          archivedBy: row.archived_by_name,
        })),
        employeeTimeLogs: timeLogsResult.rows.map((row) => ({
          id: Number(row.time_log_id),
          employeeName: row.employee_name,
          timeIn: row.time_in,
          timeOut: row.time_out,
          archivedAt: row.archived_at,
          archivedBy: row.archived_by_name,
        })),
      },
    });
  } catch (error) {
    console.error("GET /api/archives failed:", error);
    return NextResponse.json({ error: "Could not retrieve archived records." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Only an admin can restore archived records." }, { status: 403 });

  try {
    const body = await request.json() as { type?: unknown; id?: unknown };
    const type = String(body?.type ?? "") as RestoreType;
    const id = Number(body?.id);
    if (!RESTORE_TYPES.includes(type) || !Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "A valid archive type and id are required." }, { status: 400 });
    }

    switch (type) {
      case "product": {
        const result = await pool.query(
          "UPDATE products SET is_archived = FALSE, archived_at = NULL, archived_by = NULL WHERE product_id = $1 AND is_archived = TRUE RETURNING product_id",
          [id]
        );
        if (result.rowCount === 0) return NextResponse.json({ error: "Archived product not found." }, { status: 404 });
        await pool.query(
          "UPDATE product_variants SET is_archived = FALSE, archived_at = NULL, archived_by = NULL WHERE product_id = $1 AND is_archived = TRUE",
          [id]
        );
        break;
      }
      case "product_variant": {
        const result = await pool.query(
          "UPDATE product_variants SET is_archived = FALSE, archived_at = NULL, archived_by = NULL WHERE product_variant_id = $1 AND is_archived = TRUE RETURNING product_variant_id",
          [id]
        );
        if (result.rowCount === 0) return NextResponse.json({ error: "Archived variant not found." }, { status: 404 });
        break;
      }
      case "inventory": {
        const target = await pool.query(
          "SELECT derived_from_inventory_id FROM inventory WHERE inventory_id = $1 AND is_archived = TRUE",
          [id]
        );
        if (target.rowCount === 0) return NextResponse.json({ error: "Archived inventory item not found." }, { status: 404 });
        const parentId = target.rows[0].derived_from_inventory_id;
        if (parentId) {
          const parentCheck = await pool.query("SELECT item_name, is_archived FROM inventory WHERE inventory_id = $1", [parentId]);
          if ((parentCheck.rowCount ?? 0) === 0 || parentCheck.rows[0].is_archived) {
            const parentName = parentCheck.rows[0]?.item_name;
            return NextResponse.json({ error: `Cannot restore: its source item${parentName ? ` "${parentName}"` : ""} is archived. Restore that item first.` }, { status: 409 });
          }
        }
        const result = await pool.query(
          "UPDATE inventory SET is_archived = FALSE, archived_at = NULL, archived_by = NULL WHERE inventory_id = $1 AND is_archived = TRUE RETURNING inventory_id",
          [id]
        );
        if (result.rowCount === 0) return NextResponse.json({ error: "Archived inventory item not found." }, { status: 404 });
        break;
      }
      case "addition": {
        const result = await pool.query(
          "UPDATE additions SET is_active = TRUE, archived_at = NULL, archived_by = NULL WHERE addition_id = $1 AND is_active = FALSE RETURNING addition_id",
          [id]
        );
        if (result.rowCount === 0) return NextResponse.json({ error: "Archived addition not found." }, { status: 404 });
        break;
      }
      case "sales_order": {
        const result = await pool.query(
          "UPDATE sales_orders SET is_archived = FALSE, archived_at = NULL, archived_by = NULL WHERE order_id = $1 AND is_archived = TRUE RETURNING order_id",
          [id]
        );
        if (result.rowCount === 0) return NextResponse.json({ error: "Archived sales record not found." }, { status: 404 });
        break;
      }
      case "employee_time_log": {
        const result = await pool.query(
          "UPDATE employee_time_logs SET is_archived = FALSE, archived_at = NULL, archived_by = NULL WHERE time_log_id = $1 AND is_archived = TRUE RETURNING time_log_id",
          [id]
        );
        if (result.rowCount === 0) return NextResponse.json({ error: "Archived time log not found." }, { status: 404 });
        break;
      }
    }

    return NextResponse.json({ data: { type, id } });
  } catch (error) {
    console.error("PATCH /api/archives failed:", error);
    return NextResponse.json({ error: "Could not restore the archived record." }, { status: 500 });
  }
}
