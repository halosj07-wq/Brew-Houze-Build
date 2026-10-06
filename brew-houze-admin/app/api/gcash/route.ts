import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { gcashAccount, gcashMethod, gcashQrImage, GCASH_SETTING_KEYS } from "@/lib/gcash";
import { confirmPassword, getSession, WRONG_PASSWORD } from "@/lib/sessions";

// The café's GCash account for direct GCash (GCASH_METHOD=direct_qr, see lib/gcash.ts): the QR
// image customers pay, and the account name and number shown under it.
//   GET                                     the method in use and the account (?image=1: the QR)
//   PUT { image?, name, number, password }  saves them (image: a data URL; leave it out to keep the
//                                           current QR). Confirmed with the admin's password, as
//                                           it decides where customers' money goes.

const MAX_IMAGE_BYTES = 1_500_000;

export async function GET(request: Request) {
  if (!(await getSession())) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  try {
    if (new URL(request.url).searchParams.get("image") === "1") {
      const image = await gcashQrImage();
      if (!image) return new Response("Not found", { status: 404 });
      return new Response(new Uint8Array(image.bytes), { headers: { "Content-Type": image.mime, "Cache-Control": "private, no-store" } });
    }
    return NextResponse.json({ data: { method: gcashMethod(), account: await gcashAccount() } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/gcash failed:", error);
    return NextResponse.json({ error: "Could not load the GCash account." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const session = await getSession();
  if (!session || String(session.role).toLowerCase() !== "admin") return NextResponse.json({ error: "Only an admin can change the GCash account." }, { status: 403 });
  if (gcashMethod() !== "direct_qr") return NextResponse.json({ error: "GCash goes through PayMongo here, so there is no QR to set." }, { status: 409 });
  let body: { image?: unknown; name?: unknown; number?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A valid request is required." }, { status: 400 });
  }
  const name = String(body.name ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  const number = String(body.number ?? "").replace(/[^\d+]/g, "").replace(/^\+?63(?=9\d{9}$)/, "0");
  if (name.length < 2) return NextResponse.json({ error: "Enter the account name as GCash shows it." }, { status: 400 });
  if (!/^09\d{9}$/.test(number)) return NextResponse.json({ error: "Enter the GCash number, for example 0917 123 4567." }, { status: 400 });
  let image: string | null = null;
  if (body.image !== undefined && body.image !== null) {
    const match = typeof body.image === "string" ? /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(body.image) : null;
    const bytes = match ? Buffer.from(match[2], "base64").length : 0;
    if (!match || bytes < 500 || bytes > MAX_IMAGE_BYTES) return NextResponse.json({ error: "That QR image could not be used. Choose the QR picture saved from the GCash app." }, { status: 400 });
    image = body.image as string;
  }
  if (!image && !(await gcashAccount()).hasQr) return NextResponse.json({ error: "Choose the QR image first." }, { status: 400 });
  if (!(await confirmPassword(session.adminId, body.password))) return NextResponse.json(WRONG_PASSWORD, { status: 403 });
  try {
    const values: [string, string][] = [[GCASH_SETTING_KEYS.name, name], [GCASH_SETTING_KEYS.number, number], ...(image ? [[GCASH_SETTING_KEYS.image, image] as [string, string]] : [])];
    for (const [key, value] of values) {
      await pool.query(`
        INSERT INTO store_settings (setting_key, setting_value, updated_by, updated_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = CURRENT_TIMESTAMP
      `, [key, value, session.adminId]);
    }
    return NextResponse.json({ data: { account: await gcashAccount() } });
  } catch (error) {
    console.error("PUT /api/gcash failed:", error);
    return NextResponse.json({ error: "Could not save the GCash account." }, { status: 500 });
  }
}
