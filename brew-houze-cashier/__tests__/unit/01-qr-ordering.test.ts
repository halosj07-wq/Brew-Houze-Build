import { vi } from "vitest";
import { unitCases } from "./harness";
import { latte, order, orderDb } from "./order-fixture";
import { isSoldOut, parseOrderItems } from "@/lib/orders";

vi.mock("@/lib/db", () => import("./fake-db").then((m) => m.poolModule));
vi.mock("@/lib/realtime", () => ({ signalChange: vi.fn() }));

// Objective 1. QR code ordering (the Mobile Menu the customer opens by scanning the café's QR code).
// The mobile menu and the Staff Portal share lib/orders.ts (identical copies), so the Staff Portal
// copy is tested. Orders from the phone come in with source "mobile".
const mobile = { source: "mobile" as const, cashierAdminId: null };
const line = (extra: Record<string, unknown> = {}) => ({ product_variant_id: 5, quantity: 1, ...extra });

unitCases("cashier", "Objective 1 - QR Code Ordering", [
  { id: "UT-QRO-01", fn: "placeOrder", kind: "Negative", title: "the menu refuses orders while the café is closed (no open shift)", input: "Mobile order, no shift open",
    expected: { error: "Brew Houze isn't taking orders right now. Please order again once the café is open." },
    run: () => order(orderDb({ open: false }).db, mobile) },
  { id: "UT-QRO-02", fn: "placeOrder", kind: "Positive", title: "an order while the café is open goes to the queue as an online order", input: "Mobile order, shift #7 open, 1 Spanish Latte",
    expected: { source: "online", shiftId: 7, total: 120 },
    run: async () => { const cafe = orderDb(); await order(cafe.db, mobile); const saved = cafe.savedOrder(); return { source: saved.source, shiftId: saved.shiftId, total: saved.total }; } },
  { id: "UT-QRO-03", fn: "placeOrder", kind: "Positive", title: "the order is tied to the phone session that scanned the QR code (order token)", input: "Mobile order with order token \"qr-7f3a\"",
    expected: "qr-7f3a", run: async () => { const cafe = orderDb(); await order(cafe.db, { ...mobile, customerToken: "qr-7f3a" }); return cafe.savedOrder().customerToken; } },
  { id: "UT-QRO-04", fn: "placeOrder", kind: "Positive", title: "an add-on is charged per item: (₱120.00 + ₱25.00) × 2", input: "2 Spanish Latte with 1 Extra Shot each",
    expected: 290, expectedText: "Subtotal ₱290.00",
    run: async () => (await order(orderDb().db, { ...mobile, items: [latte({ quantity: 2, additionIds: [9] })] })).subtotal },
  { id: "UT-QRO-05", fn: "placeOrder", kind: "Boundary", title: "a repeated add-on (double shot) is charged twice", input: "1 Spanish Latte with Extra Shot × 2",
    expected: 170, expectedText: "Subtotal ₱170.00 (₱120.00 + 2 × ₱25.00)",
    run: async () => (await order(orderDb().db, { ...mobile, items: [latte({ additionIds: [9, 9] })] })).subtotal },
  { id: "UT-QRO-06", fn: "placeOrder", kind: "Boundary", title: "asking for less or no ingredient does not change the price", input: "1 Spanish Latte, less caramel syrup, no milk",
    expected: 120, expectedText: "Subtotal ₱120.00",
    run: async () => (await order(orderDb().db, { ...mobile, items: [latte({ customizations: [{ inventoryId: 11, level: "none" }, { inventoryId: 12, level: "less" }] })] })).subtotal },
  { id: "UT-QRO-07", fn: "placeOrder", kind: "Negative", title: "an ingredient the admin did not mark customizable cannot be changed", input: "Spanish Latte with \"no espresso beans\"",
    expected: { error: "Espresso Beans in Spanish Latte can't be changed. Remove the customization and try again." },
    run: () => order(orderDb().db, { ...mobile, items: [latte({ customizations: [{ inventoryId: 10, level: "none" }] })] }) },
  { id: "UT-QRO-08", fn: "parseOrderItems", kind: "Boundary", title: "a cart line with quantity 0 is dropped", input: "Variant 5, quantity 0",
    expected: [], expectedText: "No lines", run: () => parseOrderItems([line({ quantity: 0 })]) },
  { id: "UT-QRO-09", fn: "parseOrderItems", kind: "Negative", title: "a cart line with a negative quantity is dropped", input: "Variant 5, quantity −2",
    expected: [], expectedText: "No lines", run: () => parseOrderItems([line({ quantity: -2 })]) },
  { id: "UT-QRO-10", fn: "parseOrderItems", kind: "Negative", title: "a fractional quantity is dropped", input: "Variant 5, quantity 1.5",
    expected: [], expectedText: "No lines", run: () => parseOrderItems([line({ quantity: 1.5 })]) },
  { id: "UT-QRO-11", fn: "parseOrderItems", kind: "Boundary", title: "quantity 1 (the smallest valid) is kept", input: "Variant 5, quantity 1",
    expected: 1, run: () => parseOrderItems([line()])[0]?.quantity },
  { id: "UT-QRO-12", fn: "placeOrder", kind: "Negative", title: "an empty cart is refused", input: "No items",
    expected: { error: "At least one valid cart item is required." }, run: () => order(orderDb().db, { ...mobile, items: [] }) },
  { id: "UT-QRO-13", fn: "placeOrder", kind: "Negative", title: "an item no longer on the menu is refused as sold out", input: "Archived variant 99",
    expected: { soldOut: true, error: "One or more selected products are no longer available." },
    run: () => order(orderDb().db, { ...mobile, items: [latte({ productVariantId: 99 })] }).catch((error) => ({ soldOut: isSoldOut(error), error: error.message })) },
  { id: "UT-QRO-14", fn: "placeOrder", kind: "Negative", title: "a drink add-on cannot go on an item sold as stocked", input: "Bottled Water with Extra Shot",
    expected: { error: "Bottled Water does not take additions." }, run: () => order(orderDb().db, { ...mobile, items: [latte({ productVariantId: 8, additionIds: [9] })] }) },
]);
