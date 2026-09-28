import { NextResponse } from "next/server";
import pool from "@/lib/db";
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
        cashier.full_name AS cashier_name, cu.full_name AS customer_name
      FROM sales_orders so
      LEFT JOIN admin_users cashier ON cashier.admin_id = so.cashier_admin_id
      LEFT JOIN customers cu ON cu.customer_id = so.customer_id AND cu.deleted_at IS NULL
      WHERE so.order_id = $1
    `, [orderId]);
    const order = orderResult.rows[0];
    if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });

    const itemsResult = await pool.query(`
      SELECT soi.order_item_id, p.product_name, pv.size_label, pv.temperature, soi.quantity, soi.unit_price,
        COALESCE(json_agg(json_build_object('name', a.addition_name, 'quantity', soia.quantity, 'unitPrice', soia.unit_price) ORDER BY a.addition_name)
          FILTER (WHERE soia.order_item_id IS NOT NULL), '[]'::json) AS additions
      FROM sales_order_items soi
      JOIN products p ON p.product_id = soi.product_id
      LEFT JOIN product_variants pv ON pv.product_variant_id = soi.product_variant_id
      LEFT JOIN sales_order_item_additions soia ON soia.order_item_id = soi.order_item_id
      LEFT JOIN additions a ON a.addition_id = soia.addition_id
      WHERE soi.order_id = $1
      GROUP BY soi.order_item_id, p.product_name, pv.size_label, pv.temperature, soi.quantity, soi.unit_price
      ORDER BY soi.order_item_id
    `, [orderId]);

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
        items: itemsResult.rows.map((row) => ({
          name: String(row.product_name),
          size: (row.size_label as string | null) ?? null,
          temperature: (row.temperature as string | null) ?? null,
          quantity: Number(row.quantity),
          unitPrice: Number(row.unit_price),
          additions: (row.additions as { name: string; quantity: number; unitPrice: number }[]).map((addition) => ({ name: addition.name, quantity: Number(addition.quantity), unitPrice: Number(addition.unitPrice) })),
        })),
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/receipts/[orderId] failed:", error);
    return NextResponse.json({ error: "Could not load the receipt." }, { status: 500 });
  }
}
