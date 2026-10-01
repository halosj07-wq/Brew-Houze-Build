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
//   discount  an ID number (senior, PWD and others) used under different names in the last 30
//             days, or 3 or more times in one shift in the last 7 days
//   delivery  a delivery that failed and is not voided yet, a rider's cash on delivery not handed
//             in 30 minutes after delivering, an order on the way for over an hour, and a packed
//             order no rider picked up for 20 minutes
//   waste     waste reports from the staff app waiting for an admin to approve or reject

const TZ = "Asia/Manila";
const isoTz = (column: string) => `TO_CHAR(${column} AT TIME ZONE '${TZ}', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"')`;
// Columns stored without a time zone hold UTC.
const isoUtc = (column: string) => `TO_CHAR(${column} AT TIME ZONE 'UTC' AT TIME ZONE '${TZ}', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"')`;

type Notification = { key: string; kind: "stock" | "payment" | "reversal" | "cash" | "customer" | "discount" | "delivery" | "waste"; tone: "danger" | "warning" | "info"; title: string; detail: string; at: string; page: "discounts" | "inventory" | "shift" | "finance" | "customers" | "delivery" };

const peso = (value: unknown) => `₱${Number(value).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  try {
    const reversedOrder = "LOWER(so.status) IN ('void', 'voided', 'refund', 'refunded')";
    const [stock, payments, reversals, cash, customers, idNames, idOften, deliveries, waste] = await Promise.all([
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
      // The same ID number given under different names.
      pool.query(`
        SELECT od.type_code, MIN(od.type_name) AS type_name, LOWER(od.id_number) AS id_key, MIN(od.id_number) AS id_number,
          COUNT(DISTINCT LOWER(od.holder_name))::int AS names, STRING_AGG(DISTINCT od.holder_name, ', ') AS holder_names, ${isoTz("MAX(od.created_at)")} AS at
        FROM order_discounts od JOIN sales_orders so ON so.order_id = od.order_id
        WHERE od.id_number IS NOT NULL AND od.created_at > CURRENT_TIMESTAMP - INTERVAL '30 days' AND NOT ${reversedOrder}
        GROUP BY od.type_code, LOWER(od.id_number)
        HAVING COUNT(DISTINCT LOWER(od.holder_name)) > 1
        ORDER BY MAX(od.created_at) DESC LIMIT 10
      `),
      // The same ID number used again and again in one shift.
      pool.query(`
        SELECT od.type_code, MIN(od.type_name) AS type_name, LOWER(od.id_number) AS id_key, MIN(od.id_number) AS id_number, so.shift_id,
          COUNT(*)::int AS uses, ${isoTz("MAX(od.created_at)")} AS at
        FROM order_discounts od JOIN sales_orders so ON so.order_id = od.order_id
        WHERE od.id_number IS NOT NULL AND so.shift_id IS NOT NULL AND od.created_at > CURRENT_TIMESTAMP - INTERVAL '7 days' AND NOT ${reversedOrder}
        GROUP BY od.type_code, LOWER(od.id_number), so.shift_id
        HAVING COUNT(*) >= 3
        ORDER BY MAX(od.created_at) DESC LIMIT 10
      `),
      // Deliveries that need someone (one row per problem).
      pool.query(`
        SELECT d.delivery_id, so.order_id, so.queue_number, d.zone_name, d.payment, d.failure_reason, d.cod_collected, so.total_amount, rider.full_name AS rider,
          CASE WHEN d.status = 'failed' THEN 'failed'
            WHEN d.status = 'out' THEN 'late'
            WHEN d.status = 'ready' THEN 'waiting'
            ELSE 'cash' END AS problem,
          ${isoTz("CASE d.status WHEN 'failed' THEN d.failed_at WHEN 'out' THEN d.picked_up_at WHEN 'ready' THEN d.ready_at ELSE d.delivered_at END")} AS at
        FROM deliveries d
        JOIN sales_orders so ON so.order_id = d.order_id
        LEFT JOIN admin_users rider ON rider.admin_id = d.rider_admin_id
        WHERE (d.status = 'failed' AND so.status = 'completed')
          OR (d.payment = 'cod' AND d.cod_collected IS NOT NULL AND d.cod_remitted_at IS NULL AND d.delivered_at < CURRENT_TIMESTAMP - INTERVAL '30 minutes')
          OR (d.status = 'out' AND so.status = 'completed' AND d.picked_up_at < CURRENT_TIMESTAMP - INTERVAL '60 minutes')
          OR (d.status = 'ready' AND so.status = 'completed' AND d.ready_at < CURRENT_TIMESTAMP - INTERVAL '20 minutes')
        ORDER BY d.delivery_id DESC LIMIT 30
      `),
      pool.query(`
        SELECT r.request_id, r.label, r.quantity, r.reason, i.unit_of_measure, requester.full_name AS requested_by, ${isoTz("r.created_at")} AS at
        FROM write_off_requests r
        LEFT JOIN inventory i ON i.inventory_id = r.inventory_id
        LEFT JOIN admin_users requester ON requester.admin_id = r.requested_by
        WHERE r.status = 'pending'
        ORDER BY r.created_at DESC LIMIT 20
      `),
    ]);
    const wasteReasons: Record<string, string> = { expired: "expired or spoiled", damaged: "damaged", wasted: "spilled or wasted", in_house: "used in-house", other: "written off" };

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
      ...idNames.rows.map((row): Notification => ({ key: `dsc-names-${row.type_code}-${row.id_key}-${row.names}`, kind: "discount", tone: "warning", title: `${row.type_name} ID ${row.id_number} used under ${row.names} names`, detail: `${row.holder_names}. Check the register: one ID should belong to one person.`, at: String(row.at), page: "discounts" })),
      ...idOften.rows.map((row): Notification => ({ key: `dsc-often-${row.type_code}-${row.id_key}-${row.shift_id}-${row.uses}`, kind: "discount", tone: "warning", title: `${row.type_name} ID ${row.id_number} used ${row.uses} times in shift #${row.shift_id}`, detail: "The discount is for the ID holder's own food and drinks. Check the register.", at: String(row.at), page: "discounts" })),
      ...deliveries.rows.map((row): Notification => {
        const order = `Order #${row.queue_number ?? row.order_id}`;
        const rider = row.rider ? String(row.rider) : "the rider";
        if (row.problem === "failed") return { key: `dlv-failed-${row.delivery_id}`, kind: "delivery", tone: "danger", title: `${order} could not be delivered`, detail: `${row.failure_reason ?? "No reason given"} · ${row.zone_name}${row.rider ? ` · ${row.rider}` : ""}. A cashier voids it in the staff app (Order history) to put the stock back.`, at: String(row.at), page: "delivery" };
        if (row.problem === "cash") return { key: `dlv-cash-${row.delivery_id}`, kind: "delivery", tone: "warning", title: `${peso(Number(row.cod_collected))} cash on delivery not handed in`, detail: `${order} was delivered by ${rider}, but the cash was not received at the counter yet. The shift cannot close until it is.`, at: String(row.at), page: "delivery" };
        if (row.problem === "late") return { key: `dlv-late-${row.delivery_id}`, kind: "delivery", tone: "warning", title: `${order} has been on the way for over an hour`, detail: `${row.zone_name} · ${rider}. Check with the rider or call the customer.`, at: String(row.at), page: "delivery" };
        return { key: `dlv-wait-${row.delivery_id}`, kind: "delivery", tone: "info", title: `${order} is packed and waiting for a rider`, detail: `${row.zone_name} · packed over 20 minutes ago. Is a rider on duty?`, at: String(row.at), page: "delivery" };
      }),
      ...waste.rows.map((row): Notification => ({ key: `waste-${row.request_id}`, kind: "waste", tone: "warning", title: `Waste report: ${Number(row.quantity).toLocaleString("en-PH", { maximumFractionDigits: 3 })}${row.unit_of_measure ? ` ${row.unit_of_measure}` : " ×"} ${row.label}`, detail: `${wasteReasons[String(row.reason)] ?? "written off"}${row.requested_by ? ` · reported by ${row.requested_by}` : ""}. Approve or reject it in Inventory.`, at: String(row.at), page: "inventory" })),
      ...customers.rows.map((row): Notification => ({ key: `cust-${row.customer_id}`, kind: "customer", tone: "info", title: `${row.full_name} made an account`, detail: `@${row.username ?? ""} signed up on the mobile menu.`, at: String(row.at), page: "customers" })),
    ].sort((a, b) => b.at.localeCompare(a.at));

    return NextResponse.json({ data: items }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/notifications failed:", error);
    return NextResponse.json({ error: "Could not load notifications." }, { status: 500 });
  }
}
