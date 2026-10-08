import { afterEach, vi } from "vitest";
import { unitCases } from "./harness";
import { fakeDb, setDb } from "./fake-db";
import { order, orderDb } from "./order-fixture";
import { settlePayment } from "@/lib/orders";
import { idDiscountAmounts } from "@/lib/discounts";
import { handOver, markReady } from "@/lib/stations";
import { createGcashPayment } from "@/lib/paymongo";
import { POST as shiftAction } from "@/app/api/shift/route";

const h = vi.hoisted(() => ({ session: null as Record<string, unknown> | null }));
vi.mock("@/lib/db", () => import("./fake-db").then((m) => m.poolModule));
vi.mock("@/lib/realtime", () => ({ signalChange: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => undefined }) }));
vi.mock("@/lib/sessions", async (original) => ({ ...(await original<object>()), getSession: async () => h.session, confirmPassword: async () => true }));

afterEach(() => vi.unstubAllGlobals());

// Objective 2. Point of sale (Staff Portal checkout) and the order queue.

// ── Queue: the bar and kitchen parts of an order (lib/stations.ts) ──
// parts: the status of each part after the change. served/delivery: what the change returns.
function queueDb(parts: string[], options: { waiting?: boolean; ready?: boolean } = {}) {
  return fakeDb([
    [/^INSERT INTO order_stations/, []],
    [/^UPDATE order_stations os SET status = 'ready'/, options.waiting === false ? [] : [{ station: "bar" }]],
    [/^UPDATE order_stations os SET status = 'picked_up'/, options.ready === false ? [] : [{ station: "bar" }]],
    [/^SELECT status FROM order_stations/, parts.map((status) => ({ status }))],
    [/^UPDATE sales_orders SET queue_status = 'served'/, [{ order_id: 900 }]],
    [/^UPDATE sales_orders SET queue_status = 'flushed'/, [{ order_id: 900 }]],
  ]);
}
const queueStatus = (db: ReturnType<typeof queueDb>) => db.ran(/^UPDATE sales_orders SET queue_status = '(served|flushed)'/).map((entry) => entry.sql.match(/'(served|flushed)'/)?.[1]);
const deliveryReady = (db: ReturnType<typeof queueDb>) => db.ran(/^UPDATE deliveries SET status = 'ready'/).length > 0;

const senior = { discountKind: "percent" as const, discountValue: 20, maxDiscount: null, vatExempt: true };
const vat = { registered: true, rate: 12 };

// ── PayMongo: the three calls (intent, method, attach), answered in order ──
function paymongoFetch(attach: Record<string, unknown> = { next_action: { redirect: { url: "https://gcash.test/pay/abc" } } }, fail?: string) {
  const replies = [
    { data: { id: "pi_1", attributes: { client_key: "pi_1_key" } } },
    { data: { id: "pm_1", attributes: {} } },
    { data: { id: "pi_1", attributes: attach } },
  ];
  const fetch = vi.fn(async () => fail
    ? new Response(JSON.stringify({ errors: [{ detail: fail }] }), { status: 400 })
    : new Response(JSON.stringify(replies[fetch.mock.calls.length - 1]), { status: 200 }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
const sentBody = (fetch: ReturnType<typeof paymongoFetch>, index: number) => JSON.parse(String((fetch.mock.calls[index] as unknown[])[1] && ((fetch.mock.calls[index] as unknown[])[1] as RequestInit).body)).data.attributes;

// ── Closing the shift (app/api/shift/route.ts): the drawer count against the expected cash ──
function closingDb(expectedCash: number) {
  return setDb([
    [/FROM shifts WHERE shift_id = \$1 AND closed_at IS NULL FOR UPDATE/, [{ shift_id: 7 }]],
    [/FROM deliveries d JOIN sales_orders so/, [{ active: 0, failed: 0, cash: 0 }]],
    [/FROM payment_checkouts WHERE provider = 'gcash_direct'/, [{ n: 0 }]],
    [/^SELECT expected_cash FROM shift_summaries/, [{ expected_cash: expectedCash.toFixed(2) }]],
    [/FROM treasury_accounts WHERE/, [{ account_id: 1, balance: "10000.00", opened_at: "2026-10-01" }]],
    [/payment_provider = '(paymongo_gcash|gcash_direct)'/, [{ gross: 0, fees: 0, payments: 0, unknown_fees: 0 }]],
    [/^INSERT INTO treasury_entries/, [{ entry_id: 77 }]],
  ]);
}
const close = async (body: Record<string, unknown>, session: Record<string, unknown> = { adminId: 1, role: "admin", canCloseShift: true }) => {
  h.session = session;
  const response = await shiftAction(new Request("http://staff.test/api/shift", { method: "POST", body: JSON.stringify({ action: "close", shift_id: 7, password: "secret", ...body }) }));
  return { status: response.status, body: await response.json() };
};

unitCases("cashier", "Objective 2 - POS and Queue", [
  // Queue numbers
  { id: "UT-QUE-01", fn: "placeOrder", kind: "Positive", title: "the next order of the shift gets the next queue number", input: "Shift #7 already has orders #1 to #41",
    expected: 42, run: async () => (await order(orderDb({ orders: Array.from({ length: 41 }, (_, index) => ({ shift_id: 7, queue_number: index + 1 })) }).db, {})).queueNumber },
  { id: "UT-QUE-02", fn: "placeOrder", kind: "Boundary", title: "queue numbers restart at 1 in a new shift", input: "Shift #7 has no orders yet (shift #6 ended at #88)",
    expected: 1, run: async () => (await order(orderDb({ orders: [{ shift_id: 6, queue_number: 88 }] }).db, {})).queueNumber },
  { id: "UT-QUE-03", fn: "placeOrder", kind: "Positive", title: "the number is given under a per-shift lock, so two orders never share one", input: "Order in shift #7",
    expected: { lockBeforeNumber: true, lockedShift: 7 },
    run: async () => { const cafe = orderDb(); await order(cafe.db, {}); const sql = cafe.db.calls.map((entry) => entry.sql); const lock = sql.findIndex((text) => /pg_advisory_xact_lock/.test(text)); return { lockBeforeNumber: lock >= 0 && lock < sql.findIndex((text) => /MAX\(queue_number\)/.test(text)), lockedShift: cafe.db.calls[lock].params[0] }; } },
  // Queue status machine: waiting -> served -> flushed
  { id: "UT-QUE-04", fn: "markReady", kind: "Positive", title: "when the last part is ready the order becomes served (number called) and its delivery is packed", input: "Bar marks its part ready; no other part waiting",
    expected: { queue: ["served"], deliveryReady: true }, run: async () => { const db = queueDb(["ready"]); await markReady(db.client, 900, "bar", 3); return { queue: queueStatus(db), deliveryReady: deliveryReady(db) }; } },
  { id: "UT-QUE-05", fn: "markReady", kind: "Boundary", title: "the order keeps waiting while the kitchen part is still being made", input: "Bar ready, kitchen still waiting",
    expected: { queue: [], deliveryReady: false }, run: async () => { const db = queueDb(["ready", "waiting"]); await markReady(db.client, 900, "bar", 3); return { queue: queueStatus(db), deliveryReady: deliveryReady(db) }; } },
  { id: "UT-QUE-06", fn: "handOver", kind: "Positive", title: "handing everything over moves the order off the queue (flushed)", input: "Counter hands over the whole order",
    expected: ["flushed"], run: async () => { const db = queueDb(["picked_up"]); await handOver(db.client, 900, null, "together"); return queueStatus(db); } },
  { id: "UT-QUE-07", fn: "markReady", kind: "Negative", title: "an order that is no longer waiting cannot be marked ready again", input: "Order already served",
    expected: { error: "This order is not waiting anymore." }, run: () => markReady(queueDb([], { waiting: false }).client, 900, null, 3) },
  { id: "UT-QUE-08", fn: "handOver", kind: "Negative", title: "an order cannot be handed over before it is ready", input: "Order still waiting",
    expected: { error: "This order is not ready for pickup, or was already picked up." }, run: () => handOver(queueDb([], { ready: false }).client, 900, null, "together") },
  // Senior / PWD discount
  { id: "UT-POS-01", fn: "idDiscountAmounts", kind: "Positive", title: "senior discount: VAT removed, then 20% off", input: "Senior citizen, ₱112.00 drink, VAT-registered (12%)",
    expected: { vatExempt: 12, discount: 20 }, expectedText: "VAT exempt ₱12.00, discount ₱20.00 (pays ₱80.00)", run: () => idDiscountAmounts(senior, 112, vat) },
  { id: "UT-POS-02", fn: "idDiscountAmounts", kind: "Positive", title: "PWD discount on two drinks", input: "PWD, ₱224.00 covered, VAT-registered (12%)",
    expected: { vatExempt: 24, discount: 40 }, expectedText: "VAT exempt ₱24.00, discount ₱40.00 (pays ₱160.00)", run: () => idDiscountAmounts(senior, 224, vat) },
  { id: "UT-POS-03", fn: "idDiscountAmounts", kind: "Boundary", title: "nothing covered gives no discount", input: "Senior, ₱0.00 covered",
    expected: { vatExempt: 0, discount: 0 }, run: () => idDiscountAmounts(senior, 0, vat) },
  // Cash and change
  { id: "UT-POS-04", fn: "settlePayment", kind: "Positive", title: "cash: the change is what was received minus the total", input: "Cash, total ₱185.00, received ₱200.00",
    expected: { receivedAmount: 200, changeAmount: 15, cashPortion: null }, expectedText: "Change ₱15.00", run: () => settlePayment("cash", 185, 200, undefined) },
  { id: "UT-POS-05", fn: "settlePayment", kind: "Boundary", title: "cash: the exact amount gives no change", input: "Cash, total ₱185.00, received ₱185.00",
    expected: { receivedAmount: 185, changeAmount: 0, cashPortion: null }, run: () => settlePayment("cash", 185, 185, undefined) },
  { id: "UT-POS-06", fn: "settlePayment", kind: "Negative", title: "cash: one centavo short is refused", input: "Cash, total ₱185.00, received ₱184.99",
    expected: { error: "Received payment must be at least the subtotal amount." }, run: () => settlePayment("cash", 185, 184.99, undefined) },
  { id: "UT-POS-07", fn: "settlePayment", kind: "Negative", title: "cash: a received amount that is not a number is refused", input: "Cash, received \"abc\"",
    expected: { error: "Received payment must be at least the subtotal amount." }, run: () => settlePayment("cash", 185, "abc", undefined) },
  { id: "UT-POS-08", fn: "settlePayment", kind: "Positive", title: "GCash: paid in full, no change", input: "GCash, total ₱185.00",
    expected: { receivedAmount: 185, changeAmount: 0, cashPortion: null }, run: () => settlePayment("online", 185, undefined, undefined) },
  // Split payment
  { id: "UT-POS-09", fn: "settlePayment", kind: "Positive", title: "split: cash part with change, GCash pays the rest", input: "Split, total ₱300.00, cash part ₱100.00, received ₱150.00",
    expected: { receivedAmount: 150, changeAmount: 50, cashPortion: 100 }, expectedText: "Cash part ₱100.00, change ₱50.00, GCash ₱200.00", run: () => settlePayment("split", 300, 150, 100) },
  { id: "UT-POS-10", fn: "settlePayment", kind: "Boundary", title: "split: a cash part equal to the total is refused (that is a cash payment)", input: "Split, total ₱300.00, cash part ₱300.00",
    expected: { error: "The cash part must be more than ₱0 and less than the total." }, run: () => settlePayment("split", 300, 300, 300) },
  { id: "UT-POS-11", fn: "settlePayment", kind: "Boundary", title: "split: a cash part of ₱0 is refused (that is a GCash payment)", input: "Split, total ₱300.00, cash part ₱0.00",
    expected: { error: "The cash part must be more than ₱0 and less than the total." }, run: () => settlePayment("split", 300, 0, 0) },
  { id: "UT-POS-12", fn: "settlePayment", kind: "Negative", title: "split: the cash received must cover the cash part", input: "Split, cash part ₱100.00, received ₱80.00",
    expected: { error: "The cash received must cover the cash part." }, run: () => settlePayment("split", 300, 80, 100) },
  // PayMongo payload
  { id: "UT-POS-13", fn: "createGcashPayment", kind: "Positive", title: "the PayMongo payment intent is in centavos, GCash only, with the order reference", input: "₱185.50, reference \"BH-900\"",
    expected: { amount: 18550, currency: "PHP", payment_method_allowed: ["gcash"], capture_type: "automatic", description: "Brew Houze order", statement_descriptor: "Brew Houze", metadata: { reference: "BH-900" } },
    run: async () => { const fetch = paymongoFetch(); await createGcashPayment({ amount: 185.5, description: "Brew Houze order", returnUrl: "https://menu.test/paid", reference: "BH-900" }); return sentBody(fetch, 0); } },
  { id: "UT-POS-14", fn: "createGcashPayment", kind: "Positive", title: "the customer is sent to the GCash page PayMongo returns, and comes back to the menu", input: "Attach answers with a GCash redirect",
    expected: { result: { intentId: "pi_1", redirectUrl: "https://gcash.test/pay/abc" }, returnUrl: "https://menu.test/paid" },
    run: async () => { const fetch = paymongoFetch(); const result = await createGcashPayment({ amount: 185.5, description: "x", returnUrl: "https://menu.test/paid", reference: "BH-900" }); return { result, returnUrl: sentBody(fetch, 2).return_url }; } },
  { id: "UT-POS-15", fn: "createGcashPayment", kind: "Negative", title: "PayMongo refusing the payment is reported, not ignored", input: "PayMongo answers 400 \"amount is below the minimum\"",
    expected: { error: "PayMongo: amount is below the minimum" }, run: () => { paymongoFetch(undefined, "amount is below the minimum"); return createGcashPayment({ amount: 5, description: "x", returnUrl: "https://menu.test", reference: "r" }); } },
  { id: "UT-POS-16", fn: "createGcashPayment", kind: "Negative", title: "no GCash page from PayMongo stops the payment", input: "Attach answers without a redirect",
    expected: { error: "PayMongo did not return a GCash page to open." }, run: () => { paymongoFetch({ next_action: null }); return createGcashPayment({ amount: 185.5, description: "x", returnUrl: "https://menu.test", reference: "r" }); } },
  // Closing the shift: expected cash and variance
  { id: "UT-POS-17", fn: "POST /api/shift (close)", kind: "Positive", title: "closing keeps the counted cash next to the expected cash (₱30.00 short), and the rest of the count goes to the safe", input: "Expected ₱5,230.00, counted ₱5,200.00, ₱1,000.00 kept for tomorrow",
    expected: { status: 200, counted: 5200, expected: 5230, variance: -30, toSafe: 4200, safeAfter: 14200 },
    run: async () => { const db = closingDb(5230); const result = await close({ counted_cash: 5200, float_kept: 1000 }); const saved = db.ran(/^UPDATE shifts SET closed_at/)[0].params as number[]; const entry = db.ran(/^INSERT INTO treasury_entries/)[0].params as number[];
      return { status: result.status, counted: saved[2], expected: saved[3], variance: Math.round((saved[2] - saved[3]) * 100) / 100, toSafe: entry[2], safeAfter: entry[3] }; } },
  { id: "UT-POS-18", fn: "POST /api/shift (close)", kind: "Negative", title: "the cash kept in the drawer cannot be more than was counted", input: "Counted ₱5,200.00, keep ₱6,000.00",
    expected: { status: 400, body: { error: "The cash left in the drawer can be ₱0 up to the counted cash." } }, run: () => { closingDb(5230); return close({ counted_cash: 5200, float_kept: 6000 }); } },
  { id: "UT-POS-19", fn: "POST /api/shift (close)", kind: "Negative", title: "a negative or missing count is refused", input: "Counted −₱50.00",
    expected: { status: 400, body: { error: "Count the cash in the drawer and enter the amount (0 or more)." } }, run: () => { closingDb(5230); return close({ counted_cash: -50 }); } },
]);
