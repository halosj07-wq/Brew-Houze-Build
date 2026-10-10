import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { parseOrderItems, parseServiceType, quoteOrderBreakdown, isSoldOut } from "@/lib/orders";
import { cleanupIdVerifications, PENDING_MINUTES } from "@/lib/id-verifications";
import { getCustomerSession } from "@/lib/customers";
import { signalChange } from "@/lib/realtime";

// Sends an ID photo for the café to check (see lib/id-verifications.ts), with the order it is for:
// the items and dine in or take out. Which items the discount covers (or a shared bill) is not the
// customer's choice: the cashier picks it when approving. The order is checked now (open shift, stock, prices, the discount itself) but nothing is ordered
// until the cashier approves and the customer pays. The customer agreed to the photo being used
// for this check only; it is deleted once the cashier decides.

const MAX_PENDING = 30;
// About 3 MB of image data after the phone shrinks it (usually far less).
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

export async function POST(request: Request) {
  // Live screens reload once this is saved (a failed request only causes an extra reload).
  signalChange("line");
  const client = await pool.connect();
  try {
    const body = await request.json() as { items?: unknown; service_type?: unknown; discount_type_id?: unknown; holder_name?: unknown; id_number?: unknown; remember?: unknown; consent?: unknown; photo?: unknown };
    if (body.consent !== true) return NextResponse.json({ error: "Agree to the photo being used to check your discount first." }, { status: 400 });
    const items = parseOrderItems(body.items).map((item) => ({ ...item, additionIds: Array.from(new Set(item.additionIds)) }));
    if (items.length === 0) return NextResponse.json({ error: "Add something to your order first." }, { status: 400 });
    if (items.some((item) => item.rewardId)) return NextResponse.json({ error: "Star rewards and ID discounts don't go together. Remove your rewards first." }, { status: 400 });
    const photo = typeof body.photo === "string" ? /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(body.photo) : null;
    if (!photo) return NextResponse.json({ error: "Take a photo of your ID." }, { status: 400 });
    const photoBytes = Buffer.from(photo[2], "base64");
    if (photoBytes.length < 2000 || photoBytes.length > MAX_PHOTO_BYTES) return NextResponse.json({ error: "That photo could not be used. Please take it again." }, { status: 400 });

    const typeId = Number(body.discount_type_id);
    const holderName = typeof body.holder_name === "string" ? body.holder_name.trim().replace(/\s+/g, " ") : "";
    const idNumber = typeof body.id_number === "string" && body.id_number.trim() ? body.id_number.trim().slice(0, 40) : null;
    const serviceType = parseServiceType(body.service_type);
    const customer = await getCustomerSession();

    await cleanupIdVerifications(client);
    const pending = await client.query("SELECT COUNT(*)::int AS count FROM id_verifications WHERE status = 'pending'");
    if (Number(pending.rows[0].count) >= MAX_PENDING) return NextResponse.json({ error: "Lots of IDs are waiting to be checked right now. Please try again in a few minutes, or order at the counter." }, { status: 429 });

    // Checks the order and the discount (throws with the reason). Until the cashier picks what it
    // covers, the estimate is the most it could be: every item covered.
    const estimate = await quoteOrderBreakdown(client, { items, source: "mobile", cashierAdminId: null, idDiscounts: [{ typeId, holderName, idNumber, lines: items.map((item, line) => ({ line, quantity: item.quantity })), groupSize: null }] });

    const token = randomUUID();
    const inserted = await client.query(`
      INSERT INTO id_verifications (public_token, customer_id, discount_type_id, holder_name, id_number, items, lines, group_size, service_type, photo, photo_type, remember, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP + ($13 || ' minutes')::interval)
      RETURNING TO_CHAR(expires_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS expires_at
    `, [token, customer?.customerId ?? null, typeId, holderName, idNumber, JSON.stringify(items), null, null, serviceType, photoBytes, photo[1], Boolean(customer) && body.remember === true, String(PENDING_MINUTES)]);
    return NextResponse.json({ data: { token, estimate, expiresAt: String(inserted.rows[0].expires_at) } }, { status: 201 });
  } catch (error) {
    if (isSoldOut(error)) return NextResponse.json({ error: "Some items in your cart just sold out.", code: "sold_out" }, { status: 409 });
    console.error("POST /api/id-verifications failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not send your ID." }, { status: 400 });
  } finally {
    client.release();
  }
}
