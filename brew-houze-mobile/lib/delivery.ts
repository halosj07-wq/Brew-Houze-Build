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

// A delivery order, checked before it is placed (the order itself adds the fee: see lib/orders.ts).
// The address is copied, so later edits to the address book do not change past orders. customerId
// and addressId are null for a guest (or a Messenger order at the counter) with the address typed in.
// payment "gcash" means paid before it leaves (GCash, or cash at the counter); "cod": the rider collects.
export type DeliveryPayment = "gcash" | "cod";
export type DeliveryPlan = {
  customerId: number | null; addressId: number | null; recipientName: string; phone: string; street: string; landmark: string | null; riderNotes: string | null;
  zoneId: number; zoneName: string; zoneFee: number; zoneMinOrder: number | null; freeAbove: number | null;
  payment: DeliveryPayment; codMaxAmount: number | null;
};
export const ACTIVE_DELIVERY_STATUSES = ["preparing", "ready", "out"];

type TypedAddress = { recipient_name?: unknown; phone?: unknown; zone_id?: unknown; street?: unknown; landmark?: unknown; rider_notes?: unknown };
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

// A typed-in address: who receives it, a mobile number, the street, and an active zone.
async function typedAddress(db: Db, raw: TypedAddress) {
  const recipientName = text(raw.recipient_name);
  const phone = normalizePhone(raw.phone);
  const street = text(raw.street);
  const landmark = text(raw.landmark);
  const riderNotes = text(raw.rider_notes);
  const zoneId = Number(raw.zone_id);
  if (recipientName.length < 2 || recipientName.length > 80) throw new Error("Add the name of who receives the order.");
  if (!phone) throw new Error("Add a mobile number the rider can call, like 0917 123 4567.");
  if (street.length < 3 || street.length > 200) throw new Error("Add the house number and street for the rider.");
  if (landmark.length > 120 || riderNotes.length > 200) throw new Error("The landmark or rider notes are too long.");
  if (!Number.isInteger(zoneId) || zoneId <= 0) throw new Error("Choose the area for the delivery.");
  const zone = await db.query("SELECT zone_id, name AS zone_name, fee, min_order, is_active FROM delivery_zones WHERE zone_id = $1", [zoneId]);
  const row = zone.rows[0];
  if (!row || !row.is_active) throw new Error("The café doesn't deliver to that area. Choose another one.");
  return { ...row, address_id: null, recipient_name: recipientName, phone, street, landmark: landmark || null, rider_notes: riderNotes || null };
}

// Checks that delivery is on and open, the address is the customer's (or typed in) and in an
// active zone, the café is not at its delivery limit, and (for cash on delivery) that this customer
// may use it. Guests pay by GCash. Throws with a message for the customer.
// staff: an order the counter takes (a Messenger order): the café decides, so only the address
// and zone are checked, and cash on delivery is open to anyone.
export async function planDelivery(db: Db, customerId: number | null, input: unknown, options: { staff?: boolean } = {}): Promise<DeliveryPlan> {
  const staff = options.staff === true;
  const raw = (input ?? {}) as { address_id?: unknown; address?: unknown; payment?: unknown };
  const payment: DeliveryPayment = raw.payment === "cod" ? "cod" : "gcash";
  const settings = await deliverySettings(db);
  if (!staff) {
    if (!settings.enabled) throw new Error("Delivery is not available right now. Choose Dine in or Take Out.");
    if (!withinDeliveryHours(settings)) throw new Error(`Delivery is only available from ${settings.start} to ${settings.end}.`);
    if (customerId === null && payment === "cod") throw new Error("Sign in to pay cash on delivery, or pay with GCash.");
  }
  let row;
  if (raw.address_id !== undefined && raw.address_id !== null) {
    const addressId = Number(raw.address_id);
    if (customerId === null) throw new Error("Sign in to use your saved addresses.");
    if (!Number.isInteger(addressId) || addressId <= 0) throw new Error("Choose the delivery address.");
    const address = await db.query(`
      SELECT a.address_id, a.recipient_name, a.phone, a.street, a.landmark, a.rider_notes, z.zone_id, z.name AS zone_name, z.fee, z.min_order, z.is_active
      FROM customer_addresses a JOIN delivery_zones z ON z.zone_id = a.zone_id
      WHERE a.address_id = $1 AND a.customer_id = $2
    `, [addressId, customerId]);
    row = address.rows[0];
    if (!row) throw new Error("That address is no longer in your account. Choose another one.");
    if (!row.is_active) throw new Error(`The café no longer delivers to ${row.zone_name}. Choose another address.`);
  } else if (raw.address && typeof raw.address === "object") {
    row = await typedAddress(db, raw.address as TypedAddress);
  } else {
    throw new Error("Choose the delivery address.");
  }
  if (!staff && settings.maxActive !== null) {
    const active = await db.query("SELECT COUNT(*)::int AS n FROM deliveries WHERE status = ANY($1::text[])", [ACTIVE_DELIVERY_STATUSES]);
    if (Number(active.rows[0].n) >= settings.maxActive) throw new Error("The café has as many deliveries as it can handle right now. Please try again in a few minutes, or choose Take Out.");
  }
  if (!staff && payment === "cod") {
    if (!settings.cod.enabled) throw new Error("Cash on delivery is not available. Pay with GCash instead.");
    const customer = await db.query(`
      SELECT c.cod_blocked, (SELECT COUNT(*)::int FROM sales_orders so WHERE so.customer_id = c.customer_id AND so.status = 'completed') AS completed
      FROM customers c WHERE c.customer_id = $1
    `, [customerId]);
    if (customer.rows[0]?.cod_blocked) throw new Error("Cash on delivery is not available for your account. Pay with GCash instead.");
    if (Number(customer.rows[0]?.completed ?? 0) < settings.cod.minOrders) throw new Error(`Cash on delivery opens after ${settings.cod.minOrders} completed order${settings.cod.minOrders === 1 ? "" : "s"}. Pay with GCash this time.`);
  }
  return {
    customerId, addressId: row.address_id === null ? null : Number(row.address_id), recipientName: String(row.recipient_name), phone: String(row.phone), street: String(row.street), landmark: (row.landmark as string | null) ?? null, riderNotes: (row.rider_notes as string | null) ?? null,
    zoneId: Number(row.zone_id), zoneName: String(row.zone_name), zoneFee: Number(row.fee), zoneMinOrder: row.min_order === null ? null : Number(row.min_order), freeAbove: settings.freeAbove,
    payment, codMaxAmount: payment === "cod" && !staff ? settings.cod.maxAmount : null,
  };
}

// The fee on a delivery order: the zone's fee, or free at or above the free delivery amount
// (compared with what the customer pays for the items, after discounts).
export function deliveryFeeFor(plan: Pick<DeliveryPlan, "zoneFee" | "freeAbove">, itemsAfterDiscounts: number): number {
  return plan.freeAbove !== null && itemsAfterDiscounts + 0.005 >= plan.freeAbove ? 0 : plan.zoneFee;
}
