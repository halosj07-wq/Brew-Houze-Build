import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { confirmPassword, getSession, WRONG_PASSWORD } from "@/lib/sessions";
import { applyWriteOff, planWriteOff, WRITE_OFF_REASONS, WriteOffStockError, type WriteOffReason, type WriteOffTarget } from "@/lib/write-offs";

// Stock written off (see lib/write-offs.ts): only admins write stock off. Staff report waste from
// the staff app (write_off_requests); an admin approves (the stock is written off then) or rejects.
//
//   GET  /api/write-offs?status=pending|all  -> waste reports, each pending one with the stock it
//                                               would take and its cost now
//   POST { action: "write_off", inventory_id | product_variant_id, quantity, reason, note }
//   POST { action: "approve", request_id, note }
//   POST { action: "reject", request_id, note }
// Every POST is confirmed with the signed-in admin's password.

const TZ = "Asia/Manila";
const iso = (column: string) => `TO_CHAR(${column} AT TIME ZONE '${TZ}', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"')`;

const requestSelect = `
  SELECT r.request_id, r.product_variant_id, r.inventory_id, r.quantity, r.label, r.reason, r.note, r.shift_id, r.status, r.decision_note, r.approved_cost,
    requester.full_name AS requested_by, decider.full_name AS decided_by, ${iso("r.created_at")} AS created_at, ${iso("r.decided_at")} AS decided_at,
    i.unit_of_measure
  FROM write_off_requests r
  LEFT JOIN admin_users requester ON requester.admin_id = r.requested_by
  LEFT JOIN admin_users decider ON decider.admin_id = r.decided_by
  LEFT JOIN inventory i ON i.inventory_id = r.inventory_id
`;

function mapRequest(row: Record<string, unknown>) {
  return {
    id: Number(row.request_id),
    kind: row.product_variant_id === null ? "item" : "product",
    quantity: Number(row.quantity),
    unit: row.inventory_id === null ? null : String(row.unit_of_measure ?? ""),
    label: String(row.label),
    reason: String(row.reason),
    note: (row.note as string | null) ?? null,
    shiftId: row.shift_id === null ? null : Number(row.shift_id),
    status: String(row.status),
    decisionNote: (row.decision_note as string | null) ?? null,
    approvedCost: row.approved_cost === null ? null : Number(row.approved_cost),
    requestedBy: (row.requested_by as string | null) ?? null,
    decidedBy: (row.decided_by as string | null) ?? null,
    createdAt: String(row.created_at),
    decidedAt: (row.decided_at as string | null) ?? null,
  };
}

const targetOf = (row: { product_variant_id: unknown; inventory_id: unknown; quantity: unknown }): WriteOffTarget =>
  row.product_variant_id !== null && row.product_variant_id !== undefined
    ? { productVariantId: Number(row.product_variant_id), quantity: Number(row.quantity) }
    : { inventoryId: Number(row.inventory_id), quantity: Number(row.quantity) };

export async function GET(request: Request) {
  if (!(await getSession())) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  try {
    const all = new URL(request.url).searchParams.get("status") === "all";
    const result = await pool.query(`${requestSelect} ${all ? "WHERE r.created_at > CURRENT_TIMESTAMP - INTERVAL '60 days'" : "WHERE r.status = 'pending'"} ORDER BY (r.status = 'pending') DESC, r.created_at DESC LIMIT 300`);
    const requests = await Promise.all(result.rows.map(async (row) => {
      const mapped = mapRequest(row);
      if (mapped.status !== "pending") return { ...mapped, plan: null };
      // What approving would take now, and whether there is enough of it.
      try {
        const plan = await planWriteOff(pool, targetOf(row));
        return { ...mapped, plan: { lines: plan.lines, cost: plan.cost } };
      } catch (error) {
        return { ...mapped, plan: null, planError: error instanceof Error ? error.message : "Could not work out the stock." };
      }
    }));
    return NextResponse.json({ data: { requests, pending: requests.filter((entry) => entry.status === "pending").length } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/write-offs failed:", error);
    return NextResponse.json({ error: "Could not load the waste reports." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  let body: { action?: unknown; inventory_id?: unknown; product_variant_id?: unknown; quantity?: unknown; reason?: unknown; note?: unknown; request_id?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A valid write-off is required." }, { status: 400 });
  }
  const action = String(body.action ?? "");
  if (!["write_off", "approve", "reject"].includes(action)) return NextResponse.json({ error: "Unknown write-off action." }, { status: 400 });
  const note = String(body.note ?? "").trim().replace(/\s+/g, " ").slice(0, 200);

  let target: WriteOffTarget | null = null;
  let reason: WriteOffReason | null = null;
  if (action === "write_off") {
    const quantity = Math.round(Number(body.quantity) * 1000) / 1000;
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000) return NextResponse.json({ error: "Enter how much to write off." }, { status: 400 });
    reason = String(body.reason ?? "") as WriteOffReason;
    if (!WRITE_OFF_REASONS.includes(reason)) return NextResponse.json({ error: "Choose a reason." }, { status: 400 });
    if (reason === "other" && !note) return NextResponse.json({ error: "Say what happened." }, { status: 400 });
    const productVariantId = Number(body.product_variant_id);
    const inventoryId = Number(body.inventory_id);
    if (Number.isInteger(productVariantId) && productVariantId > 0) target = { productVariantId, quantity };
    else if (Number.isInteger(inventoryId) && inventoryId > 0) target = { inventoryId, quantity };
    else return NextResponse.json({ error: "Choose what to write off." }, { status: 400 });
  }
  if (action === "reject" && !note) return NextResponse.json({ error: "Say why it is rejected." }, { status: 400 });
  const requestId = Number(body.request_id);
  if (action !== "write_off" && (!Number.isInteger(requestId) || requestId <= 0)) return NextResponse.json({ error: "A valid waste report is required." }, { status: 400 });
  // Writing stock off is confirmed with the signed-in admin's password.
  if (!(await confirmPassword(session.adminId, body.password))) return NextResponse.json(WRONG_PASSWORD, { status: 403 });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (action === "write_off") {
      const plan = await applyWriteOff(client, { target: target!, reason: reason!, note, adminId: session.adminId, sourceApp: "admin" });
      await client.query("COMMIT");
      return NextResponse.json({ data: { label: plan.label, cost: plan.cost, lines: plan.lines } }, { status: 201 });
    }
    const found = await client.query("SELECT * FROM write_off_requests WHERE request_id = $1 FOR UPDATE", [requestId]);
    const row = found.rows[0];
    if (!row || row.status !== "pending") {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: row ? `This report was already ${row.status}.` : "Waste report not found." }, { status: 409 });
    }
    if (action === "reject") {
      await client.query("UPDATE write_off_requests SET status = 'rejected', decided_by = $2, decided_at = CURRENT_TIMESTAMP, decision_note = $3 WHERE request_id = $1", [requestId, session.adminId, note]);
      await client.query("COMMIT");
      return NextResponse.json({ data: { status: "rejected" } });
    }
    // The history note keeps the report number, what staff wrote, and the admin's own note.
    const plan = await applyWriteOff(client, { target: targetOf(row), reason: row.reason as WriteOffReason, note: [`Report #${requestId}`, row.note, note].filter(Boolean).join(" · "), adminId: session.adminId, sourceApp: "admin", requestId });
    await client.query("UPDATE write_off_requests SET status = 'approved', decided_by = $2, decided_at = CURRENT_TIMESTAMP, decision_note = NULLIF($3, ''), approved_cost = $4 WHERE request_id = $1", [requestId, session.adminId, note, plan.cost]);
    await client.query("COMMIT");
    return NextResponse.json({ data: { status: "approved", cost: plan.cost } });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (error instanceof WriteOffStockError) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error("POST /api/write-offs failed:", error);
    return NextResponse.json({ error: "Could not write the stock off." }, { status: 500 });
  } finally {
    client.release();
  }
}
