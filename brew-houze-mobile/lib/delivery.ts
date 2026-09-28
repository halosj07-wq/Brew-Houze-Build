import type { PoolClient } from "pg";
import pool from "@/lib/db";

// Delivery setup (see delivery-setup-migration.sql): the rules the admin sets in Admin, Delivery,
// the zones and their fees, and customer mobile numbers. brew-houze-cashier and brew-houze-mobile
// keep identical copies of this file.

type Db = PoolClient | typeof pool;

export type DeliverySettings = {
  enabled: boolean;
  // "HH:MM" in Philippine time, or null: whenever a shift is open.
  start: string | null; end: string | null;
  maxActive: number | null; freeAbove: number | null;
  cod: { enabled: boolean; maxAmount: number; minOrders: number };
};
export type DeliveryZone = { id: number; name: string; description: string | null; fee: number; minOrder: number | null; isActive: boolean };

const time = (value: string | undefined) => value && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : null;
const positive = (value: string | undefined) => { const number = Number(value); return value && Number.isFinite(number) && number > 0 ? number : null; };

export async function deliverySettings(db: Db = pool): Promise<DeliverySettings> {
  const result = await db.query("SELECT setting_key, setting_value FROM store_settings WHERE setting_key LIKE 'delivery_%' OR setting_key LIKE 'cod_%'");
  const values = new Map(result.rows.map((row) => [String(row.setting_key), String(row.setting_value)]));
  return {
    enabled: values.get("delivery_enabled") === "true",
    start: time(values.get("delivery_start")), end: time(values.get("delivery_end")),
    maxActive: positive(values.get("delivery_max_active")), freeAbove: positive(values.get("delivery_free_above")),
    cod: { enabled: values.get("cod_enabled") === "true", maxAmount: positive(values.get("cod_max_amount")) ?? 0, minOrders: Math.max(0, Math.floor(Number(values.get("cod_min_orders") ?? 0)) || 0) },
  };
}

// Whether now (Philippine time) is within the delivery hours. Hours may run past midnight.
export function withinDeliveryHours(settings: Pick<DeliverySettings, "start" | "end">, now = new Date()): boolean {
  if (!settings.start || !settings.end) return true;
  const current = now.toLocaleTimeString("en-GB", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", hour12: false });
  return settings.start <= settings.end ? current >= settings.start && current < settings.end : current >= settings.start || current < settings.end;
}

export async function deliveryZones(db: Db = pool, activeOnly = true): Promise<DeliveryZone[]> {
  const result = await db.query(`
    SELECT zone_id, name, description, fee, min_order, is_active FROM delivery_zones
    ${activeOnly ? "WHERE is_active = TRUE" : ""} ORDER BY sort_order, name, zone_id
  `);
  return result.rows.map((row) => ({ id: Number(row.zone_id), name: String(row.name), description: (row.description as string | null) ?? null, fee: Number(row.fee), minOrder: row.min_order === null ? null : Number(row.min_order), isActive: Boolean(row.is_active) }));
}

// A Philippine mobile number as 09XXXXXXXXX (accepts +63 9…, 63 9…, 9…, with spaces or dashes).
// null when it is not a mobile number.
export function normalizePhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digits = value.replace(/[\s()-]/g, "").replace(/^\+/, "");
  const local = digits.startsWith("63") ? `0${digits.slice(2)}` : digits.startsWith("9") ? `0${digits}` : digits;
  return /^09\d{9}$/.test(local) ? local : null;
}
