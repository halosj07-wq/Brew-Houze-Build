import { customTextSql } from "@/lib/orders";
import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { starBalance } from "@/lib/loyalty";
import { getSession, isQueueOnly, QUEUE_ONLY } from "@/lib/sessions";

// Everything a printed receipt shows, read back from the saved order, so a first print and a
// reprint are identical and always match the record. Add-on quantities are stored per line (all
// cups of the line together).
export async function GET(_request: Request, context: { params: Promise<{ orderId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (isQueueOnly(session)) return NextResponse.json(QUEUE_ONLY, { status: 403 });
  const { orderId: rawId } = await context.params;
  const orderId = Number(rawId);
  if (!Number.isInteger(orderId) || orderId <= 0) return NextResponse.json({ error: "A valid order is required." }, { status: 400 });
  try {
    const orderResult = await pool.query(`
      SELECT so.order_id, so.queue_number, so.shift_id, so.status, so.total_amount, so.payment_method, so.payment_provider,
        so.payment_reference, so.cash_portion, so.received_amount, so.change_amount, so.order_source, so.return_method,
        TO_CHAR(so.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS created_at,
        TO_CHAR(so.reversed_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS reversed_at,
        cashier.full_name AS cashier_name, cu.full_name AS customer_name, so.customer_id, so.subtotal_amount, so.discount_amount, so.discount_label, so.service_type, so.vat_exempt_amount, so.delivery_fee,
        d.recipient_name AS delivery_recipient, d.phone AS delivery_phone, d.street AS delivery_street, d.landmark AS delivery_landmark, d.zone_name AS delivery_zone, d.status AS delivery_status, rider.full_name AS rider_name,
        d.check_id AS delivery_check_id, d.rider_notes AS delivery_notes, d.payment AS delivery_payment, d.cod_collected AS delivery_cod_collected,
        TO_CHAR(d.delivered_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS delivery_delivered_at
      FROM sales_orders so
      LEFT JOIN admin_users cashier ON cashier.admin_id = so.cashier_admin_id
      LEFT JOIN customers cu ON cu.customer_id = so.customer_id AND cu.deleted_at IS NULL
      LEFT JOIN deliveries d ON d.order_id = so.order_id
      LEFT JOIN admin_users rider ON rider.admin_id = d.rider_admin_id
      WHERE so.order_id = $1
    `, [orderId]);
    const order = orderResult.rows[0];
    if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });

    const itemsResult = await pool.query(`
      SELECT soi.order_item_id, p.product_name, pv.size_label, pv.temperature, soi.quantity, soi.unit_price, lr.name AS reward_name, COALESCE(soi.station, p.station, 'bar') AS station,
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
      GROUP BY soi.order_item_id, p.product_name, p.station, pv.size_label, pv.temperature, soi.quantity, soi.unit_price, lr.name
      ORDER BY soi.order_item_id
    `, [orderId]);

    // ID discounts (senior, PWD and others): who, which ID, and the amounts, for the signature lines.
    const idDiscounts = await pool.query(`
      SELECT type_code, type_name, holder_name, id_number, coverage, group_size, covered_amount, vat_exempt_amount, discount_amount
      FROM order_discounts WHERE order_id = $1 ORDER BY order_discount_id
    `, [orderId]);

    // Loyalty stars this order earned, and the customer's balance in that campaign now.
    let loyalty: { starsEarned: number; starsUsed: number; balance: number; campaignName: string } | null = null;
    if (order.customer_id !== null && order.customer_name) {
      try {
        const stars = await pool.query(`
          SELECT e.campaign_id, c.name,
            COALESCE(SUM(e.stars) FILTER (WHERE e.kind = 'earned'), 0)::int AS earned,
            COALESCE(-SUM(e.stars) FILTER (WHERE e.kind = 'redeemed'), 0)::int AS used
          FROM loyalty_star_entries e JOIN loyalty_campaigns c ON c.campaign_id = e.campaign_id
          WHERE e.order_id = $1 AND e.kind IN ('earned', 'redeemed')
          GROUP BY e.campaign_id, c.name
        `, [orderId]);
        const row = stars.rows[0];
        if (row) {
          loyalty = { starsEarned: Number(row.earned), starsUsed: Number(row.used), balance: await starBalance(Number(order.customer_id), Number(row.campaign_id)), campaignName: String(row.name) };
        }
      } catch (loyaltyError) {
        console.error("Receipt: could not read loyalty stars:", loyaltyError);
      }
    }

    const optional = (value: unknown) => (value === null || value === undefined ? null : Number(value));
    return NextResponse.json({
      data: {
        orderId: Number(order.order_id),
        queueNumber: optional(order.queue_number),
        shiftId: optional(order.shift_id),
        status: String(order.status),
        total: Number(order.total_amount),
        paymentMethod: String(order.payment_method ?? "cash"),
        paymentProvider: order.payment_provider ?? null,
        paymentReference: order.payment_reference ?? null,
        cashPortion: optional(order.cash_portion),
        received: optional(order.received_amount),
        change: optional(order.change_amount),
        orderSource: String(order.order_source ?? "cashier"),
        returnMethod: order.return_method ?? null,
        createdAt: order.created_at as string,
        reversedAt: (order.reversed_at as string | null) ?? null,
        cashierName: (order.cashier_name as string | null) ?? null,
        customerName: (order.customer_name as string | null) ?? null,
        // A discount (a loyalty reward, or ID discounts such as senior and PWD): subtotal, then the
        // discount and any VAT exempted, then total.
        subtotal: optional(order.subtotal_amount),
        discountAmount: Number(order.discount_amount ?? 0),
        discountLabel: (order.discount_label as string | null) ?? null,
        vatExemptAmount: Number(order.vat_exempt_amount ?? 0),
        deliveryFee: Number(order.delivery_fee ?? 0),
        delivery: order.delivery_street ? { recipient: String(order.delivery_recipient), phone: String(order.delivery_phone), street: String(order.delivery_street), landmark: (order.delivery_landmark as string | null) ?? null, zone: String(order.delivery_zone), status: String(order.delivery_status), rider: (order.rider_name as string | null) ?? null, checkId: Boolean(order.delivery_check_id), notes: (order.delivery_notes as string | null) ?? null, codCollected: order.delivery_cod_collected === null || order.delivery_cod_collected === undefined ? null : Number(order.delivery_cod_collected), deliveredAt: (order.delivery_delivered_at as string | null) ?? null } : null,
        idDiscounts: idDiscounts.rows.map((row) => ({
          code: String(row.type_code),
          name: String(row.type_name),
          holderName: String(row.holder_name),
          idNumber: (row.id_number as string | null) ?? null,
          groupSize: optional(row.group_size),
          coveredAmount: Number(row.covered_amount),
          vatExempt: Number(row.vat_exempt_amount),
          discount: Number(row.discount_amount),
        })),
        serviceType: (order.service_type as string | null) ?? null,
        loyalty,
        items: itemsResult.rows.map((row) => ({
          name: String(row.product_name),
          rewardName: (row.reward_name as string | null) ?? null,
          size: (row.size_label as string | null) ?? null,
          temperature: (row.temperature as string | null) ?? null,
          quantity: Number(row.quantity),
          unitPrice: Number(row.unit_price),
          station: row.station === "kitchen" ? "kitchen" : "bar",
          custom: (row.custom as string | null) ?? null,
          additions: (row.additions as { name: string; quantity: number; unitPrice: number }[]).map((addition) => ({ name: addition.name, quantity: Number(addition.quantity), unitPrice: Number(addition.unitPrice) })),
        })),
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/receipts/[orderId] failed:", error);
    return NextResponse.json({ error: "Could not load the receipt." }, { status: 500 });
  }
}
