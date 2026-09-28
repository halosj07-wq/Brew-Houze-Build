import { randomInt, randomUUID } from "crypto";
import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { parseOrderItems, parseServiceType, quoteOrder } from "@/lib/orders";
import { COUNTER_CART_MINUTES, expireCounterCarts } from "@/lib/counter-carts";
import { getCustomerSession } from "@/lib/customers";

// Sends the cart to the counter to claim an ID discount (senior, PWD and others): the ID has to be
// seen, so the customer pays at the counter instead of with GCash here. The cart is checked now
// (open shift, stock, prices) but nothing is ordered until the cashier completes it.
// See lib/counter-carts.ts.

const MAX_WAITING = 30;

export async function POST(request: Request) {
  const client = await pool.connect();
  try {
    const body = await request.json() as { items?: unknown; service_type?: unknown; discount_type_id?: unknown };
    // Each add-on is once per cup on the mobile menu.
    const items = parseOrderItems(body.items).map((item) => ({ ...item, additionIds: Array.from(new Set(item.additionIds)) }));
    if (items.length === 0) return NextResponse.json({ error: "Add something to your order first." }, { status: 400 });
    if (items.some((item) => item.rewardId)) return NextResponse.json({ error: "Star rewards and ID discounts don't go together. Remove your rewards to send this to the counter." }, { status: 400 });
    const discountTypeId = Number(body.discount_type_id);
    const type = Number.isInteger(discountTypeId) && discountTypeId > 0
      ? (await client.query("SELECT discount_type_id, name FROM discount_types WHERE discount_type_id = $1 AND is_active = TRUE", [discountTypeId])).rows[0]
      : null;
    if (!type) return NextResponse.json({ error: "Choose the discount you'll claim." }, { status: 400 });

    await expireCounterCarts(client);
    const waiting = await client.query("SELECT COUNT(*)::int AS count FROM counter_carts WHERE status = 'waiting'");
    if (Number(waiting.rows[0].count) >= MAX_WAITING) return NextResponse.json({ error: "Lots of orders are waiting at the counter right now. Please order at the counter." }, { status: 429 });

    // Throws when the café is closed or something ran out; nothing is kept.
    const total = await quoteOrder(client, { items, source: "mobile", cashierAdminId: null });
    const customer = await getCustomerSession();

    // A 4-digit code no other waiting cart has.
    let code = "";
    for (let attempt = 0; attempt < 20 && !code; attempt++) {
      const candidate = String(randomInt(1000, 10000));
      const taken = await client.query("SELECT 1 FROM counter_carts WHERE status = 'waiting' AND short_code = $1", [candidate]);
      if (taken.rowCount === 0) code = candidate;
    }
    if (!code) throw new Error("Could not make a code. Please try again.");
    const token = randomUUID();
    const inserted = await client.query(`
      INSERT INTO counter_carts (public_token, short_code, items, customer_id, discount_type_id, service_type, expires_at)
      VALUES ($1, $2, $3::jsonb, $4, $5, $6, CURRENT_TIMESTAMP + ($7 || ' minutes')::interval)
      RETURNING TO_CHAR(expires_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS expires_at
    `, [token, code, JSON.stringify(items), customer?.customerId ?? null, Number(type.discount_type_id), parseServiceType(body.service_type), String(COUNTER_CART_MINUTES)]);
    return NextResponse.json({ data: { token, code, total, discountName: String(type.name), expiresAt: String(inserted.rows[0].expires_at) } }, { status: 201 });
  } catch (error) {
    console.error("POST /api/counter-carts failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not send your order to the counter." }, { status: 400 });
  } finally {
    client.release();
  }
}
