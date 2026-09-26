import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSession } from "@/lib/sessions";

async function requireAdmin() {
  const session = await getSession();
  if (!session || String(session.role).toLowerCase() !== "admin") return null;
  return session;
}

const RESTORE_TYPES = ["product", "product_variant", "inventory", "addition", "sales_order", "employee_time_log"] as const;
type RestoreType = (typeof RESTORE_TYPES)[number];

type PurgeConfig = {
  table: string;
  pk: string;
  archivedWhere: string; // SQL fragment identifying archived rows for this table
  label: string; // human label used in messages, e.g. "product"
};

const PURGE_CONFIG: Record<RestoreType, PurgeConfig> = {
  product: { table: "products", pk: "product_id", archivedWhere: "is_archived = TRUE", label: "product" },
  product_variant: { table: "product_variants", pk: "product_variant_id", archivedWhere: "is_archived = TRUE", label: "variant" },
  inventory: { table: "inventory", pk: "inventory_id", archivedWhere: "is_archived = TRUE", label: "inventory item" },
  addition: { table: "additions", pk: "addition_id", archivedWhere: "is_active = FALSE", label: "addition" },
  sales_order: { table: "sales_orders", pk: "order_id", archivedWhere: "is_archived = TRUE", label: "sales record" },
  employee_time_log: { table: "employee_time_logs", pk: "time_log_id", archivedWhere: "is_archived = TRUE", label: "attendance log" },
};

// Postgres includes the referencing table name in the FK-violation detail message, e.g.
// `Key (product_id)=(5) is still referenced from table "sales_order_items".`
const FRIENDLY_REFERENCE_NAMES: Record<string, string> = {
  sales_order_items: "past sales records",
  sales_order_item_additions: "past sales records",
  variant_ingredients: "a product recipe",
  product_ingredients: "a product recipe",
  additions: "an add-on",
  product_additions: "a product's add-on list",
  inventory: "another bound inventory item",
};

function friendlyForeignKeyError(error: unknown, label: string): string | null {
  if (!error || typeof error !== "object" || (error as { code?: string }).code !== "23503") return null;
  const detail = String((error as { detail?: unknown }).detail ?? "");
  const match = detail.match(/is still referenced from table "([^"]+)"/);
  const referencing = match ? FRIENDLY_REFERENCE_NAMES[match[1]] ?? match[1] : "other existing records";
  return `This ${label} cannot be permanently deleted because it is still referenced by ${referencing}. It will remain in Archives until those references are removed.`;
}

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
          "UPDATE inventory SET is_archived = FALSE, archived_at = NULL, archived_by = NULL WHERE inventory_id = $1 AND is_archived = TRUE RETURNING inventory_id, item_name, ingredient_category, unit_of_measure, quantity",
          [id]
        );
        if (result.rowCount === 0) return NextResponse.json({ error: "Archived inventory item not found." }, { status: 404 });
        const restoredItem = result.rows[0];
        await pool.query(`
          INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, note)
          VALUES ($1, $2, $3, $4, 'restored', $5, $5, 0, $6, 'admin', 'Restored from archive')
        `, [restoredItem.inventory_id, restoredItem.item_name, restoredItem.ingredient_category, restoredItem.unit_of_measure, restoredItem.quantity, session.adminId ?? null]);
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

// Permanently and irreversibly removes archived record(s). Supports a single record
// (`{ type, id }`) or clearing every archived record of a type (`{ type, clear_all: true }`).
export async function DELETE(request: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Only an admin can permanently delete archived records." }, { status: 403 });

  try {
    const body = await request.json() as { type?: unknown; id?: unknown; clear_all?: unknown };
    const type = String(body?.type ?? "") as RestoreType;
    if (!RESTORE_TYPES.includes(type)) {
      return NextResponse.json({ error: "A valid archive type is required." }, { status: 400 });
    }
    const config = PURGE_CONFIG[type];
    const clearAll = body?.clear_all === true;

    if (!clearAll) {
      const id = Number(body?.id);
      if (!Number.isInteger(id) || id <= 0) {
        return NextResponse.json({ error: "A valid id is required." }, { status: 400 });
      }

      if (type === "inventory") {
        const boundDependents = await pool.query(
          "SELECT item_name FROM inventory WHERE derived_from_inventory_id = $1",
          [id]
        );
        if ((boundDependents.rowCount ?? 0) > 0) {
          const names = boundDependents.rows.map((row) => row.item_name as string).join(", ");
          return NextResponse.json({ error: `This item cannot be permanently deleted because it is still the source for bound item(s) (${names}). Unbind or permanently delete those first.` }, { status: 409 });
        }
      }

      try {
        const returningCols = type === "inventory" ? `${config.pk}, item_name, ingredient_category, unit_of_measure, quantity` : config.pk;
        const result = await pool.query(
          `DELETE FROM ${config.table} WHERE ${config.pk} = $1 AND ${config.archivedWhere} RETURNING ${returningCols}`,
          [id]
        );
        if (result.rowCount === 0) {
          return NextResponse.json({ error: `Archived ${config.label} not found.` }, { status: 404 });
        }
        if (type === "inventory") {
          const purged = result.rows[0];
          // inventory_id is left NULL: the row is already gone, and the FK would reject
          // referencing a deleted id, so the item's name/category/unit text is preserved instead.
          await pool.query(`
            INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, note)
            VALUES (NULL, $1, $2, $3, 'purged', $4, 0, $5, $6, 'admin', 'Permanently deleted from archive')
          `, [purged.item_name, purged.ingredient_category, purged.unit_of_measure, purged.quantity, -Number(purged.quantity), session.adminId ?? null]);
        }
        return NextResponse.json({ data: { type, id, permanentlyDeleted: true } });
      } catch (deleteError) {
        const friendly = friendlyForeignKeyError(deleteError, config.label);
        if (friendly) return NextResponse.json({ error: friendly }, { status: 409 });
        throw deleteError;
      }
    }

    // Clear-all: attempt every archived row individually so unrelated rows still get
    // purged even if some are blocked by references elsewhere in the database.
    const idsResult = await pool.query(
      `SELECT ${config.pk} AS id${type === "inventory" ? ", item_name, ingredient_category, unit_of_measure, quantity" : ""} FROM ${config.table} WHERE ${config.archivedWhere}`
    );

    let deletedCount = 0;
    const skipped: { id: number; reason: string }[] = [];

    for (const row of idsResult.rows) {
      const id = Number(row.id);
      if (type === "inventory") {
        const boundDependents = await pool.query("SELECT 1 FROM inventory WHERE derived_from_inventory_id = $1", [id]);
        if ((boundDependents.rowCount ?? 0) > 0) {
          skipped.push({ id, reason: "still the source for a bound item" });
          continue;
        }
      }
      try {
        const result = await pool.query(
          `DELETE FROM ${config.table} WHERE ${config.pk} = $1 AND ${config.archivedWhere} RETURNING ${config.pk}`,
          [id]
        );
        if (result.rowCount ?? 0) {
          deletedCount += 1;
          if (type === "inventory") {
            await pool.query(`
              INSERT INTO inventory_log (inventory_id, item_name, ingredient_category, unit_of_measure, change_type, quantity_before, quantity_after, quantity_delta, admin_id, source_app, note)
              VALUES (NULL, $1, $2, $3, 'purged', $4, 0, $5, $6, 'admin', 'Permanently deleted from archive (bulk clear)')
            `, [row.item_name, row.ingredient_category, row.unit_of_measure, row.quantity, -Number(row.quantity), session.adminId ?? null]);
          }
        }
      } catch (deleteError) {
        const friendly = friendlyForeignKeyError(deleteError, config.label);
        skipped.push({ id, reason: friendly ?? "blocked by other existing records" });
      }
    }

    return NextResponse.json({
      data: {
        type,
        permanentlyDeleted: true,
        deletedCount,
        skippedCount: skipped.length,
        skipped,
      },
    });
  } catch (error) {
    console.error("DELETE /api/archives failed:", error);
    return NextResponse.json({ error: "Could not permanently delete the archived record(s)." }, { status: 500 });
  }
}
