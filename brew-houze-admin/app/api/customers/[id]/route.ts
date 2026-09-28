import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSession } from "@/lib/sessions";

const TZ = "Asia/Manila";

// One customer's purchases, newest first: what they ordered, where, and who served them.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (String(session.role).toLowerCase() !== "admin") return NextResponse.json({ error: "Only an admin can view customers." }, { status: 403 });
  const { id: rawId } = await context.params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "A valid customer is required." }, { status: 400 });
  try {
    const orders = await pool.query(`
      SELECT so.order_id, so.queue_number, so.shift_id, so.status, so.total_amount, so.payment_method, so.order_source, so.discount_label, so.discount_amount + so.vat_exempt_amount AS discount_total,
        TO_CHAR(so.created_at AT TIME ZONE 'UTC' AT TIME ZONE '${TZ}', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS created_at,
        COALESCE(cashier.full_name, CASE WHEN so.order_source = 'online' THEN 'Mobile order' ELSE 'Unknown' END) AS punched_by,
        COALESCE(STRING_AGG(soi.quantity || 'x ' || p.product_name || COALESCE(' (' || pv.size_label || ')', ''), ', ' ORDER BY soi.order_item_id), '') AS items
      FROM sales_orders so
      LEFT JOIN admin_users cashier ON cashier.admin_id = so.cashier_admin_id
      LEFT JOIN sales_order_items soi ON soi.order_id = so.order_id
      LEFT JOIN products p ON p.product_id = soi.product_id
      LEFT JOIN product_variants pv ON pv.product_variant_id = soi.product_variant_id
      WHERE so.customer_id = $1
      GROUP BY so.order_id, cashier.full_name
      ORDER BY so.created_at DESC
      LIMIT 300
    `, [id]);
    const devices = await pool.query(`
      SELECT device_label, TO_CHAR(created_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS signed_in_at,
        TO_CHAR(last_seen_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS last_seen_at
      FROM customer_sessions WHERE customer_id = $1 AND ended_at IS NULL AND expires_at > CURRENT_TIMESTAMP
      ORDER BY last_seen_at DESC
    `, [id]);
    // Star history across every campaign (empty when loyalty is not set up yet).
    const stars = await pool.query(`
      SELECT e.entry_id, e.kind, e.stars, e.order_id, so.queue_number, e.reason, a.full_name AS admin_name, r.name AS reward_name, lc.campaign_id, lc.name AS campaign_name,
        TO_CHAR(e.created_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS created_at
      FROM loyalty_star_entries e
      JOIN loyalty_campaigns lc ON lc.campaign_id = e.campaign_id
      LEFT JOIN sales_orders so ON so.order_id = e.order_id
      LEFT JOIN admin_users a ON a.admin_id = e.admin_id
      LEFT JOIN loyalty_rewards r ON r.reward_id = e.reward_id
      WHERE e.customer_id = $1
      ORDER BY e.created_at DESC, e.entry_id DESC
      LIMIT 300
    `, [id]).catch(() => ({ rows: [] as Record<string, unknown>[] }));
    return NextResponse.json({
      data: {
        starEntries: stars.rows.map((row) => ({
          id: Number(row.entry_id), kind: String(row.kind), stars: Number(row.stars), orderId: row.order_id === null ? null : Number(row.order_id),
          queueNumber: row.queue_number === null ? null : Number(row.queue_number), reason: (row.reason as string | null) ?? null,
          adminName: (row.admin_name as string | null) ?? null, rewardName: (row.reward_name as string | null) ?? null,
          campaignId: Number(row.campaign_id), campaignName: String(row.campaign_name), createdAt: String(row.created_at),
        })),
        orders: orders.rows.map((row) => ({
          id: Number(row.order_id),
          queueNumber: row.queue_number === null ? null : Number(row.queue_number),
          shiftId: row.shift_id === null ? null : Number(row.shift_id),
          status: String(row.status),
          total: Number(row.total_amount),
          discountLabel: (row.discount_label as string | null) ?? null, discountTotal: Number(row.discount_total ?? 0),
          paymentMethod: String(row.payment_method ?? "cash"),
          source: String(row.order_source) === "online" ? "mobile" : "counter",
          createdAt: String(row.created_at),
          punchedBy: String(row.punched_by),
          items: String(row.items),
        })),
        devices: devices.rows.map((row) => ({ device: String(row.device_label ?? "Phone"), signedInAt: String(row.signed_in_at), lastSeenAt: String(row.last_seen_at) })),
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/customers/[id] failed:", error);
    return NextResponse.json({ error: "Could not load the customer's purchases." }, { status: 500 });
  }
}
