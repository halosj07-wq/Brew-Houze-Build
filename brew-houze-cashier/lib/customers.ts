import type { PoolClient } from "pg";
import pool from "@/lib/db";

// Reads the customer the counter attached to an order (customer_id in the request body).
// Returns undefined when none was attached, null when the id is not a customer that can be
// linked (deactivated, erased, or unknown), so the checkout can refuse instead of guessing.
export async function linkableCustomerId(value: unknown, db: PoolClient | typeof pool = pool): Promise<number | null | undefined> {
  if (value === undefined || value === null || value === "") return undefined;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) return null;
  const result = await db.query("SELECT 1 FROM customers WHERE customer_id = $1 AND is_active = TRUE AND deleted_at IS NULL", [id]);
  return result.rowCount === 0 ? null : id;
}

export const CUSTOMER_UNAVAILABLE = "That customer can no longer be linked (deactivated or removed). Remove them from the order and try again.";
