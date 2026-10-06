import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { confirmPassword, getSession, WRONG_PASSWORD } from "@/lib/sessions";
import { addSafeEntry, lastFloatKept, lockAccount, pesoText, SafeShortError, type TreasuryAccountKey } from "@/lib/treasury";
import { gcashMethod } from "@/lib/gcash";

// The treasury (see treasury-migration.sql, treasury-paymongo-migration.sql and lib/treasury.ts):
// each account's balance and its history, like a ledger.
//   safe      shifts move cash in and out of it by themselves (float, cash drops and cash ins,
//             closing). The admin starts it, deposits, withdraws, corrects, or counts it.
//   paymongo  each closing adds the shift's GCash and takes off PayMongo's fees. The admin starts
//             it, records the payouts, corrects, or checks it against the PayMongo dashboard.
//   gcash     (direct GCash, the café: GCASH_METHOD=direct_qr) the café's own GCash wallet. Each
//             closing adds the shift's GCash (no fees); the admin records what is cashed out, or
//             checks it against the GCash app.
// The page shows two accounts: the safe and the e-wallet, which the API calls "paymongo" (the
// PayMongo account, or the GCash one under direct GCash; `wallet` says which).
//
//   GET  /api/treasury?view=summary                    -> both accounts, last float kept
//   GET  /api/treasury?account=safe|paymongo&start=YYYY-MM-DD&end=YYYY-MM-DD
//                                                       -> plus that account's entries in those days
//   POST { account, action: "open", amount }            -> go live with the counted balance
//   POST { account: "safe", action: "deposit" | "withdraw", amount, reason, note }
//   POST { account: "paymongo", action: "payout", amount, reason, note }
//   POST { account, action: "correct", entry_id, amount, reason } -> what a hand-made entry
//                                                          should have been
//   POST { account, action: "count", amount, note }      -> counted (the safe) or read from the
//                                                          PayMongo dashboard: record the difference
// Every POST is confirmed with the signed-in admin's password.

const TZ = "Asia/Manila";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ENTRY_LIMIT = 3000;
// The e-wallet account in use on this deployment.
const WALLET: TreasuryAccountKey = gcashMethod() === "direct_qr" ? "gcash" : "paymongo";
const WALLET_INFO = WALLET === "gcash" ? { name: "GCash", direct: true } : { name: "PayMongo", direct: false };
const ACCOUNT_WHERE: Record<TreasuryAccountKey, string> = { safe: "kind = 'safe'", paymongo: "kind = 'ewallet' AND LOWER(name) = 'paymongo'", gcash: "kind = 'ewallet' AND LOWER(name) = 'gcash'" };
// What each account allows by hand, and which entries a correction may fix. Shift moves follow
// from the shift's own records; anything else is fixed by counting or checking the account.
const ACTIONS: Record<TreasuryAccountKey, string[]> = { safe: ["open", "deposit", "withdraw", "correct", "count"], paymongo: ["open", "payout", "correct", "count"], gcash: ["open", "payout", "correct", "count"] };
const CORRECTABLE: Record<TreasuryAccountKey, string[]> = { safe: ["opening_balance", "deposit", "withdrawal"], paymongo: ["opening_balance", "payout"], gcash: ["opening_balance", "payout"] };
const COUNT_REASONS: Record<TreasuryAccountKey, [more: string, less: string]> = {
  safe: ["Safe count: more than recorded", "Safe count: less than recorded"],
  paymongo: ["PayMongo check: more than recorded", "PayMongo check: less than recorded"],
  gcash: ["GCash check: more than recorded", "GCash check: less than recorded"],
};
const ACCOUNT_LABEL: Record<TreasuryAccountKey, string> = { safe: "safe", paymongo: "PayMongo account", gcash: "GCash account" };

const round = (value: number) => Math.round(value * 100) / 100;

function parseAmount(value: unknown, allowZero = false): number | null {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount > 100_000_000 || amount < 0 || (!allowZero && amount === 0)) return null;
  return round(amount);
}

const entrySelect = `
  SELECT te.entry_id, te.kind, te.amount, te.balance_after, te.shift_id, te.movement_id, te.corrects_entry_id, te.reason, te.note, te.source_app,
    au.full_name, TO_CHAR(te.created_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS created_at,
    (SELECT COALESCE(SUM(fix.amount), 0) FROM treasury_entries fix WHERE fix.corrects_entry_id = te.entry_id) AS corrected_by
  FROM treasury_entries te
  LEFT JOIN admin_users au ON au.admin_id = te.admin_id
`;

function mapEntry(row: Record<string, unknown>) {
  return {
    id: Number(row.entry_id),
    kind: String(row.kind),
    amount: Number(row.amount),
    balanceAfter: Number(row.balance_after),
    shiftId: row.shift_id === null ? null : Number(row.shift_id),
    movementId: row.movement_id === null ? null : Number(row.movement_id),
    correctsEntryId: row.corrects_entry_id === null ? null : Number(row.corrects_entry_id),
    // The total of the corrections made to this entry (0 when none).
    correctedBy: Number(row.corrected_by ?? 0),
    reason: String(row.reason),
    note: (row.note as string | null) ?? null,
    by: (row.full_name as string | null) ?? null,
    source: String(row.source_app),
    createdAt: String(row.created_at),
  };
}

async function loadAccount(key: TreasuryAccountKey) {
  const result = await pool.query(`
    SELECT account_id, name, balance, TO_CHAR(opened_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS opened_at
    FROM treasury_accounts WHERE ${ACCOUNT_WHERE[key]} AND is_archived = FALSE
  `);
  const row = result.rows[0];
  if (!row) return null;
  return { key, accountId: Number(row.account_id), name: String(row.name), balance: Number(row.balance), live: row.opened_at !== null, openedAt: (row.opened_at as string | null) ?? null };
}

// "safe", or "paymongo" for the e-wallet account in use (PayMongo, or GCash under direct GCash).
const accountParam = (value: unknown): TreasuryAccountKey | null => { const key = String(value ?? "safe"); return key === "safe" ? "safe" : key === "paymongo" ? WALLET : null; };

export async function GET(request: Request) {
  if (!(await getSession())) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  try {
    const params = new URL(request.url).searchParams;
    const [safe, paymongo, lastFloat] = await Promise.all([loadAccount("safe"), loadAccount(WALLET), lastFloatKept(pool)]);
    if (!safe || !paymongo) return NextResponse.json({ error: `A treasury account is missing. Run treasury-migration.sql and ${WALLET === "gcash" ? "gcash-direct-migration.sql" : "treasury-paymongo-migration.sql"} first.` }, { status: 500 });
    if (params.get("view") === "summary") return NextResponse.json({ data: { safe, paymongo, wallet: WALLET_INFO, lastFloat } }, { headers: { "Cache-Control": "no-store" } });

    const key = accountParam(params.get("account"));
    if (!key) return NextResponse.json({ error: `Choose the safe or ${WALLET_INFO.name}.` }, { status: 400 });
    const account = key === "safe" ? safe : paymongo;
    const start = params.get("start") ?? "";
    const end = params.get("end") ?? "";
    if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end) return NextResponse.json({ error: "Choose a valid date range." }, { status: 400 });
    const [entries, totals] = await Promise.all([
      pool.query(`${entrySelect}
        WHERE te.account_id = $1 AND (te.created_at AT TIME ZONE '${TZ}')::date BETWEEN $2::date AND $3::date
        ORDER BY te.created_at DESC, te.entry_id DESC LIMIT ${ENTRY_LIMIT}`, [account.accountId, start, end]),
      // The range in one line: the balance before it, money in, money out, and the balance after.
      pool.query(`
        SELECT
          COALESCE((SELECT balance_after FROM treasury_entries WHERE account_id = $1 AND (created_at AT TIME ZONE '${TZ}')::date < $2::date ORDER BY created_at DESC, entry_id DESC LIMIT 1), 0) AS opening,
          COALESCE(SUM(amount) FILTER (WHERE amount > 0 AND kind <> 'opening_balance'), 0) AS money_in,
          COALESCE(-SUM(amount) FILTER (WHERE amount < 0), 0) AS money_out,
          COALESCE(SUM(amount) FILTER (WHERE kind = 'opening_balance'), 0) AS started_with,
          COALESCE(-SUM(amount) FILTER (WHERE kind = 'gateway_fee'), 0) AS fees,
          -- PayMongo cards: sales and payouts on their own, so a correction is never counted as either.
          COALESCE(SUM(amount) FILTER (WHERE kind = 'gcash_sales'), 0) AS gcash_sales,
          COALESCE(-SUM(amount) FILTER (WHERE kind = 'payout'), 0) AS payouts,
          COUNT(*)::int AS entries
        FROM treasury_entries
        WHERE account_id = $1 AND (created_at AT TIME ZONE '${TZ}')::date BETWEEN $2::date AND $3::date
      `, [account.accountId, start, end]),
    ]);
    const row = totals.rows[0];
    const opening = Number(row.opening) + Number(row.started_with);
    const moneyIn = Number(row.money_in);
    const moneyOut = Number(row.money_out);
    return NextResponse.json({
      data: {
        safe, paymongo, wallet: WALLET_INFO, lastFloat, account: key === "safe" ? "safe" : "paymongo",
        range: { opening, moneyIn, moneyOut, closing: round(opening + moneyIn - moneyOut), fees: Number(row.fees), gcashSales: Number(row.gcash_sales), payouts: Number(row.payouts), entries: Number(row.entries) },
        entries: entries.rows.map(mapEntry),
        truncated: entries.rowCount === ENTRY_LIMIT,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/treasury failed:", error);
    return NextResponse.json({ error: "Could not load the treasury." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: { account?: unknown; action?: unknown; amount?: unknown; reason?: unknown; note?: unknown; entry_id?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A valid treasury action is required." }, { status: 400 });
  }
  const key = accountParam(body.account);
  if (!key) return NextResponse.json({ error: `Choose the safe or ${WALLET_INFO.name}.` }, { status: 400 });
  const action = String(body.action ?? "");
  if (!ACTIONS[key].includes(action)) return NextResponse.json({ error: "That action is not available for this account." }, { status: 400 });
  const amount = parseAmount(body.amount, action === "open" || action === "count" || action === "correct");
  const reason = String(body.reason ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  const note = String(body.note ?? "").trim().slice(0, 300);
  if (amount === null) return NextResponse.json({ error: action === "open" || action === "count" ? "Enter the balance (0 or more)." : "Enter an amount more than ₱0." }, { status: 400 });
  if ((action === "deposit" || action === "withdraw" || action === "correct") && !reason) return NextResponse.json({ error: "Choose or type a reason." }, { status: 400 });
  // Money in or out of an account is confirmed with the signed-in admin's password.
  if (!(await confirmPassword(session.adminId, body.password))) return NextResponse.json(WRONG_PASSWORD, { status: 403 });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const account = await lockAccount(client, key);
    if (!account) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "This account is missing. Run the treasury migrations first." }, { status: 500 });
    }
    if (action !== "open" && !account.live) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: `Enter the ${ACCOUNT_LABEL[key]}’s opening balance first.` }, { status: 409 });
    }
    const base = { adminId: session.adminId, sourceApp: "admin" as const, note };
    let entryId: number | null = null;

    if (action === "open") {
      if (account.live) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: `The ${ACCOUNT_LABEL[key]} already has its opening balance. Use ${key === "safe" ? "Count the safe" : `Check against ${WALLET_INFO.name}`} to fix it.` }, { status: 409 });
      }
      entryId = await addSafeEntry(client, account, { ...base, kind: "opening_balance", amount, reason: key === "safe" ? "Opening balance (safe counted)" : key === "gcash" ? "Opening balance (from the GCash app)" : "Opening balance (from the PayMongo dashboard)" });
      await client.query("UPDATE treasury_accounts SET opened_at = CURRENT_TIMESTAMP WHERE account_id = $1", [account.accountId]);
    }
    if (action === "deposit") entryId = await addSafeEntry(client, account, { ...base, kind: "deposit", amount, reason });
    if (action === "withdraw") entryId = await addSafeEntry(client, account, { ...base, kind: "withdrawal", amount: -amount, reason });
    if (action === "payout") entryId = await addSafeEntry(client, account, { ...base, kind: "payout", amount: -amount, reason: reason || (key === "gcash" ? "Cashed out" : "Weekly payout") });

    if (action === "correct") {
      // amount is what the entry should have been (as a positive number); the correction is the
      // difference from what it is now, including any earlier corrections to it.
      const entryIdToFix = Number(body.entry_id);
      const target = Number.isInteger(entryIdToFix) && entryIdToFix > 0 ? (await client.query(`
        SELECT te.kind, te.amount, (SELECT COALESCE(SUM(fix.amount), 0) FROM treasury_entries fix WHERE fix.corrects_entry_id = te.entry_id) AS corrected_by
        FROM treasury_entries te WHERE te.entry_id = $1 AND te.account_id = $2
      `, [entryIdToFix, account.accountId])).rows[0] : undefined;
      if (!target || !CORRECTABLE[key].includes(String(target.kind))) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: key === "safe" ? "Only an opening balance, deposit or withdrawal can be corrected. For anything else, count the safe." : `Only an opening balance or ${key === "gcash" ? "cash out" : "payout"} can be corrected. For anything else, check against ${WALLET_INFO.name}.` }, { status: 400 });
      }
      const sign = Number(target.amount) < 0 ? -1 : 1;
      const now = round(Number(target.amount) + Number(target.corrected_by));
      const difference = round(sign * amount - now);
      if (Math.abs(difference) < 0.005) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: `That entry is already ${pesoText(amount)}.` }, { status: 400 });
      }
      entryId = await addSafeEntry(client, account, { ...base, kind: "correction", amount: difference, reason, correctsEntryId: entryIdToFix });
    }

    if (action === "count") {
      const difference = round(amount - account.balance);
      if (Math.abs(difference) < 0.005) {
        await client.query("ROLLBACK");
        return NextResponse.json({ data: { entry: null, balance: account.balance, message: `It matches: ${pesoText(amount)}.` } });
      }
      entryId = await addSafeEntry(client, account, { ...base, kind: "correction", amount: difference, reason: COUNT_REASONS[key][difference > 0 ? 0 : 1] });
    }

    await client.query("COMMIT");
    const saved = entryId === null ? null : await pool.query(`${entrySelect} WHERE te.entry_id = $1`, [entryId]);
    return NextResponse.json({ data: { entry: saved ? mapEntry(saved.rows[0]) : null, balance: account.balance } }, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (error instanceof SafeShortError) return NextResponse.json({ error: `The ${ACCOUNT_LABEL[key]} only has ${pesoText(error.available)}. It cannot go below ₱0.` }, { status: 409 });
    console.error("POST /api/treasury failed:", error);
    return NextResponse.json({ error: "Could not update the treasury." }, { status: 500 });
  } finally {
    client.release();
  }
}
