import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { cleanName, getCustomerSession } from "@/lib/customers";
import { normalizePhone } from "@/lib/delivery";

// The signed-in customer's delivery addresses (see delivery-setup-migration.sql). Each address is
// in one of the café's delivery zones and has the recipient and their mobile number for the rider.
//   POST    add one          PATCH  { id, ... } edit, or { id, action: "default" }
//   DELETE  ?id=             the address book keeps a default while it has addresses

const MAX_ADDRESSES = 10;
type AddressInput = { id?: unknown; action?: unknown; label?: unknown; recipientName?: unknown; phone?: unknown; zoneId?: unknown; street?: unknown; landmark?: unknown; riderNotes?: unknown; isDefault?: unknown };
const text = (value: unknown, max: number) => typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";

async function clean(body: AddressInput) {
  const label = text(body.label, 30) || "Home";
  const recipientName = cleanName(body.recipientName) ?? "";
  const phone = normalizePhone(body.phone);
  const street = text(body.street, 200);
  const zoneId = Number(body.zoneId);
  if (recipientName.length < 2) return "Enter who receives the order.";
  if (!phone) return "Enter a mobile number like 0917 123 4567.";
  if (!Number.isInteger(zoneId) || zoneId <= 0) return "Choose your area.";
  const zone = await pool.query("SELECT 1 FROM delivery_zones WHERE zone_id = $1 AND is_active = TRUE", [zoneId]);
  if (zone.rowCount === 0) return "The café no longer delivers to that area. Choose another one.";
  if (street.length < 3) return "Enter the house number and street.";
  return { label, recipientName, phone, zoneId, street, landmark: text(body.landmark, 120) || null, riderNotes: text(body.riderNotes, 200) || null, isDefault: body.isDefault === true };
}

async function keepOneDefault(customerId: number, preferId: number | null) {
  if (preferId !== null) await pool.query("UPDATE customer_addresses SET is_default = (address_id = $2), updated_at = CURRENT_TIMESTAMP WHERE customer_id = $1", [customerId, preferId]);
  const defaults = await pool.query("SELECT COUNT(*)::int AS n FROM customer_addresses WHERE customer_id = $1 AND is_default", [customerId]);
  if (Number(defaults.rows[0].n) === 0) await pool.query("UPDATE customer_addresses SET is_default = TRUE WHERE address_id = (SELECT address_id FROM customer_addresses WHERE customer_id = $1 ORDER BY updated_at DESC LIMIT 1)", [customerId]);
}

export async function POST(request: Request) {
  const session = await getCustomerSession();
  if (!session) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  try {
    const fields = await clean(await request.json() as AddressInput);
    if (typeof fields === "string") return NextResponse.json({ error: fields }, { status: 400 });
    const count = await pool.query("SELECT COUNT(*)::int AS n FROM customer_addresses WHERE customer_id = $1", [session.customerId]);
    if (Number(count.rows[0].n) >= MAX_ADDRESSES) return NextResponse.json({ error: `You can keep up to ${MAX_ADDRESSES} addresses. Remove one first.` }, { status: 400 });
    const inserted = await pool.query(`
      INSERT INTO customer_addresses (customer_id, label, recipient_name, phone, zone_id, street, landmark, rider_notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING address_id
    `, [session.customerId, fields.label, fields.recipientName, fields.phone, fields.zoneId, fields.street, fields.landmark, fields.riderNotes]);
    const id = Number(inserted.rows[0].address_id);
    await keepOneDefault(session.customerId, fields.isDefault || Number(count.rows[0].n) === 0 ? id : null);
    return NextResponse.json({ data: { id } }, { status: 201 });
  } catch (error) {
    console.error("POST /api/account/addresses failed:", error);
    return NextResponse.json({ error: "Could not save the address." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await getCustomerSession();
  if (!session) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  try {
    const body = await request.json() as AddressInput;
    const id = Number(body.id);
    const owned = await pool.query("SELECT 1 FROM customer_addresses WHERE address_id = $1 AND customer_id = $2", [id, session.customerId]);
    if (!Number.isInteger(id) || owned.rowCount === 0) return NextResponse.json({ error: "That address is no longer in your account." }, { status: 404 });
    if (body.action === "default") {
      await keepOneDefault(session.customerId, id);
      return NextResponse.json({ data: { id } });
    }
    const fields = await clean(body);
    if (typeof fields === "string") return NextResponse.json({ error: fields }, { status: 400 });
    await pool.query(`
      UPDATE customer_addresses SET label = $3, recipient_name = $4, phone = $5, zone_id = $6, street = $7, landmark = $8, rider_notes = $9, updated_at = CURRENT_TIMESTAMP
      WHERE address_id = $1 AND customer_id = $2
    `, [id, session.customerId, fields.label, fields.recipientName, fields.phone, fields.zoneId, fields.street, fields.landmark, fields.riderNotes]);
    await keepOneDefault(session.customerId, fields.isDefault ? id : null);
    return NextResponse.json({ data: { id } });
  } catch (error) {
    console.error("PATCH /api/account/addresses failed:", error);
    return NextResponse.json({ error: "Could not save the address." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await getCustomerSession();
  if (!session) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Choose an address." }, { status: 400 });
  try {
    await pool.query("DELETE FROM customer_addresses WHERE address_id = $1 AND customer_id = $2", [id, session.customerId]);
    await keepOneDefault(session.customerId, null);
    return NextResponse.json({ data: { id } });
  } catch (error) {
    console.error("DELETE /api/account/addresses failed:", error);
    return NextResponse.json({ error: "Could not remove the address." }, { status: 500 });
  }
}
