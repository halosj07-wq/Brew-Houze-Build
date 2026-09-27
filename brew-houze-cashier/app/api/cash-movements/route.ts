import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { confirmPassword, getSession, WRONG_PASSWORD } from "@/lib/sessions";

// Cash put into or taken out of the drawer during the open shift for reasons other than a sale:
// change fund added (cash_in), something paid for from the drawer (cash_out), or large bills moved
// to the safe (cash_drop). Entries are never edited or deleted; a mistake is corrected with an
// opposite entry. Expected cash in the drawer counts them (see cash-movements-migration.sql).

const KINDS = ["cash_in", "cash_out", "cash_drop"] as const;
type Kind = (typeof KINDS)[number];

const listSql = `
  SELECT cm.movement_id, cm.kind, cm.amount, cm.reason, cm.note, cm.source_app, au.full_name,
    TO_CHAR(cm.created_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS created_at
  FROM cash_movements cm
  LEFT JOIN admin_users au ON au.admin_id = cm.admin_id
`;

function mapMovement(row: Record<string, unknown>) {
  return {
    id: Number(row.movement_id),
    kind: row.kind as Kind,
    amount: Number(row.amount),
    reason: String(row.reason),
    note: (row.note as string | null) ?? null,
    by: (row.full_name as string | null) ?? null,
    source: String(row.source_app),
    createdAt: String(row.created_at),
  };
}

export async function GET() {
  if (!(await getSession())) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  try {
    const result = await pool.query(`${listSql} WHERE cm.shift_id = (SELECT shift_id FROM shifts WHERE closed_at IS NULL LIMIT 1) ORDER BY cm.created_at DESC, cm.movement_id DESC`);
    return NextResponse.json({ data: result.rows.map(mapMovement) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/cash-movements failed:", error);
    return NextResponse.json({ error: "Could not load the cash drawer entries." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: { kind?: unknown; amount?: unknown; reason?: unknown; note?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A valid cash drawer entry is required." }, { status: 400 });
  }
  const kind = String(body.kind ?? "") as Kind;
  const amount = Math.round(Number(body.amount) * 100) / 100;
  const reason = String(body.reason ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
  const note = String(body.note ?? "").trim().slice(0, 200);
  if (!KINDS.includes(kind)) return NextResponse.json({ error: "Choose cash in, cash out or cash drop." }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) return NextResponse.json({ error: "Enter an amount more than ₱0." }, { status: 400 });
  if (!reason) return NextResponse.json({ error: "Choose or type a reason." }, { status: 400 });
  // Money leaving or entering the drawer is confirmed with the signed-in account's password.
  if (!(await confirmPassword(session.adminId, body.password))) return NextResponse.json(WRONG_PASSWORD, { status: 403 });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // The share lock keeps the shift open until this entry is saved (closing waits for it).
    const shift = await client.query("SELECT shift_id FROM shifts WHERE closed_at IS NULL FOR SHARE");
    if (shift.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "No shift is open. Cash drawer entries belong to the open shift." }, { status: 409 });
    }
    const shiftId = Number(shift.rows[0].shift_id);
    if (kind !== "cash_in") {
      const drawer = await client.query("SELECT expected_cash FROM shift_summaries WHERE shift_id = $1", [shiftId]);
      const expected = Number(drawer.rows[0]?.expected_cash ?? 0);
      if (amount > expected + 0.005) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: `The drawer should only have ₱${expected.toFixed(2)}. You cannot take out more than that.` }, { status: 400 });
      }
    }
    const inserted = await client.query(`
      INSERT INTO cash_movements (shift_id, kind, amount, reason, note, admin_id, source_app)
      VALUES ($1, $2, $3, $4, NULLIF($5, ''), $6, 'cashier')
      RETURNING movement_id
    `, [shiftId, kind, amount, reason, note, session.adminId]);
    await client.query("COMMIT");
    const saved = await pool.query(`${listSql} WHERE cm.movement_id = $1`, [inserted.rows[0].movement_id]);
    return NextResponse.json({ data: mapMovement(saved.rows[0]) }, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("POST /api/cash-movements failed:", error);
    return NextResponse.json({ error: "Could not save the cash drawer entry." }, { status: 500 });
  } finally {
    client.release();
  }
}
