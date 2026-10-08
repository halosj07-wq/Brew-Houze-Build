import { vi } from "vitest";
import { unitCases } from "./harness";
import { fakeDb, setDb } from "./fake-db";
import { applyWriteOff, WriteOffStockError } from "@/lib/write-offs";
import { weightedAverageUnitCost } from "@/lib/inventory";
import { GET as notifications } from "@/app/api/notifications/route";

vi.mock("@/lib/db", () => import("./fake-db").then((m) => m.poolModule));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => undefined }) }));
vi.mock("@/lib/sessions", async (original) => ({ ...(await original<object>()), getSession: async () => ({ adminId: 1, role: "admin" }) }));

// Objective 4 (Admin Portal part). Inventory: writing off waste, low-stock alerts and the cost of
// stock. Stock on hand: 1,200 ml Fresh Milk (₱0.10/ml), 5,000 g Espresso Beans (₱1.20/g).
const ITEMS: Record<number, { item_name: string; ingredient_category: string; unit_of_measure: string; unit_cost: string }> = {
  10: { item_name: "Espresso Beans", ingredient_category: "Coffee", unit_of_measure: "g", unit_cost: "1.20" },
  11: { item_name: "Fresh Milk", ingredient_category: "Dairy", unit_of_measure: "ml", unit_cost: "0.10" },
};
function stockDb(onHand: Record<number, number> = { 10: 5000, 11: 1200 }) {
  const stock = { ...onHand };
  const db = fakeDb([
    [/FROM product_variants pv JOIN products p/, [{ product_name: "Spanish Latte", size_label: "16 oz" }]],
    [/^SELECT inventory_id, required_quantity FROM variant_ingredients/, [{ inventory_id: 10, required_quantity: "18" }, { inventory_id: 11, required_quantity: "150" }]],
    [/^SELECT item_name FROM inventory WHERE inventory_id = \$1/, (params) => [{ item_name: ITEMS[params[0] as number].item_name }]],
    [/derived_from_inventory_id IS NOT NULL/, []],
    [/^SELECT inventory_id, item_name, unit_of_measure, quantity, unit_cost FROM inventory/, (params) => (params[0] as number[]).map((id) => ({ inventory_id: id, ...ITEMS[id], quantity: String(stock[id]) }))],
    [/^UPDATE inventory SET quantity = quantity - \$1/, (params) => { const [amount, id] = params as [number, number]; stock[id] -= amount; return [{ ...ITEMS[id], quantity: String(stock[id]) }]; }],
  ]);
  const log = () => db.ran(/^INSERT INTO inventory_log/).map((entry) => ({ item: entry.params[1], before: entry.params[4], after: entry.params[5], change: entry.params[6], reason: entry.params[10], cost: entry.params[11] }));
  return { db, stock, log };
}
const writeOff = (cafe: ReturnType<typeof stockDb>, target: { productVariantId: number; quantity: number } | { inventoryId: number; quantity: number }, reason: "expired" | "wasted" = "expired") =>
  applyWriteOff(cafe.db.client, { target, reason, note: "", adminId: 1, sourceApp: "admin" });

// The bell (app/api/notifications): items at or below their low-stock level come from the query;
// the route words them.
async function stockAlerts(rows: Record<string, unknown>[]) {
  setDb([[/low_stock_threshold/, rows.map((row) => ({ unit_of_measure: "ml", at: "2026-10-08T09:00:00.000+08:00", ...row }))]]);
  const response = await notifications();
  return ((await response.json()).data as { kind: string; tone: string; title: string }[]).filter((item) => item.kind === "stock").map((item) => ({ tone: item.tone, title: item.title }));
}

unitCases("admin", "Objective 4 - Inventory", [
  { id: "UT-INV-08", fn: "applyWriteOff", kind: "Positive", title: "spoiled stock comes off with its reason and cost logged", input: "500 ml Fresh Milk expired (1,200 ml on hand)",
    expected: [{ item: "Fresh Milk", before: 1200, after: 700, change: -500, reason: "expired", cost: 50 }], expectedText: "700 ml left; logged: expired, ₱50.00",
    run: async () => { const cafe = stockDb(); await writeOff(cafe, { inventoryId: 11, quantity: 500 }); return cafe.log(); } },
  { id: "UT-INV-09", fn: "applyWriteOff", kind: "Positive", title: "a spilled drink takes its whole recipe off", input: "2 × Spanish Latte 16 oz spilled",
    expected: { left: { 10: 4964, 11: 900 }, cost: 73.2 }, expectedText: "Beans −36 g, milk −300 ml; cost ₱73.20",
    run: async () => { const cafe = stockDb(); const plan = await writeOff(cafe, { productVariantId: 5, quantity: 2 }, "wasted"); return { left: cafe.stock, cost: plan.cost }; } },
  { id: "UT-INV-10", fn: "applyWriteOff", kind: "Boundary", title: "everything on hand can be written off (exactly 0 left)", input: "1,200 ml Fresh Milk expired (1,200 ml on hand)",
    expected: 0, run: async () => { const cafe = stockDb(); await writeOff(cafe, { inventoryId: 11, quantity: 1200 }); return cafe.stock[11]; } },
  { id: "UT-INV-11", fn: "applyWriteOff", kind: "Negative", title: "writing off more than is on hand is refused, so stock never goes below 0", input: "1,500 ml Fresh Milk (1,200 ml on hand)",
    expected: { stockError: true, error: "Only 1200 ml of Fresh Milk is in stock, but this needs 1500.", milkLeft: 1200, updates: 0 },
    run: async () => { const cafe = stockDb(); return writeOff(cafe, { inventoryId: 11, quantity: 1500 }).then(() => "written off", (error) => ({ stockError: error instanceof WriteOffStockError, error: error.message, milkLeft: cafe.stock[11], updates: cafe.db.ran(/^UPDATE inventory/).length })); } },
  { id: "UT-INV-12", fn: "GET /api/notifications", kind: "Positive", title: "an item at or below its low-stock level raises a warning", input: "Caramel Syrup 120 ml (alert at 200 ml)",
    expected: [{ tone: "warning", title: "Caramel Syrup is running low" }], run: () => stockAlerts([{ inventory_id: 12, item_name: "Caramel Syrup", quantity: "120", low_stock_threshold: "200" }]) },
  { id: "UT-INV-13", fn: "GET /api/notifications", kind: "Boundary", title: "an item at 0 is out of stock (danger, not just low)", input: "Fresh Milk 0 ml",
    expected: [{ tone: "danger", title: "Fresh Milk is out of stock" }], run: () => stockAlerts([{ inventory_id: 11, item_name: "Fresh Milk", quantity: "0", low_stock_threshold: "500" }]) },
  { id: "UT-INV-14", fn: "weightedAverageUnitCost", kind: "Positive", title: "restocking averages the cost of what is on hand and the new packs", input: "500 g at ₱1.00 on hand + 1,000 g bought for ₱1,400.00",
    expected: 1.2667, expectedText: "₱1.2667 per g", run: () => weightedAverageUnitCost(500, 1, 1000, 1400) },
  { id: "UT-INV-15", fn: "weightedAverageUnitCost", kind: "Negative", title: "adding nothing leaves the cost unchanged (never NaN)", input: "Nothing on hand, no cost entered, 0 added",
    expected: 0, expectedText: "₱0.00 (unchanged)", run: () => weightedAverageUnitCost(0, null, 0, 0) },
]);
