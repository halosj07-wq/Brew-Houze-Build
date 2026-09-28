import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { expireCounterCarts } from "@/lib/counter-carts";
import { getSession, isQueueOnly, QUEUE_ONLY } from "@/lib/sessions";

// Carts customers sent from the mobile menu to claim an ID discount (see lib/counter-carts.ts).
// GET lists the ones waiting, for the POS; PATCH { id, action: "dismiss" } clears one the
// customer never came for.

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (isQueueOnly(session)) return NextResponse.json(QUEUE_ONLY, { status: 403 });
  try {
    await expireCounterCarts(pool);
    const result = await pool.query(`
      SELECT cc.counter_cart_id, cc.short_code, cc.items, cc.service_type, cc.discount_type_id, dt.name AS discount_name,
        TO_CHAR(cc.created_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS created_at,
        TO_CHAR(cc.expires_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS expires_at,
        c.customer_id, c.full_name, c.username, c.notes, COALESCE(v.visits, 0) AS visits,
        TO_CHAR(v.last_visit AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS last_visit
      FROM counter_carts cc
      LEFT JOIN discount_types dt ON dt.discount_type_id = cc.discount_type_id
      LEFT JOIN customers c ON c.customer_id = cc.customer_id AND c.deleted_at IS NULL AND c.is_active = TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS visits, MAX(created_at) AS last_visit FROM sales_orders WHERE customer_id = c.customer_id AND status = 'completed'
      ) v ON c.customer_id IS NOT NULL
      WHERE cc.status = 'waiting'
      ORDER BY cc.created_at
      LIMIT 20
    `);
    return NextResponse.json({
      data: result.rows.map((row) => ({
        id: Number(row.counter_cart_id),
        code: String(row.short_code),
        items: Array.isArray(row.items) ? row.items : [],
        serviceType: row.service_type === "take_out" ? "take_out" : "dine_in",
        discountTypeId: row.discount_type_id === null ? null : Number(row.discount_type_id),
        discountName: (row.discount_name as string | null) ?? null,
        createdAt: String(row.created_at),
        expiresAt: String(row.expires_at),
        customer: row.customer_id === null ? null : { id: Number(row.customer_id), fullName: String(row.full_name), username: (row.username as string | null) ?? null, notes: String(row.notes ?? ""), visits: Number(row.visits), lastVisit: (row.last_visit as string | null) ?? null },
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/counter-carts failed:", error);
    return NextResponse.json({ error: "Could not load the carts sent to the counter." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (isQueueOnly(session)) return NextResponse.json(QUEUE_ONLY, { status: 403 });
  try {
    const body = await request.json() as { id?: unknown; action?: unknown };
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0 || body.action !== "dismiss") return NextResponse.json({ error: "Unknown request." }, { status: 400 });
    await pool.query("UPDATE counter_carts SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE counter_cart_id = $1 AND status IN ('waiting', 'expired')", [id]);
    return NextResponse.json({ data: { id } });
  } catch (error) {
    console.error("PATCH /api/counter-carts failed:", error);
    return NextResponse.json({ error: "Could not dismiss the cart." }, { status: 500 });
  }
}
