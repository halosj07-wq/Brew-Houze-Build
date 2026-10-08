import { vi } from "vitest";
import { unitCases } from "./harness";
import { fakeDb } from "./fake-db";
import { addSafeEntry, expenseCategoryFor, pesoText, recordShiftFloat, recordShiftGcash, SafeShortError, type Safe } from "@/lib/treasury";
import { excelPayment, excelReturnMethod, excelStatus, getFinanceDateStamp } from "@/lib/excel-format";

vi.mock("@/lib/db", () => import("./fake-db").then((m) => m.poolModule));

// Objective 6. Finance and treasury. Every move of money in or out of an account (the safe, the
// PayMongo balance, the café's GCash) is an entry with the balance right after it.
function treasuryDb(options: { balance?: number; live?: boolean; gcash?: { gross: number; fees: number; payments: number } } = {}) {
  return fakeDb([
    [/FROM treasury_accounts WHERE/, [{ account_id: 1, balance: String(options.balance ?? 10000), opened_at: options.live === false ? null : "2026-10-01" }]],
    [/payment_provider = 'paymongo_gcash'/, [{ gross: options.gcash?.gross ?? 0, fees: options.gcash?.fees ?? 0, payments: options.gcash?.payments ?? 0, unknown_fees: 0 }]],
    [/payment_provider = 'gcash_direct'/, [{ gross: 0, payments: 0 }]],
    [/^INSERT INTO treasury_entries/, [{ entry_id: 77 }]],
  ]);
}
const entries = (db: ReturnType<typeof treasuryDb>) => db.ran(/^INSERT INTO treasury_entries/).map((entry) => ({ kind: entry.params[1], amount: entry.params[2], balanceAfter: entry.params[3] }));
const safe = (balance: number): Safe => ({ accountId: 1, balance, live: true });
const move = (balance: number, amount: number) => {
  const db = treasuryDb();
  return addSafeEntry(db.client, safe(balance), { kind: amount < 0 ? "withdrawal" : "deposit", amount, reason: "Owner", adminId: 1, sourceApp: "admin" })
    .then(() => entries(db), (error) => ({ short: error instanceof SafeShortError, error: error.message, written: entries(db).length }));
};

unitCases("admin", "Objective 6 - Finance and Treasury", [
  { id: "UT-FIN-01", fn: "addSafeEntry", kind: "Positive", title: "a deposit raises the balance, and the entry keeps the balance after it", input: "Safe ₱10,000.00, deposit ₱4,200.00",
    expected: [{ kind: "deposit", amount: 4200, balanceAfter: 14200 }], run: () => move(10000, 4200) },
  { id: "UT-FIN-02", fn: "addSafeEntry", kind: "Boundary", title: "the whole balance can be withdrawn (exactly ₱0.00 left)", input: "Safe ₱10,000.00, withdraw ₱10,000.00",
    expected: [{ kind: "withdrawal", amount: -10000, balanceAfter: 0 }], run: () => move(10000, -10000) },
  { id: "UT-FIN-03", fn: "addSafeEntry", kind: "Negative", title: "an account can never go below ₱0.00", input: "Safe ₱10,000.00, withdraw ₱10,000.01",
    expected: { short: true, error: "The account does not have enough money.", written: 0 }, run: () => move(10000, -10000.01) },
  { id: "UT-FIN-04", fn: "addSafeEntry", kind: "Boundary", title: "amounts are kept to the centavo", input: "Safe ₱0.10, deposit ₱0.20",
    expected: [{ kind: "deposit", amount: 0.2, balanceAfter: 0.3 }], expectedText: "Balance ₱0.30 (not 0.30000000000000004)", run: () => move(0.1, 0.2) },
  { id: "UT-FIN-05", fn: "recordShiftFloat", kind: "Positive", title: "opening with more cash than was left in the drawer takes the difference from the safe", input: "Start ₱2,000.00, ₱1,500.00 left from last night",
    expected: [{ kind: "float_out", amount: -500, balanceAfter: 9500 }], run: async () => { const db = treasuryDb(); await recordShiftFloat(db.client, { shiftId: 8, startingCash: 2000, carried: 1500, adminId: 1, sourceApp: "admin" }); return entries(db); } },
  { id: "UT-FIN-06", fn: "recordShiftFloat", kind: "Positive", title: "opening with less returns the difference to the safe", input: "Start ₱1,000.00, ₱1,500.00 left from last night",
    expected: [{ kind: "float_return", amount: 500, balanceAfter: 10500 }], run: async () => { const db = treasuryDb(); await recordShiftFloat(db.client, { shiftId: 8, startingCash: 1000, carried: 1500, adminId: 1, sourceApp: "admin" }); return entries(db); } },
  { id: "UT-FIN-07", fn: "recordShiftFloat", kind: "Negative", title: "nothing is recorded before the owner enters the safe's opening balance", input: "Safe not in use yet",
    expected: [], run: async () => { const db = treasuryDb({ live: false }); await recordShiftFloat(db.client, { shiftId: 8, startingCash: 2000, carried: 0, adminId: 1, sourceApp: "admin" }); return entries(db); } },
  { id: "UT-FIN-08", fn: "recordShiftGcash", kind: "Positive", title: "closing adds the shift's GCash to the PayMongo balance and takes PayMongo's fees off", input: "12 GCash payments, ₱2,000.00, fees ₱45.00, PayMongo balance ₱10,000.00",
    expected: [{ kind: "gcash_sales", amount: 2000, balanceAfter: 12000 }, { kind: "gateway_fee", amount: -45, balanceAfter: 11955 }],
    run: async () => { const db = treasuryDb({ gcash: { gross: 2000, fees: 45, payments: 12 } }); await recordShiftGcash(db.client, { shiftId: 7, adminId: 1, sourceApp: "admin" }); return entries(db); } },
  { id: "UT-FIN-09", fn: "recordShiftGcash", kind: "Boundary", title: "a shift with no GCash adds nothing", input: "No GCash payments",
    expected: [], run: async () => { const db = treasuryDb(); await recordShiftGcash(db.client, { shiftId: 7, adminId: 1, sourceApp: "admin" }); return entries(db); } },
  { id: "UT-FIN-10", fn: "expenseCategoryFor", kind: "Positive", title: "a cash out is filed under its expense category", input: "\"Ice\", \"staff meal\", \"Rent\", \"gas for the generator\"",
    expected: ["Supplies", "Staff meals", "Rent", "Other"], run: () => ["Ice", "staff meal", "Rent", "gas for the generator"].map(expenseCategoryFor) },
  // Export formatting (Excel)
  { id: "UT-FIN-11", fn: "pesoText", kind: "Positive", title: "amounts are written in pesos with thousands separators and two decimals", input: "12500.5, 0",
    expected: ["₱12,500.50", "₱0.00"], run: () => [pesoText(12500.5), pesoText(0)] },
  { id: "UT-FIN-12", fn: "excelStatus", kind: "Positive", title: "order statuses are worded for the export", input: "\"voided\", \"refund\", \"completed\", \"pending\"",
    expected: ["Voided", "Refunded", "Completed", "Pending"], run: () => ["voided", "refund", "completed", "pending"].map(excelStatus) },
  { id: "UT-FIN-13", fn: "excelPayment", kind: "Positive", title: "each payment is named the way the café says it", input: "COD, mobile GCash, split, counter GCash, cash",
    expected: ["Cash on delivery", "Mobile menu (GCash)", "Split (cash + GCash)", "GCash", "Cash"],
    run: () => [["cashier", "cod"], ["online", "online"], ["cashier", "split"], ["cashier", "online"], ["cashier", "cash"]].map(([orderSource, paymentMethod]) => excelPayment({ orderSource, paymentMethod })) },
  { id: "UT-FIN-14", fn: "excelReturnMethod", kind: "Negative", title: "an order with no refund leaves the column blank", input: "\"gcash\", null, \"unknown\"",
    expected: ["GCash", "", ""], run: () => ["gcash", null, "unknown"].map(excelReturnMethod) },
  { id: "UT-FIN-15", fn: "getFinanceDateStamp", kind: "Boundary", title: "export file names use the Philippine date, not the server's", input: "Oct 8, 2026 11:30 PM UTC (Oct 9, 7:30 AM in Manila)",
    expected: "2026-10-09", run: () => getFinanceDateStamp(new Date("2026-10-08T23:30:00Z")) },
]);
