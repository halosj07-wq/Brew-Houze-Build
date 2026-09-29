import type { PoolClient } from "pg";
import pool from "@/lib/db";
import { stationOf, type Station } from "@/lib/orders";

// The bar and the kitchen (see kitchen-stations-migration.sql). An order has one part per station
// it needs (order_stations). Each station marks its part ready; the counter (barista, cashier or
// admin) hands it over. sales_orders.queue_status sums it up for everything else:
//   waiting  while any part is being made
//   served   once every part is ready (queue screen, phone, the rider for deliveries)
//   flushed  once everything was handed over
// pickup_mode (store_settings): "together" calls the number once, when every part is ready;
// "separate" calls and hands over each part on its own.

type Db = PoolClient | typeof pool;
export type PickupMode = "together" | "separate";

export async function pickupMode(db: Db = pool): Promise<PickupMode> {
  const result = await db.query("SELECT setting_value FROM store_settings WHERE setting_key = 'pickup_mode'").catch(() => ({ rows: [] as { setting_value: string }[] }));
  return result.rows[0]?.setting_value === "separate" ? "separate" : "together";
}

// The station a staff role works at: baristas the bar, kitchen staff the kitchen; cashiers and
// admins see both (null).
export function stationForRole(role: string): Station | null {
  const value = role.toLowerCase();
  return value === "barista" ? "bar" : value === "kitchen" ? "kitchen" : null;
}
// Who hands orders over at the counter: everyone but the kitchen (and riders).
export function canHandOff(role: string): boolean {
  return !["kitchen", "rider"].includes(role.toLowerCase());
}

// An order placed before stations existed has no parts: it becomes one bar part, in step with its
// queue status.
async function ensureParts(client: PoolClient, orderId: number) {
  await client.query(`
    INSERT INTO order_stations (order_id, station, status, ready_at)
    SELECT so.order_id, 'bar', CASE WHEN so.queue_status = 'served' THEN 'ready' ELSE 'waiting' END, CASE WHEN so.queue_status = 'served' THEN so.served_at END
    FROM sales_orders so
    WHERE so.order_id = $1 AND so.queue_status IN ('waiting', 'served')
      AND NOT EXISTS (SELECT 1 FROM order_stations os WHERE os.order_id = so.order_id)
  `, [orderId]);
}

// After a part changes: the order is ready when no part is still being made (a delivery is then
// packed for the rider), and done when every part was handed over.
async function settle(client: PoolClient, orderId: number) {
  const parts = await client.query("SELECT status FROM order_stations WHERE order_id = $1", [orderId]);
  const statuses = parts.rows.map((row) => String(row.status));
  if (statuses.length === 0) return;
  if (statuses.every((status) => status === "picked_up")) {
    await client.query("UPDATE sales_orders SET queue_status = 'flushed', served_at = COALESCE(served_at, CURRENT_TIMESTAMP) WHERE order_id = $1 AND queue_status IN ('waiting', 'served')", [orderId]);
    return;
  }
  if (!statuses.includes("waiting")) {
    const served = await client.query("UPDATE sales_orders SET queue_status = 'served', served_at = CURRENT_TIMESTAMP WHERE order_id = $1 AND queue_status = 'waiting' RETURNING order_id", [orderId]);
    if (served.rowCount) await client.query("UPDATE deliveries SET status = 'ready', ready_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE order_id = $1 AND status = 'preparing'", [orderId]);
  }
}

// A station finished its part (station null: every part still being made, for the counter).
export async function markReady(client: PoolClient, orderId: number, station: Station | null, adminId: number) {
  await ensureParts(client, orderId);
  const result = await client.query(`
    UPDATE order_stations os SET status = 'ready', ready_at = CURRENT_TIMESTAMP, ready_by = $3
    FROM sales_orders so
    WHERE os.order_id = $1 AND so.order_id = os.order_id AND so.queue_status = 'waiting' AND os.status = 'waiting'
      AND ($2::text IS NULL OR os.station = $2::text)
    RETURNING os.station
  `, [orderId, station, adminId]);
  if (result.rowCount === 0) throw new StationError(station ? `This order has nothing waiting at the ${station}.` : "This order is not waiting anymore.", 404);
  await settle(client, orderId);
}

// The counter handed over a part (separate pickup) or the whole order (together, or station null).
export async function handOver(client: PoolClient, orderId: number, station: Station | null, mode: PickupMode) {
  await ensureParts(client, orderId);
  if (mode === "together" || station === null) {
    const result = await client.query(`
      UPDATE order_stations os SET status = 'picked_up', picked_up_at = CURRENT_TIMESTAMP
      FROM sales_orders so
      WHERE os.order_id = $1 AND so.order_id = os.order_id AND so.queue_status = 'served' AND os.status = 'ready'
      RETURNING os.station
    `, [orderId]);
    if (result.rowCount === 0) throw new StationError("This order is not ready for pickup, or was already picked up.", 404);
  } else {
    const result = await client.query(`
      UPDATE order_stations os SET status = 'picked_up', picked_up_at = CURRENT_TIMESTAMP
      FROM sales_orders so
      WHERE os.order_id = $1 AND os.station = $2 AND so.order_id = os.order_id AND so.queue_status IN ('waiting', 'served') AND os.status = 'ready'
      RETURNING os.station
    `, [orderId, station]);
    if (result.rowCount === 0) throw new StationError(`The ${station === "kitchen" ? "food" : "drinks"} of this order are not ready, or were already picked up.`, 404);
  }
  await settle(client, orderId);
}

export class StationError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export const parseStation = (value: unknown): Station | null => (value === "bar" || value === "kitchen" ? stationOf(value) : null);
