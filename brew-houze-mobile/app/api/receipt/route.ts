import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getCustomerSession } from "@/lib/customers";
import { customTextSql } from "@/lib/orders";

// The customer's copy of their receipt (the virtual receipt they can save on their phone), the
// same content as the counter's printed slip. Only for the order's own customer: by the tracking
// token their phone keeps (?token=), or a signed-in customer's own order (?order=). ID numbers
// show only their last 4 characters, and staff only by first name.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const token = params.get("token");
  const orderParam = params.get("order");
  let where: string;
  let values: (string | number)[];
  if (token) {
    if (!/^[0-9a-f-]{36}$/i.test(token)) return NextResponse.json({ error: "Receipt not found." }, { status: 404 });
    where = "so.customer_order_token = $1::uuid";
    values = [token];
  } else {
    const session = await getCustomerSession();
    const orderId = Number(orderParam);
    if (!session) return NextResponse.json({ error: "Sign in to see your receipts." }, { status: 401 });
    if (!Number.isInteger(orderId) || orderId <= 0) return NextResponse.json({ error: "Receipt not found." }, { status: 404 });
    where = "so.order_id = $1 AND so.customer_id = $2";
    values = [orderId, session.customerId];
  }
  try {
    const orderResult = await pool.query(`
      SELECT so.order_id, so.queue_number, so.status, so.total_amount, so.payment_method, so.payment_provider, so.payment_reference,
        so.cash_portion, so.received_amount, so.change_amount, so.order_source, so.service_type, so.subtotal_amount, so.discount_amount,
        so.discount_label, so.vat_exempt_amount, so.delivery_fee, so.customer_id,
        TO_CHAR(so.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS created_at,
        TO_CHAR(so.reversed_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS reversed_at,
        split_part(cashier.full_name, ' ', 1) AS cashier_name, cu.full_name AS customer_name,
        d.recipient_name AS delivery_recipient, d.street AS delivery_street, d.landmark AS delivery_landmark, d.zone_name AS delivery_zone,
        d.status AS delivery_status, d.payment AS delivery_payment
      FROM sales_orders so
      LEFT JOIN admin_users cashier ON cashier.admin_id = so.cashier_admin_id
      LEFT JOIN customers cu ON cu.customer_id = so.customer_id AND cu.deleted_at IS NULL
      LEFT JOIN deliveries d ON d.order_id = so.order_id
      WHERE ${where}
    `, values);
    const order = orderResult.rows[0];
    if (!order) return NextResponse.json({ error: "Receipt not found." }, { status: 404 });
    const orderId = Number(order.order_id);

    const items = await pool.query(`
      SELECT p.product_name, pv.size_label, pv.temperature, soi.quantity, soi.unit_price, lr.name AS reward_name,
        ${customTextSql("soi")} AS custom,
        COALESCE(json_agg(json_build_object('name', a.addition_name, 'quantity', soia.quantity, 'unitPrice', soia.unit_price) ORDER BY a.addition_name)
          FILTER (WHERE soia.order_item_id IS NOT NULL), '[]'::json) AS additions
      FROM sales_order_items soi
      JOIN products p ON p.product_id = soi.product_id
      LEFT JOIN product_variants pv ON pv.product_variant_id = soi.product_variant_id
      LEFT JOIN sales_order_item_additions soia ON soia.order_item_id = soi.order_item_id
      LEFT JOIN additions a ON a.addition_id = soia.addition_id
      LEFT JOIN loyalty_rewards lr ON lr.reward_id = soi.reward_id
      WHERE soi.order_id = $1
      GROUP BY soi.order_item_id, p.product_name, pv.size_label, pv.temperature, soi.quantity, soi.unit_price, lr.name
      ORDER BY soi.order_item_id
    `, [orderId]);
    const idDiscounts = await pool.query(`
      SELECT type_name, holder_name, id_number, group_size, covered_amount, vat_exempt_amount, discount_amount
      FROM order_discounts WHERE order_id = $1 ORDER BY order_discount_id
    `, [orderId]);
    const stars = order.customer_id === null ? null : await pool.query(`
      SELECT COALESCE(SUM(stars) FILTER (WHERE kind = 'earned'), 0)::int AS earned, COALESCE(-SUM(stars) FILTER (WHERE kind = 'redeemed'), 0)::int AS used
      FROM loyalty_star_entries WHERE order_id = $1
    `, [orderId]).catch(() => null);

    const optional = (value: unknown) => (value === null || value === undefined ? null : Number(value));
    const starRow = stars?.rows[0];
    return NextResponse.json({
      data: {
        orderId,
        queueNumber: optional(order.queue_number),
        status: String(order.status),
        createdAt: String(order.created_at),
        reversedAt: (order.reversed_at as string | null) ?? null,
        source: order.order_source === "online" ? "mobile" : "counter",
        cashierName: (order.cashier_name as string | null) || null,
        customerName: (order.customer_name as string | null) ?? null,
        serviceType: (order.service_type as string | null) ?? null,
        items: items.rows.map((row) => ({
          name: String(row.product_name), size: (row.size_label as string | null) ?? null, temperature: (row.temperature as string | null) ?? null,
          quantity: Number(row.quantity), unitPrice: Number(row.unit_price), rewardName: (row.reward_name as string | null) ?? null,
          custom: (row.custom as string | null) ?? null,
          additions: (Array.isArray(row.additions) ? row.additions : []).map((addition: { name: string; quantity: number; unitPrice: number }) => ({ name: String(addition.name), quantity: Number(addition.quantity), unitPrice: Number(addition.unitPrice) })),
        })),
        subtotal: optional(order.subtotal_amount),
        discountAmount: Number(order.discount_amount ?? 0),
        discountLabel: (order.discount_label as string | null) ?? null,
        vatExemptAmount: Number(order.vat_exempt_amount ?? 0),
        deliveryFee: Number(order.delivery_fee ?? 0),
        idDiscounts: idDiscounts.rows.map((row) => ({
          name: String(row.type_name), holderName: String(row.holder_name),
          idEnding: row.id_number ? String(row.id_number).slice(-4) : null, groupSize: optional(row.group_size),
          coveredAmount: Number(row.covered_amount), vatExempt: Number(row.vat_exempt_amount), discount: Number(row.discount_amount),
        })),
        total: Number(order.total_amount),
        paymentMethod: String(order.payment_method ?? "cash"),
        paidWithGcash: order.payment_provider === "paymongo_gcash" || order.payment_method === "online",
        paymentReference: (order.payment_reference as string | null) ?? null,
        cashPortion: optional(order.cash_portion),
        received: optional(order.received_amount),
        change: optional(order.change_amount),
        delivery: order.delivery_street ? { recipient: String(order.delivery_recipient), street: String(order.delivery_street), landmark: (order.delivery_landmark as string | null) ?? null, zone: String(order.delivery_zone), status: String(order.delivery_status) } : null,
        stars: starRow && (Number(starRow.earned) || Number(starRow.used)) ? { earned: Number(starRow.earned), used: Number(starRow.used) } : null,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/receipt failed:", error);
    return NextResponse.json({ error: "Could not load the receipt." }, { status: 500 });
  }
}
