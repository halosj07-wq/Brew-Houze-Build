import { vi } from "vitest";
import { unitCases } from "./harness";
import { latte, order, orderDb } from "./order-fixture";
import { isSoldOut, usedShare } from "@/lib/orders";

vi.mock("@/lib/db", () => import("./fake-db").then((m) => m.poolModule));
vi.mock("@/lib/realtime", () => ({ signalChange: vi.fn() }));

// Objective 4 (Staff Portal / Mobile Menu part). Real-time inventory: every order takes its recipe
// off the stock in the same transaction. A Spanish Latte uses 18 g beans, 150 ml milk, 15 ml syrup.
unitCases("cashier", "Objective 4 - Inventory", [
  { id: "UT-INV-01", fn: "placeOrder", kind: "Positive", title: "an order takes each recipe ingredient off the stock, times the quantity", input: "2 Spanish Latte",
    expected: { "Espresso Beans": 36, "Fresh Milk": 300, "Caramel Syrup": 30 }, expectedText: "Beans −36 g, milk −300 ml, syrup −30 ml",
    run: async () => { const cafe = orderDb(); await order(cafe.db, { items: [latte({ quantity: 2 })] }); return cafe.deducted(); } },
  { id: "UT-INV-02", fn: "placeOrder", kind: "Positive", title: "an add-on takes its own ingredient off too", input: "1 Spanish Latte with Extra Shot (18 g beans)",
    expected: { "Espresso Beans": 36, "Fresh Milk": 150, "Caramel Syrup": 15 }, expectedText: "Beans −36 g (18 + 18)",
    run: async () => { const cafe = orderDb(); await order(cafe.db, { items: [latte({ additionIds: [9] })] }); return cafe.deducted(); } },
  { id: "UT-INV-03", fn: "placeOrder", kind: "Boundary", title: "\"less\" takes half and \"none\" takes nothing", input: "1 Spanish Latte, less syrup, no milk",
    expected: { "Espresso Beans": 18, "Caramel Syrup": 7.5 }, expectedText: "Beans −18 g, syrup −7.5 ml, milk untouched",
    run: async () => { const cafe = orderDb(); await order(cafe.db, { items: [latte({ customizations: [{ inventoryId: 11, level: "none" }, { inventoryId: 12, level: "less" }] })] }); return cafe.deducted(); } },
  { id: "UT-INV-04", fn: "usedShare", kind: "Positive", title: "the share of an ingredient each level uses", input: "\"less\", \"none\", no request",
    expected: [0.5, 0, 1], run: () => [usedShare("less"), usedShare("none"), usedShare(undefined)] },
  { id: "UT-INV-05", fn: "placeOrder", kind: "Boundary", title: "an order may use the last of an item (stock reaches exactly 0)", input: "Fresh Milk on hand 150 ml, 1 Spanish Latte",
    expected: 0, run: async () => { const cafe = orderDb({ stock: { 11: 150 } }); await order(cafe.db, {}); return cafe.stock[11]; } },
  { id: "UT-INV-06", fn: "placeOrder", kind: "Negative", title: "an order needing more than is on hand is refused as sold out, and stock never goes below 0", input: "Fresh Milk on hand 100 ml, 1 Spanish Latte (needs 150 ml)",
    expected: { soldOut: true, error: "Insufficient stock for Fresh Milk.", milkLeft: 100 },
    run: async () => { const cafe = orderDb({ stock: { 11: 100 } }); return order(cafe.db, {}).then(() => "placed", (error) => ({ soldOut: isSoldOut(error), error: error.message, milkLeft: cafe.stock[11] })); } },
  { id: "UT-INV-07", fn: "placeOrder", kind: "Positive", title: "the cost of what was made is kept on the sales line", input: "1 Spanish Latte: 18 × ₱1.20 + 150 × ₱0.10 + 15 × ₱0.50",
    expected: 44.1, expectedText: "Unit cost ₱44.10",
    run: async () => { const cafe = orderDb(); await order(cafe.db, {}); return cafe.db.ran(/^INSERT INTO sales_order_items/)[0].params[5]; } },
]);
