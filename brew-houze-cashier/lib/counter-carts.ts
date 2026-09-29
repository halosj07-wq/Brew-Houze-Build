import type { PoolClient } from "pg";

// Mobile carts sent to the counter (see id-discounts-migration.sql and counter-carts-migration.sql).
// brew-houze-cashier and brew-houze-mobile keep identical copies of this file.
//
// A customer with a senior, PWD or other discount ID cannot get the discount on a prepaid mobile
// order: the ID has to be seen. So they send their cart to the counter instead. A customer who
// simply wants to pay at the counter (cash, or GCash there) sends it the same way, with no discount. It waits there
// with a 4-digit code (waiting), the cashier loads it into the POS, checks the ID and takes payment.
// The order it becomes carries the cart token as its customer_order_token, so the phone follows
// the order in the queue like any mobile order.
//   waiting -> ordered     the cashier completed it (order_id set)
//   waiting -> cancelled   the customer cancelled it, or the cashier dismissed it
//   waiting -> expired     nobody came within COUNTER_CART_MINUTES

export const COUNTER_CART_MINUTES = 30;

// Locks a cart for the order being made. Returns its token (for customer_order_token), or null
// when it is already ordered or cancelled. An expired cart still counts: the cashier loaded it in
// time and is serving the customer now.
export async function claimCounterCart(client: PoolClient, counterCartId: number | null): Promise<string | null> {
  if (counterCartId === null) return null;
  const result = await client.query("SELECT public_token, status FROM counter_carts WHERE counter_cart_id = $1 FOR UPDATE", [counterCartId]);
  const row = result.rows[0];
  return row && (row.status === "waiting" || row.status === "expired") ? String(row.public_token) : null;
}

export async function completeCounterCart(client: PoolClient, counterCartId: number, orderId: number): Promise<void> {
  await client.query("UPDATE counter_carts SET status = 'ordered', order_id = $2, updated_at = CURRENT_TIMESTAMP WHERE counter_cart_id = $1 AND status IN ('waiting', 'expired')", [counterCartId, orderId]);
}

// Carts nobody picked up in time.
export async function expireCounterCarts(db: Pick<PoolClient, "query">): Promise<void> {
  await db.query("UPDATE counter_carts SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE status = 'waiting' AND expires_at < CURRENT_TIMESTAMP");
}

export function parseCounterCartId(value: unknown): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}
