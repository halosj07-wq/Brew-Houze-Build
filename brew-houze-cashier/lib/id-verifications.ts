import type { PoolClient } from "pg";
import pool from "@/lib/db";
import type { OrderItemInput, ServiceType } from "@/lib/orders";
import type { IdDiscountInput } from "@/lib/discounts";

// Counter-less ID discounts on the mobile menu (see id-verification-migration.sql).
// brew-houze-cashier and brew-houze-mobile keep identical copies of this file.
//
// The customer sends a photo of their ID with the order. The cashier approves or rejects it on
// the POS. An approval is good for one payment: the customer pays with GCash on their phone and
// the order is marked used once paid. The photo is deleted as soon as the cashier decides, the
// customer cancels, or the request expires. A signed-in customer can ask to have an approved ID
// remembered on their account, so later orders get the discount without a photo. Mobile orders
// with an ID discount show "check ID at pickup" on the queue ticket either way.

type Db = PoolClient | typeof pool;

export const PENDING_MINUTES = 15;
export const APPROVED_MINUTES = 30;

// Requests nobody checked or paid in time, and any photo older than a day (a safety net).
export async function cleanupIdVerifications(db: Db = pool): Promise<void> {
  await db.query(`
    UPDATE id_verifications SET status = 'expired', photo = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE status IN ('pending', 'approved') AND expires_at < CURRENT_TIMESTAMP
  `);
  await db.query("UPDATE id_verifications SET photo = NULL WHERE photo IS NOT NULL AND (status <> 'pending' OR created_at < CURRENT_TIMESTAMP - INTERVAL '1 day')");
}

export type ApprovedVerification = { id: number; items: OrderItemInput[]; serviceType: ServiceType | null; customerId: number | null; idDiscount: IdDiscountInput };

// An approved request, ready to pay: its items and ID discount exactly as the cashier approved them.
export async function approvedVerification(db: Db, token: string): Promise<ApprovedVerification> {
  if (!/^[0-9a-f-]{36}$/i.test(token)) throw new Error("That ID check was not found.");
  const result = await db.query(`
    SELECT verification_id, items, lines, group_size, service_type, customer_id, discount_type_id, holder_name, id_number, status, decided_by, expires_at < CURRENT_TIMESTAMP AS expired
    FROM id_verifications WHERE public_token = $1
  `, [token]);
  const row = result.rows[0];
  if (!row) throw new Error("That ID check was not found.");
  if (row.status === "used") throw new Error("This ID approval was already used for an order.");
  if (row.status !== "approved" || row.expired) throw new Error("This ID approval is no longer valid. Please send your ID again.");
  return {
    id: Number(row.verification_id),
    items: row.items as OrderItemInput[],
    serviceType: row.service_type === "dine_in" || row.service_type === "take_out" ? row.service_type : null,
    customerId: row.customer_id === null ? null : Number(row.customer_id),
    idDiscount: { typeId: Number(row.discount_type_id), holderName: String(row.holder_name), idNumber: (row.id_number as string | null) ?? null, lines: (row.lines as { line: number; quantity: number }[] | null) ?? null, groupSize: row.group_size === null ? null : Number(row.group_size), recordedBy: row.decided_by === null ? null : Number(row.decided_by) },
  };
}

// Marks the approval used by the paid order. Throws when it was used or cancelled meanwhile, so
// the payment is refunded instead of giving the discount twice.
export async function markVerificationUsed(client: PoolClient, verificationId: number, orderId: number): Promise<void> {
  const result = await client.query("UPDATE id_verifications SET status = 'used', order_id = $2, photo = NULL, updated_at = CURRENT_TIMESTAMP WHERE verification_id = $1 AND status = 'approved'", [verificationId, orderId]);
  if (result.rowCount === 0) throw new Error("The ID approval was already used or cancelled");
}

// verifiedBy: the staff member who checked the ID (recorded on each discount it gives).
// expiresAt: when it is forgotten unless it is used again (see SAVED_ID_DAYS).
export type SavedIdDiscount = { typeId: number; typeName: string; holderName: string; idNumber: string | null; verifiedBy: number | null; expiresAt: string };

// A saved ID is forgotten after this many days without use: counted from when the café checked it
// or, later, the last completed order it gave the discount on.
export const SAVED_ID_DAYS = 30;
const SAVED_ID_LAST_USED = `GREATEST(c.id_verified_at, (
  SELECT MAX(od.created_at) FROM order_discounts od JOIN sales_orders so ON so.order_id = od.order_id
  WHERE so.customer_id = c.customer_id AND so.status = 'completed' AND od.discount_type_id = c.id_discount_type_id
))`;

// Forgets the saved IDs (one customer's, or everyone's) not used for SAVED_ID_DAYS.
export async function forgetStaleSavedIds(db: Db = pool, customerId: number | null = null): Promise<number> {
  const result = await db.query(`
    UPDATE customers c SET id_discount_type_id = NULL, id_discount_name = NULL, id_discount_number = NULL, id_verified_at = NULL, id_verified_by = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE c.id_verified_at IS NOT NULL AND ($1::int IS NULL OR c.customer_id = $1::int)
      AND ${SAVED_ID_LAST_USED} < CURRENT_TIMESTAMP - make_interval(days => $2::int)
  `, [customerId, SAVED_ID_DAYS]);
  return result.rowCount ?? 0;
}

// The ID remembered on a customer's account, while its discount is still switched on (an ID not
// used for SAVED_ID_DAYS is forgotten first).
export async function savedIdDiscount(customerId: number, db: Db = pool): Promise<SavedIdDiscount | null> {
  await forgetStaleSavedIds(db, customerId);
  const result = await db.query(`
    SELECT c.id_discount_type_id, dt.name, c.id_discount_name, c.id_discount_number, c.id_verified_by,
      TO_CHAR((${SAVED_ID_LAST_USED} + make_interval(days => $2::int)) AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS expires_at
    FROM customers c JOIN discount_types dt ON dt.discount_type_id = c.id_discount_type_id AND dt.is_active = TRUE
    WHERE c.customer_id = $1 AND c.id_verified_at IS NOT NULL AND c.id_discount_name IS NOT NULL
  `, [customerId, SAVED_ID_DAYS]);
  const row = result.rows[0];
  return row ? { typeId: Number(row.id_discount_type_id), typeName: String(row.name), holderName: String(row.id_discount_name), idNumber: (row.id_discount_number as string | null) ?? null, verifiedBy: row.id_verified_by === null ? null : Number(row.id_verified_by), expiresAt: String(row.expires_at) } : null;
}

// Which of the order's items a mobile ID discount covers: { lines: [{ line, quantity }] } or
// { group_size } for a shared bill.
export function parseCoverage(value: unknown): { lines: { line: number; quantity: number }[] | null; groupSize: number | null } {
  const raw = (value ?? {}) as { lines?: unknown; group_size?: unknown };
  const groupSize = Number(raw.group_size);
  if (!Array.isArray(raw.lines)) return { lines: null, groupSize: Number.isInteger(groupSize) ? groupSize : null };
  return { lines: raw.lines.map((line) => { const item = (line ?? {}) as { line?: unknown; quantity?: unknown }; return { line: Number(item.line), quantity: Number(item.quantity) }; }), groupSize: null };
}
