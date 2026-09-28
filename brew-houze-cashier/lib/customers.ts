import type { PoolClient } from "pg";
import pool from "@/lib/db";
import type { OrderItemInput } from "@/lib/orders";
import { confirmPassword } from "@/lib/sessions";

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

// Who confirmed the rewards in a counter order:
//   an accepted claim: the customer scanned the Stars sign with their signed-in phone, or
//   the cashier's password: only for regulars without an app login (like the old paper card).
// claimId is also returned for a claim without rewards (a customer who only checked in), so
// the claim can be closed once the order is placed.
export type RewardAuthorization = { ok: true; authorized: boolean; claimId: number | null } | { ok: false; error: string; status: number; code?: string };

export async function authorizeCounterRewards(items: OrderItemInput[], customerId: number | undefined, adminId: number, body: { claim_id?: unknown; reward_password?: unknown; discount_reward_id?: unknown }): Promise<RewardAuthorization> {
  const hasRewards = items.some((item) => item.rewardId) || (body.discount_reward_id !== undefined && body.discount_reward_id !== null && body.discount_reward_id !== "");
  const rawClaim = Number(body.claim_id);
  const claimId = Number.isInteger(rawClaim) && rawClaim > 0 ? rawClaim : null;
  if (claimId !== null) {
    if (!customerId) return { ok: false, error: "Attach the customer before using their claim.", status: 400 };
    const claim = await pool.query("SELECT 1 FROM loyalty_claims WHERE claim_id = $1 AND customer_id = $2 AND status = 'accepted' AND expires_at > CURRENT_TIMESTAMP", [claimId, customerId]);
    if (claim.rowCount === 0) return { ok: false, error: "The customer's claim expired. Ask them to scan the Stars sign again.", status: 409 };
    return { ok: true, authorized: true, claimId };
  }
  if (!hasRewards) return { ok: true, authorized: false, claimId: null };
  if (!customerId) return { ok: false, error: "Attach the customer before using a reward.", status: 400 };
  const customer = await pool.query("SELECT username IS NOT NULL AND password_hash IS NOT NULL AS has_login FROM customers WHERE customer_id = $1", [customerId]);
  if (customer.rows[0]?.has_login) return { ok: false, error: "This customer has the app. Ask them to scan the Stars sign at the counter and pick the reward on their phone.", status: 403 };
  if (!(await confirmPassword(adminId, body.reward_password))) return { ok: false, error: "That password is incorrect.", status: 403, code: "wrong_password" };
  return { ok: true, authorized: true, claimId: null };
}

// Closes a claim once its order is placed (or its GCash payment started).
export async function markClaimUsed(db: PoolClient | typeof pool, claimId: number | null, orderId: number | null): Promise<void> {
  if (claimId === null) return;
  await db.query("UPDATE loyalty_claims SET status = 'used', order_id = $2, closed_at = CURRENT_TIMESTAMP WHERE claim_id = $1 AND status = 'accepted'", [claimId, orderId]);
}
