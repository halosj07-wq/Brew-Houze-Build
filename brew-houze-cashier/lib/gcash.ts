import type { PoolClient } from "pg";
import pool from "@/lib/db";

// How customers pay with GCash on this deployment (see gcash-direct-migration.sql).
// brew-houze-admin, brew-houze-cashier and brew-houze-mobile keep identical copies of this file.
//
//   paymongo   (the default: Brew Houze Build, for the defense) through PayMongo, which confirms
//              each payment itself (lib/paymongo.ts)
//   direct_qr  (GCASH_METHOD=direct_qr: the café) to the café's own GCash QR. At the counter the
//              cashier sees the payment and types its reference number; on the mobile menu the
//              customer sends the reference number and a screenshot, and the cashier confirms it
//              against the café's GCash before the order is made. No fees, no payouts.

type Db = PoolClient | typeof pool;

export type GcashMethod = "paymongo" | "direct_qr";

export function gcashMethod(): GcashMethod {
  return process.env.GCASH_METHOD?.trim().toLowerCase() === "direct_qr" ? "direct_qr" : "paymongo";
}

// A mobile customer has this long to pay the QR and send the reference number.
export const DIRECT_PAY_MINUTES = 30;

// The café's GCash account, set in Admin → Treasury: the QR image customers pay, and the name and
// number shown under it (so customers can check they are paying the café, or send to the number).
const KEYS = { image: "gcash_qr_image", name: "gcash_account_name", number: "gcash_account_number" } as const;
export const GCASH_SETTING_KEYS = KEYS;

export type GcashAccount = { name: string; number: string; hasQr: boolean; version: string | null };

export async function gcashAccount(db: Db = pool): Promise<GcashAccount> {
  const result = await db.query(`
    SELECT setting_key, CASE WHEN setting_key = $1 THEN NULL ELSE setting_value END AS value, setting_value <> '' AS present,
      EXTRACT(EPOCH FROM updated_at)::bigint AS version
    FROM store_settings WHERE setting_key = ANY ($2::text[])
  `, [KEYS.image, Object.values(KEYS)]);
  const rows = new Map(result.rows.map((row) => [String(row.setting_key), row]));
  const image = rows.get(KEYS.image);
  return {
    name: String(rows.get(KEYS.name)?.value ?? ""),
    number: String(rows.get(KEYS.number)?.value ?? ""),
    hasQr: Boolean(image?.present),
    version: image?.present ? String(image.version) : null,
  };
}

// The QR image (stored as a data URL), for the page that serves it.
export async function gcashQrImage(db: Db = pool): Promise<{ mime: string; bytes: Buffer } | null> {
  const result = await db.query("SELECT setting_value FROM store_settings WHERE setting_key = $1", [KEYS.image]);
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(result.rows[0]?.setting_value ?? ""));
  return match ? { mime: match[1], bytes: Buffer.from(match[2], "base64") } : null;
}

// Whether direct GCash can be offered: switched on, with the café's QR set.
export async function directGcashReady(db: Db = pool): Promise<boolean> {
  return gcashMethod() === "direct_qr" && (await gcashAccount(db)).hasQr;
}

// A GCash reference number: 13 digits (spaces and dashes as GCash prints them are fine).
export function normalizeGcashReference(value: unknown): string | null {
  const digits = String(value ?? "").replace(/[\s-]/g, "");
  return /^\d{13}$/.test(digits) ? digits : null;
}

// Whether a reference number already paid for an order, or is waiting on another payment.
export async function gcashReferenceUsed(db: Db, reference: string, exceptCheckoutId: number | null = null): Promise<boolean> {
  const result = await db.query(`
    SELECT 1 FROM sales_orders WHERE payment_provider = 'gcash_direct' AND payment_reference = $1
    UNION ALL
    SELECT 1 FROM payment_checkouts
    WHERE provider = 'gcash_direct' AND reference_number = $1 AND status NOT IN ('failed', 'cancelled') AND ($2::int IS NULL OR checkout_id <> $2::int)
    LIMIT 1
  `, [reference, exceptCheckoutId]);
  return (result.rowCount ?? 0) > 0;
}

export const GCASH_REFERENCE_USED = "That GCash reference number was already used for another payment. Check the number on the receipt.";
