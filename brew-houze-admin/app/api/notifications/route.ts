import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSession } from "@/lib/sessions";

// The admin's bell. Nothing is stored for it: every alert is worked out from records that already
// exist, so it can never drift from them. Each alert has a stable key; which ones this device has
// seen is remembered in the browser (see NotificationBell in page.tsx).
//   stock     items out of stock or running low (current state, not an event)
//   payment   GCash payments that were paid but could not become an order
//   reversal  voids and refunds in the last 3 days
//   cash      shifts closed in the last 7 days with the drawer short or over
//   customer  customers who signed up on the mobile menu in the last 7 days

const TZ = "Asia/Manila";
const isoTz = (column: string) => `TO_CHAR(${column} AT TIME ZONE '${TZ}', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"')`;
// Columns stored without a time zone hold UTC.
const isoUtc = (column: string) => `TO_CHAR(${column} AT TIME ZONE 'UTC' AT TIME ZONE '${TZ}', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"')`;

type Notification = { key: string; kind: "stock" | "payment" | "reversal" | "cash" | "customer"; tone: "danger" | "warning" | "info"; title: string; detail: string; at: string; page: "inventory" | "shift" | "finance" | "customers" };

const peso = (value: unknown) => `₱${Number(value).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  try {
    const [stock, payments, reversals, cash, customers] = await Promise.all([
      // Portions made from another item (bound items) follow their source, which alerts instead.
      pool.query(`
        SELECT inventory_id, item_name, quantity, low_stock_threshold, unit_of_measure, ${isoUtc("COALESCE(updated_at, created_at)")} AS at
        FROM inventory
        WHERE is_archived = FALSE AND derived_from_inventory_id IS NULL AND (quantity <= 0 OR quantity <= low_stock_threshold)
        ORDER BY quantity <= 0 DESC, item_name
        LIMIT 30
      `),
      pool.query(`
        SELECT checkout_id, amount, cash_amount, error, source_app, ${isoTz("COALESCE(paid_at, updated_at)")} AS at
        FROM payment_checkouts WHERE status = 'needs_attention'
        ORDER BY updated_at DESC LIMIT 20
      `),
      pool.query(`
        SELECT so.order_id, so.queue_number, so.status, so.total_amount, so.return_method, reverser.full_name AS reversed_by, ${isoTz("so.reversed_at")} AS at
        FROM sales_orders so LEFT JOIN admin_users reverser ON reverser.admin_id = so.reversed_by_admin_id
        WHERE so.reversed_at > CURRENT_TIMESTAMP - INTERVAL '3 days' AND so.status IN ('voided', 'refunded')
        ORDER BY so.reversed_at DESC LIMIT 20
      `),
      pool.query(`
        SELECT shift_id, cash_difference, closed_by_name, ${isoTz("closed_at")} AS at
        FROM shift_summaries
        WHERE closed_at > CURRENT_TIMESTAMP - INTERVAL '7 days' AND ABS(COALESCE(cash_difference, 0)) >= 0.01
        ORDER BY closed_at DESC LIMIT 10
      `),
      pool.query(`
        SELECT customer_id, full_name, username, ${isoTz("created_at")} AS at
        FROM customers
        WHERE created_by_admin_id IS NULL AND deleted_at IS NULL AND created_at > CURRENT_TIMESTAMP - INTERVAL '7 days'
        ORDER BY created_at DESC LIMIT 20
      `),
    ]);

    const items: Notification[] = [
      ...stock.rows.map((row): Notification => {
        const out = Number(row.quantity) <= 0;
        const amount = `${Number(row.quantity).toLocaleString("en-PH", { maximumFractionDigits: 2 })} ${row.unit_of_measure ?? ""}`.trim();
        return { key: `stock-${row.inventory_id}-${out ? "out" : "low"}`, kind: "stock", tone: out ? "danger" : "warning", title: out ? `${row.item_name} is out of stock` : `${row.item_name} is running low`, detail: out ? "Items that use it cannot be ordered until it is restocked." : `${amount} left (alert at ${Number(row.low_stock_threshold).toLocaleString("en-PH", { maximumFractionDigits: 2 })}).`, at: String(row.at), page: "inventory" };
      }),
      ...payments.rows.map((row): Notification => ({ key: `pay-${row.checkout_id}`, kind: "payment", tone: "danger", title: `GCash payment of ${peso(Number(row.amount))} needs attention`, detail: `${row.source_app === "mobile" ? "Mobile menu" : "Counter"} · ${row.error ?? "Paid, but the order could not be placed."}`, at: String(row.at), page: "shift" })),
      ...reversals.rows.map((row): Notification => ({ key: `rev-${row.order_id}`, kind: "reversal", tone: "warning", title: `Order ${row.order_id}${row.queue_number ? ` (#${row.queue_number})` : ""} was ${row.status === "voided" ? "voided" : "refunded"}`, detail: `${peso(Number(row.total_amount))}${row.return_method ? ` returned by ${row.return_method === "gcash" ? "GCash" : row.return_method === "split" ? "cash and GCash" : "cash"}` : ""}${row.reversed_by ? ` · by ${row.reversed_by}` : ""}`, at: String(row.at), page: "finance" })),
      ...cash.rows.map((row): Notification => {
        const difference = Number(row.cash_difference);
        return { key: `cash-${row.shift_id}`, kind: "cash", tone: difference < 0 ? "danger" : "warning", title: `Shift #${row.shift_id} closed ${peso(Math.abs(difference))} ${difference < 0 ? "short" : "over"}`, detail: `The counted cash did not match the expected cash${row.closed_by_name ? ` · closed by ${row.closed_by_name}` : ""}.`, at: String(row.at), page: "finance" };
      }),
      ...customers.rows.map((row): Notification => ({ key: `cust-${row.customer_id}`, kind: "customer", tone: "info", title: `${row.full_name} made an account`, detail: `@${row.username ?? ""} signed up on the mobile menu.`, at: String(row.at), page: "customers" })),
    ].sort((a, b) => b.at.localeCompare(a.at));

    return NextResponse.json({ data: items }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/notifications failed:", error);
    return NextResponse.json({ error: "Could not load notifications." }, { status: 500 });
  }
}
