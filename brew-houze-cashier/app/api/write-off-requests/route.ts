import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSession, isQueueOnly, QUEUE_ONLY } from "@/lib/sessions";

// Waste reports (see write-off-requests-migration.sql): staff report stock that left without being
// sold, a menu item (for example 1 Cafe Latte 16 oz spilled) or one inventory item (for example
// 1 liter of milk expired). Nothing comes off stock here: an admin approves the report in the admin
// app (the stock is written off then) or rejects it.
//
//   GET  /api/write-off-requests  -> what can be reported (menu items and inventory items) and the
//                                    reports of the open shift (or the last 24 hours)
//   POST { action: "report", product_variant_id | inventory_id, quantity, reason, note }
//   POST { action: "cancel", request_id }   -> takes back one's own report before a decision

const REASONS = ["expired", "damaged", "wasted", "in_house", "other"];
const TZ = "Asia/Manila";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (isQueueOnly(session)) return NextResponse.json(QUEUE_ONLY, { status: 403 });
  try {
    const [products, items, reports] = await Promise.all([
      pool.query(`
        SELECT pv.product_variant_id, p.product_name, pv.size_label, COALESCE(NULLIF(TRIM(p.product_category), ''), 'Other') AS category
        FROM product_variants pv JOIN products p ON p.product_id = pv.product_id
        WHERE pv.is_archived = FALSE AND p.is_archived = FALSE
          AND EXISTS (SELECT 1 FROM variant_ingredients vi WHERE vi.product_variant_id = pv.product_variant_id)
        ORDER BY category, p.product_name, pv.product_variant_id
      `),
      pool.query(`
        SELECT inventory_id, item_name, unit_of_measure, is_whole_unit, COALESCE(NULLIF(TRIM(ingredient_category), ''), 'Other') AS category
        FROM inventory WHERE is_archived = FALSE ORDER BY category, item_name
      `),
      pool.query(`
        SELECT r.request_id, r.label, r.quantity, r.reason, r.note, r.status, r.decision_note, r.requested_by, i.unit_of_measure,
          requester.full_name AS requested_by_name, decider.full_name AS decided_by_name,
          TO_CHAR(r.created_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS created_at
        FROM write_off_requests r
        LEFT JOIN inventory i ON i.inventory_id = r.inventory_id
        LEFT JOIN admin_users requester ON requester.admin_id = r.requested_by
        LEFT JOIN admin_users decider ON decider.admin_id = r.decided_by
        WHERE r.shift_id = (SELECT shift_id FROM shifts WHERE closed_at IS NULL LIMIT 1)
          OR (NOT EXISTS (SELECT 1 FROM shifts WHERE closed_at IS NULL) AND r.created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours')
        ORDER BY r.created_at DESC LIMIT 100
      `),
    ]);
    return NextResponse.json({
      data: {
        products: products.rows.map((row) => {
          const size = String(row.size_label ?? "");
          return { productVariantId: Number(row.product_variant_id), label: `${row.product_name}${size && size !== "Regular" ? ` ${size}` : ""}`, category: String(row.category) };
        }),
        items: items.rows.map((row) => ({ inventoryId: Number(row.inventory_id), label: String(row.item_name), unit: String(row.unit_of_measure ?? ""), whole: Boolean(row.is_whole_unit), category: String(row.category) })),
        reports: reports.rows.map((row) => ({
          id: Number(row.request_id), label: String(row.label), quantity: Number(row.quantity), unit: row.unit_of_measure ? String(row.unit_of_measure) : null,
          reason: String(row.reason), note: (row.note as string | null) ?? null, status: String(row.status), decisionNote: (row.decision_note as string | null) ?? null,
          mine: Number(row.requested_by) === session.adminId, by: (row.requested_by_name as string | null) ?? null, decidedBy: (row.decided_by_name as string | null) ?? null, createdAt: String(row.created_at),
        })),
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/write-off-requests failed:", error);
    return NextResponse.json({ error: "Could not load the waste reports." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (isQueueOnly(session)) return NextResponse.json(QUEUE_ONLY, { status: 403 });
  let body: { action?: unknown; product_variant_id?: unknown; inventory_id?: unknown; quantity?: unknown; reason?: unknown; note?: unknown; request_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A valid waste report is required." }, { status: 400 });
  }
  try {
    if (body.action === "cancel") {
      const requestId = Number(body.request_id);
      const cancelled = await pool.query(`
        UPDATE write_off_requests SET status = 'cancelled', decided_by = $2, decided_at = CURRENT_TIMESTAMP, decision_note = 'Taken back by the person who reported it'
        WHERE request_id = $1 AND requested_by = $2 AND status = 'pending'
      `, [requestId, session.adminId]);
      if (!cancelled.rowCount) return NextResponse.json({ error: "Only your own report, and only before an admin decides, can be taken back." }, { status: 409 });
      return NextResponse.json({ data: { status: "cancelled" } });
    }
    if (body.action !== "report") return NextResponse.json({ error: "Unknown action." }, { status: 400 });

    const quantity = Math.round(Number(body.quantity) * 1000) / 1000;
    const reason = String(body.reason ?? "");
    const note = String(body.note ?? "").trim().replace(/\s+/g, " ").slice(0, 200);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100_000) return NextResponse.json({ error: "Enter how many or how much." }, { status: 400 });
    if (!REASONS.includes(reason)) return NextResponse.json({ error: "Choose what happened." }, { status: 400 });
    if (reason === "other" && !note) return NextResponse.json({ error: "Say what happened." }, { status: 400 });

    const productVariantId = Number(body.product_variant_id);
    const inventoryId = Number(body.inventory_id);
    let label: string;
    if (Number.isInteger(productVariantId) && productVariantId > 0) {
      if (!Number.isInteger(quantity)) return NextResponse.json({ error: "Menu items are counted in whole pieces." }, { status: 400 });
      const found = await pool.query("SELECT p.product_name, pv.size_label FROM product_variants pv JOIN products p ON p.product_id = pv.product_id WHERE pv.product_variant_id = $1 AND pv.is_archived = FALSE AND p.is_archived = FALSE", [productVariantId]);
      if (!found.rows[0]) return NextResponse.json({ error: "That menu item was not found." }, { status: 404 });
      const size = String(found.rows[0].size_label ?? "");
      label = `${found.rows[0].product_name}${size && size !== "Regular" ? ` ${size}` : ""}`;
    } else if (Number.isInteger(inventoryId) && inventoryId > 0) {
      const found = await pool.query("SELECT item_name, is_whole_unit FROM inventory WHERE inventory_id = $1 AND is_archived = FALSE", [inventoryId]);
      if (!found.rows[0]) return NextResponse.json({ error: "That inventory item was not found." }, { status: 404 });
      if (found.rows[0].is_whole_unit && !Number.isInteger(quantity)) return NextResponse.json({ error: `${found.rows[0].item_name} is counted in whole pieces.` }, { status: 400 });
      label = String(found.rows[0].item_name);
    } else {
      return NextResponse.json({ error: "Choose what was wasted." }, { status: 400 });
    }

    const inserted = await pool.query(`
      INSERT INTO write_off_requests (product_variant_id, inventory_id, quantity, label, reason, note, requested_by, shift_id, source_app)
      VALUES ($1, $2, $3, $4, $5, NULLIF($6, ''), $7, (SELECT shift_id FROM shifts WHERE closed_at IS NULL LIMIT 1), 'cashier')
      RETURNING request_id
    `, [productVariantId > 0 ? productVariantId : null, productVariantId > 0 ? null : inventoryId, quantity, label, reason, note, session.adminId]);
    return NextResponse.json({ data: { id: Number(inserted.rows[0].request_id), label } }, { status: 201 });
  } catch (error) {
    console.error("POST /api/write-off-requests failed:", error);
    return NextResponse.json({ error: "Could not save the waste report." }, { status: 500 });
  }
}
