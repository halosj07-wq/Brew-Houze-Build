import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { confirmPassword, getSession, WRONG_PASSWORD } from "@/lib/sessions";
import { addSafeEntry, EXPENSE_CATEGORIES, lockSafe, pesoText, recordDrawerExpense, SafeShortError } from "@/lib/treasury";

// Expenses (see expenses-migration.sql): what the cafe spends to run, apart from the ingredients it
// sells (restocking is already in the cost of goods, so it is never an expense here).
//
//   GET  /api/expenses?start=YYYY-MM-DD&end=YYYY-MM-DD  -> the expenses of those business days,
//                                                          totals by category and by where paid from
//   POST { action: "add", spent_on, category, description, amount, paid_from, reference, note }
//          paid_from safe    taken from the safe (an expense entry in its history)
//          paid_from drawer  a cash out in the open shift (dated by that shift)
//          paid_from owner   paid by the owner from their own money (nothing moves in the treasury)
//   POST { action: "void", expense_id, reason }        -> a mistake: voided, never deleted. A safe
//                                                          expense goes back into the safe.
// Every POST is confirmed with the signed-in admin's password.

const TZ = "Asia/Manila";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LIMIT = 3000;
const PAID_FROM = ["safe", "drawer", "owner"] as const;

const round = (value: number) => Math.round(value * 100) / 100;

const expenseSelect = `
  SELECT ex.expense_id, TO_CHAR(ex.spent_on, 'YYYY-MM-DD') AS spent_on, ex.category, ex.description, ex.amount, ex.paid_from, ex.shift_id, ex.movement_id, ex.entry_id,
    ex.reference, ex.note, ex.source_app, ex.void_reason, au.full_name, voider.full_name AS voided_by_name,
    TO_CHAR(ex.created_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS created_at,
    TO_CHAR(ex.voided_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS voided_at
  FROM expenses ex
  LEFT JOIN admin_users au ON au.admin_id = ex.admin_id
  LEFT JOIN admin_users voider ON voider.admin_id = ex.voided_by
`;

function mapExpense(row: Record<string, unknown>) {
  return {
    id: Number(row.expense_id),
    spentOn: String(row.spent_on),
    category: String(row.category),
    description: String(row.description),
    amount: Number(row.amount),
    paidFrom: String(row.paid_from),
    shiftId: row.shift_id === null ? null : Number(row.shift_id),
    reference: (row.reference as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    by: (row.full_name as string | null) ?? null,
    source: String(row.source_app),
    createdAt: String(row.created_at),
    voidedAt: (row.voided_at as string | null) ?? null,
    voidedBy: (row.voided_by_name as string | null) ?? null,
    voidReason: (row.void_reason as string | null) ?? null,
  };
}

export async function GET(request: Request) {
  if (!(await getSession())) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  try {
    const params = new URL(request.url).searchParams;
    const start = params.get("start") ?? "";
    const end = params.get("end") ?? "";
    if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end) return NextResponse.json({ error: "Choose a valid date range." }, { status: 400 });
    const [list, open] = await Promise.all([
      pool.query(`${expenseSelect} WHERE ex.spent_on BETWEEN $1::date AND $2::date ORDER BY ex.spent_on DESC, ex.created_at DESC, ex.expense_id DESC LIMIT ${LIMIT}`, [start, end]),
      // The open shift (for paying from the drawer) and what its drawer should have now.
      pool.query("SELECT shift_id, expected_cash, TO_CHAR(business_date, 'YYYY-MM-DD') AS business_date FROM shift_summaries WHERE closed_at IS NULL LIMIT 1"),
    ]);
    const expenses = list.rows.map(mapExpense);
    const active = expenses.filter((expense) => !expense.voidedAt);
    const byCategory = new Map<string, { category: string; amount: number; count: number }>();
    for (const expense of active) {
      const entry = byCategory.get(expense.category) ?? { category: expense.category, amount: 0, count: 0 };
      entry.amount = round(entry.amount + expense.amount);
      entry.count += 1;
      byCategory.set(expense.category, entry);
    }
    const byPaidFrom = Object.fromEntries(PAID_FROM.map((from) => [from, round(active.filter((expense) => expense.paidFrom === from).reduce((sum, expense) => sum + expense.amount, 0))]));
    const shift = open.rows[0];
    return NextResponse.json({
      data: {
        expenses,
        total: round(active.reduce((sum, expense) => sum + expense.amount, 0)),
        byCategory: [...byCategory.values()].sort((a, b) => b.amount - a.amount),
        byPaidFrom,
        categories: EXPENSE_CATEGORIES,
        openShift: shift ? { shiftId: Number(shift.shift_id), expectedCash: Number(shift.expected_cash), businessDate: String(shift.business_date) } : null,
        truncated: list.rowCount === LIMIT,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/expenses failed:", error);
    return NextResponse.json({ error: "Could not load the expenses." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  let body: { action?: unknown; expense_id?: unknown; spent_on?: unknown; category?: unknown; description?: unknown; amount?: unknown; paid_from?: unknown; reference?: unknown; note?: unknown; reason?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A valid expense is required." }, { status: 400 });
  }
  const action = String(body.action ?? "");
  if (action !== "add" && action !== "void") return NextResponse.json({ error: "Unknown expense action." }, { status: 400 });

  if (action === "void") {
    const expenseId = Number(body.expense_id);
    const reason = String(body.reason ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
    if (!Number.isInteger(expenseId) || expenseId <= 0) return NextResponse.json({ error: "A valid expense is required." }, { status: 400 });
    if (!reason) return NextResponse.json({ error: "Say why it is voided." }, { status: 400 });
    if (!(await confirmPassword(session.adminId, body.password))) return NextResponse.json(WRONG_PASSWORD, { status: 403 });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const found = await client.query("SELECT expense_id, amount, paid_from, entry_id, voided_at, description FROM expenses WHERE expense_id = $1 FOR UPDATE", [expenseId]);
      const expense = found.rows[0];
      if (!expense || expense.voided_at) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: expense ? "This expense is already voided." : "Expense not found." }, { status: 409 });
      }
      await client.query("UPDATE expenses SET voided_at = CURRENT_TIMESTAMP, voided_by = $2, void_reason = $3 WHERE expense_id = $1", [expenseId, session.adminId, reason]);
      // A safe expense goes back into the safe, linked to the entry it undoes.
      if (expense.paid_from === "safe" && expense.entry_id !== null) {
        const safe = await lockSafe(client);
        if (safe) await addSafeEntry(client, safe, { kind: "correction", amount: Number(expense.amount), reason: `Expense voided: ${expense.description}`, note: reason, correctsEntryId: Number(expense.entry_id), adminId: session.adminId, sourceApp: "admin" });
      }
      await client.query("COMMIT");
      const saved = await pool.query(`${expenseSelect} WHERE ex.expense_id = $1`, [expenseId]);
      return NextResponse.json({ data: mapExpense(saved.rows[0]) });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      console.error("POST /api/expenses (void) failed:", error);
      return NextResponse.json({ error: "Could not void the expense." }, { status: 500 });
    } finally {
      client.release();
    }
  }

  const amount = Math.round(Number(body.amount) * 100) / 100;
  const category = String(body.category ?? "").trim().slice(0, 40);
  const description = String(body.description ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
  const paidFrom = String(body.paid_from ?? "") as (typeof PAID_FROM)[number];
  const reference = String(body.reference ?? "").trim().slice(0, 80);
  const note = String(body.note ?? "").trim().slice(0, 300);
  const spentOn = String(body.spent_on ?? "");
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) return NextResponse.json({ error: "Enter an amount more than ₱0." }, { status: 400 });
  if (!category) return NextResponse.json({ error: "Choose a category." }, { status: 400 });
  if (!description) return NextResponse.json({ error: "Say what it was for." }, { status: 400 });
  if (!PAID_FROM.includes(paidFrom)) return NextResponse.json({ error: "Choose where the money came from." }, { status: 400 });
  if (paidFrom !== "drawer" && !DATE_RE.test(spentOn)) return NextResponse.json({ error: "Choose the date." }, { status: 400 });
  if (!(await confirmPassword(session.adminId, body.password))) return NextResponse.json(WRONG_PASSWORD, { status: 403 });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (paidFrom !== "drawer") {
      const future = await client.query(`SELECT $1::date > (CURRENT_TIMESTAMP AT TIME ZONE '${TZ}')::date AS future`, [spentOn]);
      if (future.rows[0].future) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "The date cannot be in the future." }, { status: 400 });
      }
    }
    let expenseId: number;
    if (paidFrom === "drawer") {
      // A cash out in the open shift: the share lock keeps the shift open until it is saved.
      const shift = await client.query("SELECT shift_id FROM shifts WHERE closed_at IS NULL FOR SHARE");
      if (shift.rowCount === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "No shift is open, so nothing can be paid from the drawer. Pay it from the safe or by the owner." }, { status: 409 });
      }
      const shiftId = Number(shift.rows[0].shift_id);
      const drawer = await client.query("SELECT expected_cash FROM shift_summaries WHERE shift_id = $1", [shiftId]);
      const expected = Number(drawer.rows[0]?.expected_cash ?? 0);
      if (amount > expected + 0.005) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: `The drawer should only have ${pesoText(expected)}. Pay it from the safe or by the owner.` }, { status: 400 });
      }
      const movement = await client.query(`
        INSERT INTO cash_movements (shift_id, kind, amount, reason, note, admin_id, source_app)
        VALUES ($1, 'cash_out', $2, $3, NULLIF($4, ''), $5, 'admin') RETURNING movement_id
      `, [shiftId, amount, category.slice(0, 60), [description, note].filter(Boolean).join(" · ").slice(0, 200), session.adminId]);
      const movementId = Number(movement.rows[0].movement_id);
      await recordDrawerExpense(client, { movementId, shiftId, reason: category, amount, note, category, description, adminId: session.adminId, sourceApp: "admin" });
      expenseId = Number((await client.query("SELECT expense_id FROM expenses WHERE movement_id = $1", [movementId])).rows[0].expense_id);
      if (reference) await client.query("UPDATE expenses SET reference = $2 WHERE expense_id = $1", [expenseId, reference]);
    } else {
      let entryId: number | null = null;
      if (paidFrom === "safe") {
        const safe = await lockSafe(client);
        if (!safe?.live) {
          await client.query("ROLLBACK");
          return NextResponse.json({ error: "The safe is not started yet. Start it in Treasury, or record this as paid by the owner." }, { status: 409 });
        }
        entryId = await addSafeEntry(client, safe, { kind: "expense", amount: -amount, reason: `${category}: ${description}`, note: reference || note, adminId: session.adminId, sourceApp: "admin" });
      }
      const inserted = await client.query(`
        INSERT INTO expenses (spent_on, category, description, amount, paid_from, entry_id, reference, note, admin_id, source_app)
        VALUES ($1::date, $2, $3, $4, $5, $6, NULLIF($7, ''), NULLIF($8, ''), $9, 'admin') RETURNING expense_id
      `, [spentOn, category, description, amount, paidFrom, entryId, reference, note, session.adminId]);
      expenseId = Number(inserted.rows[0].expense_id);
    }
    await client.query("COMMIT");
    const saved = await pool.query(`${expenseSelect} WHERE ex.expense_id = $1`, [expenseId]);
    return NextResponse.json({ data: mapExpense(saved.rows[0]) }, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (error instanceof SafeShortError) return NextResponse.json({ error: `The safe only has ${pesoText(error.available)}. Pay it from the drawer or by the owner, or add cash to the safe first.` }, { status: 409 });
    console.error("POST /api/expenses failed:", error);
    return NextResponse.json({ error: "Could not save the expense." }, { status: 500 });
  } finally {
    client.release();
  }
}
