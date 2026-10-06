import type { PoolClient } from "pg";
import type pool from "@/lib/db";

// The treasury (see treasury-migration.sql, treasury-paymongo-migration.sql and
// gcash-direct-migration.sql): the owner's logbook of where the business money is. Accounts:
//   safe      the cash box: shifts take their float from it and put their closing cash back
//   paymongo  the money PayMongo holds for the cafe: each closing adds the shift's GCash
//             payments and takes off PayMongo's fees, and the admin records the weekly payouts
//   gcash     the café's own GCash wallet (direct GCash, lib/gcash.ts): each closing adds the
//             shift's GCash payments, with no fees
// Every move in or out is an entry with the balance right after it, written in the same
// transaction as the shift or drawer change behind it. Until an admin enters an account's
// opening balance (go live), that account is not used.

export type Safe = { accountId: number; balance: number; live: boolean };
export type TreasuryAccountKey = "safe" | "paymongo" | "gcash";

export type SafeEntryKind = "opening_balance" | "deposit" | "withdrawal" | "float_out" | "float_return" | "shift_deposit" | "cash_drop" | "cash_top_up" | "correction" | "gcash_sales" | "gateway_fee" | "payout" | "expense";

// Expenses (see expenses-migration.sql): what the cafe spends to run, apart from the ingredients it
// sells (restocking is already in the cost of goods). Paid from the safe, the drawer (a cash out)
// or by the owner. The categories the apps offer:
export const EXPENSE_CATEGORIES = ["Supplies", "Wages", "Rent", "Utilities", "Repairs & maintenance", "Delivery", "Staff meals", "Other"];

// The category of a cash out, from its reason.
export function expenseCategoryFor(reason: string): string {
  const text = reason.trim().toLowerCase();
  if (text === "supplies" || text === "ice") return "Supplies";
  if (text === "delivery") return "Delivery";
  if (text === "staff meal" || text === "staff meals") return "Staff meals";
  return EXPENSE_CATEGORIES.find((category) => category.toLowerCase() === text) ?? "Other";
}

// Every cash out is an expense paid from the drawer, dated by its shift's business day.
export async function recordDrawerExpense(client: PoolClient, input: { movementId: number; shiftId: number; reason: string; amount: number; note?: string | null; category?: string; description?: string; adminId: number | null; sourceApp: "cashier" | "admin" }) {
  await client.query(`
    INSERT INTO expenses (spent_on, category, description, amount, paid_from, shift_id, movement_id, note, admin_id, source_app)
    SELECT (opened_at AT TIME ZONE 'Asia/Manila')::date, $2, $3, $4, 'drawer', $1, $5, NULLIF($6, ''), $7, $8
    FROM shifts WHERE shift_id = $1
  `, [input.shiftId, input.category ?? expenseCategoryFor(input.reason), input.description ?? input.reason, input.amount, input.movementId, input.note ?? "", input.adminId, input.sourceApp]);
}

const ACCOUNT_WHERE: Record<TreasuryAccountKey, string> = { safe: "kind = 'safe'", paymongo: "kind = 'ewallet' AND LOWER(name) = 'paymongo'", gcash: "kind = 'ewallet' AND LOWER(name) = 'gcash'" };

const round = (value: number) => Math.round(value * 100) / 100;

// Thrown when a move would take an account below ₱0. The transaction should be rolled back.
export class SafeShortError extends Error {
  constructor(public available: number, public needed: number) {
    super("The account does not have enough money.");
  }
}

// Locks an account for the rest of the transaction, so two moves cannot both read the same
// balance. In every route lock the shift first (if any), then the safe, then PayMongo, so they
// never wait on each other.
export async function lockAccount(client: PoolClient, key: TreasuryAccountKey): Promise<Safe | null> {
  const result = await client.query(`SELECT account_id, balance, opened_at FROM treasury_accounts WHERE ${ACCOUNT_WHERE[key]} AND is_archived = FALSE FOR UPDATE`);
  const row = result.rows[0];
  if (!row) return null;
  return { accountId: Number(row.account_id), balance: Number(row.balance), live: row.opened_at !== null };
}

export function lockSafe(client: PoolClient): Promise<Safe | null> {
  return lockAccount(client, "safe");
}

// Adds an entry (amount: plus into the safe, minus out of it) and updates the balance.
export async function addSafeEntry(client: PoolClient, safe: Safe, entry: {
  kind: SafeEntryKind; amount: number; reason: string; note?: string | null; shiftId?: number | null; movementId?: number | null;
  correctsEntryId?: number | null; adminId: number | null; sourceApp: "cashier" | "admin";
}): Promise<number> {
  const amount = round(entry.amount);
  const after = round(safe.balance + amount);
  if (after < 0) throw new SafeShortError(safe.balance, -amount);
  const inserted = await client.query(`
    INSERT INTO treasury_entries (account_id, kind, amount, balance_after, shift_id, movement_id, corrects_entry_id, reason, note, admin_id, source_app)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULLIF($9, ''), $10, $11)
    RETURNING entry_id
  `, [safe.accountId, entry.kind, amount, after, entry.shiftId ?? null, entry.movementId ?? null, entry.correctsEntryId ?? null, entry.reason, entry.note ?? "", entry.adminId, entry.sourceApp]);
  await client.query("UPDATE treasury_accounts SET balance = $1, updated_at = CURRENT_TIMESTAMP WHERE account_id = $2", [after, safe.accountId]);
  safe.balance = after;
  return Number(inserted.rows[0].entry_id);
}

// The cash the last closing left in the drawer for the next shift (0 when none was kept).
export async function lastFloatKept(client: PoolClient | typeof pool): Promise<number> {
  const result = await client.query("SELECT float_kept FROM shifts WHERE closed_at IS NOT NULL ORDER BY closed_at DESC LIMIT 1");
  return Number(result.rows[0]?.float_kept ?? 0);
}

// Whether the safe is in use, for the open and close screens.
export async function safeIsLive(client: PoolClient | typeof pool): Promise<boolean> {
  const result = await client.query("SELECT 1 FROM treasury_accounts WHERE kind = 'safe' AND is_archived = FALSE AND opened_at IS NOT NULL");
  return (result.rowCount ?? 0) > 0;
}

// Opening a shift: the drawer starts with what the last closing left in it, and the difference
// comes from (or goes back to) the safe.
export async function recordShiftFloat(client: PoolClient, input: { shiftId: number; startingCash: number; carried: number; adminId: number | null; sourceApp: "cashier" | "admin" }) {
  const safe = await lockSafe(client);
  if (!safe?.live) return;
  const difference = round(input.startingCash - input.carried);
  if (difference > 0) await addSafeEntry(client, safe, { kind: "float_out", amount: -difference, reason: `Float for shift #${input.shiftId}`, shiftId: input.shiftId, adminId: input.adminId, sourceApp: input.sourceApp });
  if (difference < 0) await addSafeEntry(client, safe, { kind: "float_return", amount: -difference, reason: `Float returned by shift #${input.shiftId}`, shiftId: input.shiftId, adminId: input.adminId, sourceApp: input.sourceApp });
}

// Closing a shift: the counted cash not kept in the drawer goes to the safe.
export async function recordShiftDeposit(client: PoolClient, input: { shiftId: number; countedCash: number; floatKept: number; adminId: number | null; sourceApp: "cashier" | "admin" }) {
  const safe = await lockSafe(client);
  if (!safe?.live) return;
  const deposit = round(input.countedCash - input.floatKept);
  if (deposit > 0) await addSafeEntry(client, safe, { kind: "shift_deposit", amount: deposit, reason: `Closing of shift #${input.shiftId}`, shiftId: input.shiftId, adminId: input.adminId, sourceApp: input.sourceApp });
}

// Closing a shift: the GCash its customers paid through PayMongo goes into the PayMongo account,
// and the fees PayMongo kept come off it. Voided and refunded GCash orders count too: PayMongo
// still holds their payment (the money goes back to the customer by hand, not through PayMongo).
// GCash paid straight to the café's QR goes into the GCash account the same way, with no fees.
export async function recordShiftGcash(client: PoolClient, input: { shiftId: number; adminId: number | null; sourceApp: "cashier" | "admin" }) {
  await recordShiftDirectGcash(client, input);
  const totals = (await client.query(`
    SELECT COALESCE(SUM(CASE WHEN payment_method = 'split' THEN total_amount - COALESCE(cash_portion, 0) ELSE total_amount END), 0) AS gross,
      COALESCE(SUM(payment_fee), 0) AS fees,
      COUNT(*)::int AS payments,
      COUNT(*) FILTER (WHERE payment_fee IS NULL)::int AS unknown_fees
    FROM sales_orders
    WHERE shift_id = $1 AND payment_provider = 'paymongo_gcash'
  `, [input.shiftId])).rows[0];
  const gross = round(Number(totals.gross));
  const fees = round(Number(totals.fees));
  if (gross <= 0) return;
  const account = await lockAccount(client, "paymongo");
  if (!account?.live) return;
  const count = Number(totals.payments);
  const unknown = Number(totals.unknown_fees);
  const later = unknown ? `${unknown} fee${unknown === 1 ? " was" : "s were"} not known at closing and ${unknown === 1 ? "is" : "are"} taken off when PayMongo reports ${unknown === 1 ? "it" : "them"}` : null;
  await addSafeEntry(client, account, { kind: "gcash_sales", amount: gross, reason: `GCash of shift #${input.shiftId} (${count} payment${count === 1 ? "" : "s"})`, note: later, shiftId: input.shiftId, adminId: input.adminId, sourceApp: input.sourceApp });
  if (fees > 0) await addSafeEntry(client, account, { kind: "gateway_fee", amount: -fees, reason: `PayMongo fees of shift #${input.shiftId}`, note: later, shiftId: input.shiftId, adminId: input.adminId, sourceApp: input.sourceApp });
}

async function recordShiftDirectGcash(client: PoolClient, input: { shiftId: number; adminId: number | null; sourceApp: "cashier" | "admin" }) {
  const totals = (await client.query(`
    SELECT COALESCE(SUM(CASE WHEN payment_method = 'split' THEN total_amount - COALESCE(cash_portion, 0) ELSE total_amount END), 0) AS gross, COUNT(*)::int AS payments
    FROM sales_orders WHERE shift_id = $1 AND payment_provider = 'gcash_direct'
  `, [input.shiftId])).rows[0];
  const gross = round(Number(totals.gross));
  if (gross <= 0) return;
  const account = await lockAccount(client, "gcash");
  if (!account?.live) return;
  const count = Number(totals.payments);
  await addSafeEntry(client, account, { kind: "gcash_sales", amount: gross, reason: `GCash of shift #${input.shiftId} (${count} payment${count === 1 ? "" : "s"})`, shiftId: input.shiftId, adminId: input.adminId, sourceApp: input.sourceApp });
}

// A fee read from PayMongo after its shift was closed: the closing could not take it off, so it
// comes off the PayMongo account now (only if that closing put the shift's GCash there).
export async function recordLateFee(client: PoolClient, input: { orderId: number; shiftId: number | null; fee: number }) {
  if (input.shiftId === null || input.fee <= 0) return;
  // Waits for a closing still running, so the fee is taken off exactly once: by that closing or here.
  const shift = await client.query("SELECT closed_at FROM shifts WHERE shift_id = $1 FOR SHARE", [input.shiftId]);
  if (!shift.rows[0]?.closed_at) return;
  const credited = await client.query("SELECT 1 FROM treasury_entries te JOIN treasury_accounts ta ON ta.account_id = te.account_id WHERE te.kind = 'gcash_sales' AND te.shift_id = $1 AND LOWER(ta.name) = 'paymongo'", [input.shiftId]);
  if (!credited.rowCount) return;
  const account = await lockAccount(client, "paymongo");
  if (!account?.live) return;
  await addSafeEntry(client, account, { kind: "gateway_fee", amount: -input.fee, reason: `PayMongo fee of order #${input.orderId} (shift #${input.shiftId}, read after closing)`, shiftId: input.shiftId, adminId: null, sourceApp: "cashier" });
}

// A drawer movement: a cash drop goes into the safe, a cash in comes out of it.
export async function recordDrawerMovement(client: PoolClient, input: { kind: string; amount: number; reason: string; shiftId: number; movementId: number; adminId: number | null; sourceApp: "cashier" | "admin" }) {
  if (input.kind !== "cash_drop" && input.kind !== "cash_in") return;
  const safe = await lockSafe(client);
  if (!safe?.live) return;
  if (input.kind === "cash_drop") await addSafeEntry(client, safe, { kind: "cash_drop", amount: input.amount, reason: `Cash drop: ${input.reason}`, shiftId: input.shiftId, movementId: input.movementId, adminId: input.adminId, sourceApp: input.sourceApp });
  else await addSafeEntry(client, safe, { kind: "cash_top_up", amount: -input.amount, reason: `Cash in: ${input.reason}`, shiftId: input.shiftId, movementId: input.movementId, adminId: input.adminId, sourceApp: input.sourceApp });
}

export function pesoText(value: number): string {
  return `₱${value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
