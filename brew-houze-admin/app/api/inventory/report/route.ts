import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSession } from "@/lib/sessions";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Returns inventory_log rows for a date range (Asia/Manila calendar days,
// inclusive) so the admin can export a report of every stock change:
// restocks, manual edits, order deductions, void/refund restorations,
// and item creation/deletion.
export async function GET(request: Request) {
  if (!(await getSession())) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  try {
    const searchParams = new URL(request.url).searchParams;
    const end = searchParams.get("end") || new Date().toISOString().slice(0, 10);
    const start = searchParams.get("start") || new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    if (!DATE_RE.test(start) || !DATE_RE.test(end)) {
      return NextResponse.json({ error: "Dates must use YYYY-MM-DD format." }, { status: 400 });
    }
    if (start > end) {
      return NextResponse.json({ error: "Start date must not be after end date." }, { status: 400 });
    }

    const result = await pool.query(`
      SELECT
        il.log_id,
        il.inventory_id,
        il.item_name,
        il.ingredient_category,
        il.unit_of_measure,
        il.change_type,
        il.quantity_before,
        il.quantity_after,
        il.quantity_delta,
        il.unit_cost_before,
        il.unit_cost_after,
        il.order_id,
        il.source_app,
        il.shift_id,
        il.packaging_name,
        il.packs_added,
        il.pack_price,
        au.full_name AS admin_name,
        TO_CHAR(il.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS created_at
      FROM inventory_log il
      LEFT JOIN admin_users au ON au.admin_id = il.admin_id
      WHERE DATE(il.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila') BETWEEN $1 AND $2
      ORDER BY il.created_at DESC
      LIMIT 5000
    `, [start, end]);

    return NextResponse.json({ data: result.rows, start, end });
  } catch (error) {
    console.error("GET /api/inventory/report failed:", error);
    return NextResponse.json({ error: "Could not retrieve the inventory report." }, { status: 500 });
  }
}
