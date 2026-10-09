import { beforeAll } from "vitest";
import { systemCases } from "./harness";
import { loadTestEnv } from "../integration/support/env";
import { OTP_EMAIL, PASSWORD, testPool } from "../integration/support/db";
import { AppUser, customer, staff } from "../integration/support/http";

// Level 3: black-box system tests of the whole system against its functional requirements
// (requirements.ts), through the HTTP interface the screens use, on the production builds of the
// four apps with the test database (rebuilt before the run) and the real outside services. The
// cases run in the order of a café's day: the store is closed, then opened, used, and closed.
const env = loadTestEnv();
const db = testPool(env);
const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
const LATTE = 1, AMERICANO = 2, CROISSANT = 3, EXTRA_SHOT = 1;

type Res = Awaited<ReturnType<AppUser["get"]>>;
const outcome = (r: Res) => ({ status: r.status, error: r.json?.error ?? null });
// For refusals whose wording is not part of the requirement: refused with a message.
const refused = (r: Res) => ({ status: r.status, refused: r.status >= 400 && typeof r.json?.error === "string" && r.json.error.length > 0 });
const one = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0];
const stock = async (name: string) => Number((await one("SELECT quantity FROM inventory WHERE item_name = $1", [name])).quantity);
const item = (variant: number, quantity = 1, extra: Record<string, unknown> = {}) => ({ product_variant_id: variant, quantity, ...extra });
const cash = (items: unknown[], received: number, extra: Record<string, unknown> = {}) => cashier.post("/api/checkout", { items, payment_method: "cash", received_amount: received, service_type: "dine_in", ...extra });
const expectedCash = async () => Number((await cashier.get("/api/shift")).json.data?.expectedCash);
const titles = async () => ((await admin.get("/api/notifications")).json.data as { title: string }[]).map((n) => n.title);
const deliveryAddress = { address: { recipient_name: "Ana Test", phone: "09171234567", zone_id: 1, street: "12 Rizal St." } };

let cashier: AppUser, barista: AppUser, rider: AppUser, admin: AppUser, phone: AppUser, member: AppUser;
const s: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any -- state shared by the cases, in order

beforeAll(async () => {
  [cashier, barista, rider, admin, member] = await Promise.all([staff("cashier", "cashier"), staff("cashier", "barista"), staff("cashier", "rider"), staff("admin", "admin"), customer()]);
  phone = new AppUser("mobile");
  s.customerId = Number((await one("SELECT customer_id FROM customers WHERE username = 'ana_test'")).customer_id);
});

systemCases([
  // ── Before the store opens ──
  { id: "TC-QRO-001", fr: "FR-01", kind: "Positive", scenario: "Open the Mobile Menu and read the menu", expectedText: "Americano ₱100.00, Butter Croissant ₱75.00, Spanish Latte ₱120.00",
    expected: { Americano: 100, "Butter Croissant": 75, "Spanish Latte": 120 },
    run: async () => Object.fromEntries(((await phone.get("/api/products")).json.data as { name: string; price: number }[]).map((p) => [p.name, p.price]).sort()) },
  { id: "TC-QRO-002", fr: "FR-01", kind: "Positive", scenario: "Open Spanish Latte and look at its add-ons", expectedText: "Extra Shot is offered", expected: ["Extra Shot"],
    run: async () => (((await phone.get("/api/products")).json.data as { name: string; additions: { name: string }[] }[]).find((p) => p.name === "Spanish Latte")?.additions ?? []).map((a) => a.name) },
  { id: "TC-QRO-003", fr: "FR-01", kind: "Negative", scenario: "Open the menu before the store is opened", expectedText: "Menu shows the café as closed", expected: false,
    run: async () => (await phone.get("/api/products")).json.storeOpen },
  { id: "TC-QRO-004", fr: "FR-03", kind: "Negative", scenario: "Send a cart to the counter while the café is closed", expectedText: "Refused with a message", expected: { status: 400, refused: true },
    run: async () => refused(await phone.post("/api/counter-carts", { items: [item(AMERICANO)], service_type: "dine_in" })) },

  // ── Opening ──
  { id: "TC-POS-001", fr: "FR-09", kind: "Negative", scenario: "Open the shift with a wrong password", expectedText: "403: That password is incorrect.", expected: { status: 403, error: "That password is incorrect." },
    run: async () => outcome(await cashier.post("/api/shift", { action: "open", starting_cash: 1000, password: "wrong-password" })) },
  { id: "TC-POS-002", fr: "FR-09", kind: "Positive", scenario: "Open the shift with ₱1,000.00 starting cash", expectedText: "Shift opened (201) with ₱1,000.00 expected in the drawer", expected: { status: 201, expectedCash: 1000 },
    run: async () => { const r = await cashier.post("/api/shift", { action: "open", starting_cash: 1000, password: PASSWORD }); return { status: r.status, expectedCash: Number(r.json.data?.expectedCash) }; } },
  { id: "TC-POS-003", fr: "FR-09", kind: "Negative", scenario: "Open a second shift while one is open", expectedText: "Refused with a message", expected: { status: 409, refused: true },
    run: async () => refused(await cashier.post("/api/shift", { action: "open", starting_cash: 500, password: PASSWORD })) },
  { id: "TC-QRO-005", fr: "FR-01", kind: "Positive", scenario: "Open the menu after the store is opened", expectedText: "Menu shows the café as open", expected: true,
    run: async () => (await phone.get("/api/products")).json.storeOpen },

  // ── QR ordering ──
  { id: "TC-QRO-006", fr: "FR-02", kind: "Positive", scenario: "Send 1 Spanish Latte with an Extra Shot to the counter", expectedText: "Total ₱145.00", expected: 145,
    run: async () => (await phone.post("/api/counter-carts", { items: [item(LATTE, 1, { addition_ids: [EXTRA_SHOT] })], service_type: "dine_in" })).json.data?.total },
  { id: "TC-QRO-007", fr: "FR-02", kind: "Positive", scenario: "Ask for no milk and less syrup", expectedText: "Total stays ₱120.00", expected: 120,
    run: async () => (await phone.post("/api/counter-carts", { items: [item(LATTE, 1, { customizations: [{ inventory_id: 2, level: "none" }, { inventory_id: 3, level: "less" }] })], service_type: "take_out" })).json.data?.total },
  { id: "TC-QRO-008", fr: "FR-02", kind: "Negative", scenario: "Ask for no espresso beans (not customizable)", expectedText: "Refused with a message", expected: { status: 400, refused: true },
    run: async () => refused(await phone.post("/api/counter-carts", { items: [item(LATTE, 1, { customizations: [{ inventory_id: 1, level: "none" }] })], service_type: "dine_in" })) },
  { id: "TC-QRO-009", fr: "FR-03", kind: "Negative", scenario: "Order quantity 0", expectedText: "400: Add something to your order first.", expected: { status: 400, error: "Add something to your order first." },
    run: async () => outcome(await phone.post("/api/counter-carts", { items: [item(AMERICANO, 0)], service_type: "dine_in" })) },
  { id: "TC-QRO-010", fr: "FR-03", kind: "Negative", scenario: "Order quantity −1", expectedText: "400: Add something to your order first.", expected: { status: 400, error: "Add something to your order first." },
    run: async () => outcome(await phone.post("/api/counter-carts", { items: [item(AMERICANO, -1)], service_type: "dine_in" })) },
  { id: "TC-QRO-011", fr: "FR-03", kind: "Negative", scenario: "Order an item that is not on the menu", expectedText: "409: Some items in your cart just sold out.", expected: { status: 409, error: "Some items in your cart just sold out." },
    run: async () => outcome(await phone.post("/api/counter-carts", { items: [item(999)], service_type: "dine_in" })) },
  { id: "TC-QRO-012", fr: "FR-03", kind: "Negative", scenario: "Order 21 croissants when 20 are in stock", expectedText: "409: Some items in your cart just sold out.", expected: { status: 409, error: "Some items in your cart just sold out." },
    run: async () => outcome(await phone.post("/api/counter-carts", { items: [item(CROISSANT, 21)], service_type: "take_out" })) },
  { id: "TC-QRO-013", fr: "FR-03", kind: "Negative", scenario: "Place a phone order without paying", expectedText: "409: Please pay with GCash to place your order.", expected: { status: 409, error: "Please pay with GCash to place your order." },
    run: async () => outcome(await phone.post("/api/orders", { items: [item(AMERICANO)], service_type: "take_out" })) },
  { id: "TC-QRO-014", fr: "FR-03", kind: "Positive", scenario: "Pay a phone order with GCash", expectedText: "201 and the PayMongo GCash page to open", expected: { status: 201, page: "secure-authentication.paymongo.com" },
    run: async () => { const r = await phone.post("/api/payments", { items: [item(AMERICANO)], service_type: "take_out" }); return { status: r.status, page: r.json.data?.redirectUrl ? new URL(r.json.data.redirectUrl).host : null }; } },
  { id: "TC-QRO-015", fr: "FR-03", kind: "Negative", scenario: "Send a delivery order to the counter", expectedText: "Refused with a message", expected: { status: 400, refused: true },
    run: async () => refused(await phone.post("/api/counter-carts", { items: [item(AMERICANO)], service_type: "delivery" })) },
  { id: "TC-QRO-016", fr: "FR-04", kind: "Positive", scenario: "Send a Spanish Latte to the counter; the cashier checks it out; follow it on the phone", expectedText: "Phone shows queue #1, waiting", expected: { queue_number: 1, queue_status: "waiting" },
    run: async () => {
      const sent = await phone.post("/api/counter-carts", { items: [item(LATTE)], service_type: "dine_in" });
      const cart = ((await cashier.get("/api/counter-carts")).json.data as { id: number; code: string }[]).find((c) => c.code === sent.json.data?.code);
      const sold = await cash([item(LATTE)], 120, { counter_cart_id: cart?.id });
      s.trackedOrder = sold.json.data; s.trackToken = sent.json.data?.token;
      const t = (await phone.get(`/api/orders/${s.trackToken}`)).json.data;
      return t && { queue_number: t.queue_number, queue_status: t.queue_status };
    } },
  { id: "TC-QRO-017", fr: "FR-04", kind: "Negative", scenario: "Open a tracking link with an invalid token", expectedText: "400: Invalid tracking token.", expected: { status: 400, error: "Invalid tracking token." },
    run: async () => outcome(await phone.get("/api/orders/not-a-token")) },
  { id: "TC-QRO-018", fr: "FR-04", kind: "Negative", scenario: "Open a tracking link of an order that does not exist", expectedText: "404: Order not found.", expected: { status: 404, error: "Order not found." },
    run: async () => outcome(await phone.get("/api/orders/00000000-0000-4000-8000-000000000000")) },

  // ── POS ──
  { id: "TC-POS-004", fr: "FR-05", kind: "Positive", scenario: "Sell 1 Americano for ₱200.00 cash", expectedText: "Change ₱100.00", expected: { status: 200, change: 100 },
    run: async () => { const r = await cash([item(AMERICANO)], 200); s.sale = r.json.data; return { status: r.status, change: r.json.data?.changeAmount }; } },
  { id: "TC-POS-005", fr: "FR-05", kind: "Negative", scenario: "Accept ₱50.00 for a ₱100.00 order", expectedText: "400: Received payment must be at least the subtotal amount.", expected: { status: 400, error: "Received payment must be at least the subtotal amount." },
    run: async () => outcome(await cash([item(AMERICANO)], 50)) },
  { id: "TC-POS-006", fr: "FR-05", kind: "Negative", scenario: "Check out an empty cart", expectedText: "400: At least one valid cart item is required.", expected: { status: 400, error: "At least one valid cart item is required." },
    run: async () => outcome(await cash([], 100)) },
  { id: "TC-POS-007", fr: "FR-05", kind: "Negative", scenario: "Sign in to the Staff Portal with a wrong password", expectedText: "401: Invalid cashier email or password.", expected: { status: 401, error: "Invalid cashier email or password." },
    run: async () => outcome(await new AppUser("cashier").post("/api/auth/login", { email: "cashier@test.brewhouze.local", password: "wrong-password" })) },
  { id: "TC-POS-008", fr: "FR-06", kind: "Positive", scenario: "Sell 1 Americano (₱100.00) to a senior citizen with ID", expectedText: "VAT exempt ₱10.71, discount ₱17.86, total ₱71.43", expected: { vatExempt: 10.71, discount: 17.86, total: 71.43 },
    run: async () => {
      const senior = Number((await one("SELECT discount_type_id FROM discount_types WHERE code = 'senior'")).discount_type_id);
      const r = await cash([item(AMERICANO)], 100, { id_discounts: [{ type_id: senior, holder_name: "Juan Dela Cruz", id_number: "SC-12345", lines: [{ line: 0, quantity: 1 }] }] });
      return { vatExempt: r.json.data?.vatExemptAmount, discount: r.json.data?.discountAmount, total: r.json.data?.total };
    } },
  { id: "TC-POS-009", fr: "FR-06", kind: "Negative", scenario: "Apply a senior discount without the holder's name", expectedText: "Refused with a message", expected: { status: 400, refused: true },
    run: async () => { const senior = Number((await one("SELECT discount_type_id FROM discount_types WHERE code = 'senior'")).discount_type_id); return refused(await cash([item(AMERICANO)], 100, { id_discounts: [{ type_id: senior, holder_name: "", id_number: "SC-1", lines: [{ line: 0, quantity: 1 }] }] })); } },
  { id: "TC-POS-010", fr: "FR-07", kind: "Negative", scenario: "Record a GCash payment as a counter cash checkout", expectedText: "Refused with a message", expected: { status: 400, refused: true },
    run: async () => refused(await cashier.post("/api/checkout", { items: [item(AMERICANO)], payment_method: "online", service_type: "dine_in" })) },
  { id: "TC-POS-011", fr: "FR-07", kind: "Positive", scenario: "Start a counter GCash payment", expectedText: "201 with the PayMongo GCash page", expected: { status: 201, page: "secure-authentication.paymongo.com" },
    run: async () => { const r = await cashier.post("/api/payments", { items: [item(AMERICANO)], service_type: "dine_in" }); return { status: r.status, page: r.json.data?.redirectUrl ? new URL(r.json.data.redirectUrl).host : null }; } },
  { id: "TC-POS-012", fr: "FR-08", kind: "Positive", scenario: "Sell two more orders", expectedText: "Consecutive queue numbers", expected: 1,
    run: async () => { const a = await cash([item(AMERICANO)], 100); const b = await cash([item(AMERICANO)], 100); s.queueOrder = b.json.data; return b.json.data?.queueNumber - a.json.data?.queueNumber; } },
  { id: "TC-POS-013", fr: "FR-08", kind: "Positive", scenario: "The barista marks the order ready", expectedText: "Its number is under Ready on the Queue Screen", expected: true,
    run: async () => { await barista.patch("/api/queue", { order_id: s.queueOrder.orderId, action: "ready" }); return ((await new AppUser("queue").get("/api/queue")).json.data?.ready ?? []).some((o: { queue_number: number }) => o.queue_number === s.queueOrder.queueNumber); } },
  { id: "TC-POS-014", fr: "FR-08", kind: "Positive", scenario: "The counter hands the order over", expectedText: "The number leaves the Queue Screen", expected: false,
    run: async () => { await cashier.patch("/api/queue", { order_id: s.queueOrder.orderId, action: "pickup" }); const q = (await new AppUser("queue").get("/api/queue")).json.data; return [...(q?.ready ?? []), ...(q?.waiting ?? [])].some((o: { queue_number: number }) => o.queue_number === s.queueOrder.queueNumber); } },
  { id: "TC-POS-015", fr: "FR-08", kind: "Negative", scenario: "Hand over an order that is not ready", expectedText: "404: This order is not ready for pickup, or was already picked up.", expected: { status: 404, error: "This order is not ready for pickup, or was already picked up." },
    run: async () => outcome(await cashier.patch("/api/queue", { order_id: s.sale.orderId, action: "pickup" })) },
  { id: "TC-POS-016", fr: "FR-08", kind: "Negative", scenario: "The barista marks an already handed-over order ready again", expectedText: "404: This order has nothing waiting at the bar.", expected: { status: 404, error: "This order has nothing waiting at the bar." },
    run: async () => outcome(await barista.patch("/api/queue", { order_id: s.queueOrder.orderId, action: "ready" })) },
  { id: "TC-POS-017", fr: "FR-09", kind: "Positive", scenario: "Drop ₱200.00 from the drawer into the safe", expectedText: "Expected drawer cash −₱200.00", expected: -200,
    run: async () => { const before = await expectedCash(); await cashier.post("/api/cash-movements", { kind: "cash_drop", amount: 200, reason: "Too much cash", password: PASSWORD }); return (await expectedCash()) - before; } },
  { id: "TC-POS-018", fr: "FR-09", kind: "Negative", scenario: "Take out more cash than the drawer should have", expectedText: "400: The drawer should only have …", expected: { status: 400, startsRight: true },
    run: async () => { const r = await cashier.post("/api/cash-movements", { kind: "cash_out", amount: 999999, reason: "Supplies", password: PASSWORD }); return { status: r.status, startsRight: String(r.json?.error).startsWith("The drawer should only have") }; } },
  { id: "TC-POS-019", fr: "FR-09", kind: "Negative", scenario: "Record a cash drop with a wrong password", expectedText: "403: That password is incorrect.", expected: { status: 403, error: "That password is incorrect." },
    run: async () => outcome(await cashier.post("/api/cash-movements", { kind: "cash_drop", amount: 50, reason: "Too much cash", password: "wrong-password" })) },
  { id: "TC-POS-020", fr: "FR-10", kind: "Negative", scenario: "Void an order with a wrong password", expectedText: "403: That password is incorrect.", expected: { status: 403, error: "That password is incorrect." },
    run: async () => outcome(await cashier.post("/api/order-actions", { order_id: s.sale.orderId, action: "void", password: "wrong-password", return_method: "cash", made: false })) },
  { id: "TC-POS-021", fr: "FR-10", kind: "Positive", scenario: "Void the order with the password", expectedText: "Order voided", expected: { status: 200, saved: "voided" },
    run: async () => { const r = await cashier.post("/api/order-actions", { order_id: s.sale.orderId, action: "void", password: PASSWORD, return_method: "cash", made: false }); return { status: r.status, saved: (await one("SELECT status FROM sales_orders WHERE order_id = $1", [s.sale.orderId])).status }; } },
  { id: "TC-POS-022", fr: "FR-10", kind: "Negative", scenario: "Void the same order again", expectedText: "Refused with a message", expected: { status: 409, refused: true },
    run: async () => refused(await cashier.post("/api/order-actions", { order_id: s.sale.orderId, action: "void", password: PASSWORD, return_method: "cash", made: false })) },
  { id: "TC-POS-023", fr: "FR-11", kind: "Positive", scenario: "Open the receipt of the counter order from the phone cart", expectedText: "Receipt for that order: 1 × Spanish Latte, total ₱120.00", expected: { items: ["1 × Spanish Latte"], total: 120 },
    run: async () => { const r = (await cashier.get(`/api/receipts/${s.trackedOrder.orderId}`)).json.data; return { items: (r?.items ?? []).map((i: { quantity: number; name: string }) => `${i.quantity} × ${i.name}`), total: r?.total }; } },
  { id: "TC-POS-024", fr: "FR-11", kind: "Negative", scenario: "Open the receipt of an order that does not exist", expectedText: "404: Order not found.", expected: { status: 404, error: "Order not found." },
    run: async () => outcome(await cashier.get("/api/receipts/999999")) },

  // ── Delivery ──
  { id: "TC-DEL-001", fr: "FR-12", kind: "Positive", scenario: "List the delivery zones at the counter", expectedText: "Poblacion, fee ₱50.00", expected: [{ name: "Poblacion", fee: 50 }],
    run: async () => ((await cashier.get("/api/delivery-zones")).json.data?.zones ?? []).map((z: { name: string; fee: number }) => ({ name: z.name, fee: z.fee })) },
  { id: "TC-DEL-002", fr: "FR-12", kind: "Positive", scenario: "Take a cash-on-delivery order of 1 Americano to Poblacion", expectedText: "Total ₱150.00 (₱100.00 + ₱50.00 fee)", expected: { total: 150, deliveryFee: 50 },
    run: async () => { const r = await cashier.post("/api/checkout", { items: [item(AMERICANO)], payment_method: "cod", service_type: "delivery", delivery: deliveryAddress }); s.cod = r.json.data; s.codDelivery = (await one("SELECT delivery_id FROM deliveries WHERE order_id = $1", [r.json.data?.orderId]))?.delivery_id; return { total: r.json.data?.total, deliveryFee: r.json.data?.deliveryFee }; } },
  { id: "TC-DEL-003", fr: "FR-12", kind: "Negative", scenario: "Take a delivery order without an address", expectedText: "400: Choose the delivery address.", expected: { status: 400, error: "Choose the delivery address." },
    run: async () => outcome(await cashier.post("/api/checkout", { items: [item(AMERICANO)], payment_method: "cod", service_type: "delivery", delivery: {} })) },
  { id: "TC-DEL-004", fr: "FR-12", kind: "Negative", scenario: "Deliver to an area the café does not serve", expectedText: "400: The café doesn't deliver to that area. Choose another one.", expected: { status: 400, error: "The café doesn't deliver to that area. Choose another one." },
    run: async () => outcome(await cashier.post("/api/checkout", { items: [item(AMERICANO)], payment_method: "cod", service_type: "delivery", delivery: { address: { ...deliveryAddress.address, zone_id: 999 } } })) },
  { id: "TC-DEL-005", fr: "FR-13", kind: "Negative", scenario: "The rider tries to pick up the order before it is made", expectedText: "409: The order is still being made.", expected: { status: 409, error: "The order is still being made." },
    run: async () => outcome(await rider.patch("/api/deliveries", { id: s.codDelivery, action: "pickup" })) },
  { id: "TC-DEL-006", fr: "FR-13", kind: "Positive", scenario: "The barista packs it; the rider picks it up", expectedText: "Delivery on the way", expected: "out",
    run: async () => { await barista.patch("/api/queue", { order_id: s.cod.orderId, action: "ready" }); await rider.patch("/api/deliveries", { id: s.codDelivery, action: "pickup" }); return (await one("SELECT status FROM deliveries WHERE delivery_id = $1", [s.codDelivery])).status; } },
  { id: "TC-DEL-007", fr: "FR-13", kind: "Negative", scenario: "The rider records ₱100.00 collected for a ₱150.00 order", expectedText: "400: Collect ₱150.00 for this order.", expected: { status: 400, error: "Collect ₱150.00 for this order." },
    run: async () => outcome(await rider.patch("/api/deliveries", { id: s.codDelivery, action: "delivered", collected: 100 })) },
  { id: "TC-DEL-008", fr: "FR-13", kind: "Positive", scenario: "The rider records ₱150.00 collected", expectedText: "Delivered, ₱150.00 with the rider", expected: { status: "delivered", collected: 150 },
    run: async () => { await rider.patch("/api/deliveries", { id: s.codDelivery, action: "delivered", collected: 150 }); const d = await one("SELECT status, cod_collected FROM deliveries WHERE delivery_id = $1", [s.codDelivery]); return { status: d.status, collected: Number(d.cod_collected) }; } },
  { id: "TC-DEL-009", fr: "FR-14", kind: "Negative", scenario: "The rider records their own hand-in", expectedText: "403: The cashier records the cash you hand in.", expected: { status: 403, error: "The cashier records the cash you hand in." },
    run: async () => outcome(await rider.patch("/api/deliveries", { id: s.codDelivery, action: "remit" })) },
  { id: "TC-DEL-010", fr: "FR-14", kind: "Positive", scenario: "The cashier receives the rider's ₱150.00", expectedText: "Expected drawer cash +₱150.00", expected: 150,
    run: async () => { const before = await expectedCash(); await cashier.patch("/api/deliveries", { id: s.codDelivery, action: "remit" }); return (await expectedCash()) - before; } },
  { id: "TC-DEL-011", fr: "FR-13", kind: "Negative", scenario: "Mark a second delivery failed without a reason", expectedText: "400: Say why it could not be delivered.", expected: { status: 400, error: "Say why it could not be delivered." },
    run: async () => {
      const r = await cashier.post("/api/checkout", { items: [item(AMERICANO)], payment_method: "cod", service_type: "delivery", delivery: deliveryAddress });
      s.failedOrder = r.json.data; s.failedDelivery = (await one("SELECT delivery_id FROM deliveries WHERE order_id = $1", [r.json.data?.orderId]))?.delivery_id;
      await barista.patch("/api/queue", { order_id: s.failedOrder.orderId, action: "ready" }); await rider.patch("/api/deliveries", { id: s.failedDelivery, action: "pickup" });
      return outcome(await rider.patch("/api/deliveries", { id: s.failedDelivery, action: "failed", reason: " " }));
    } },
  { id: "TC-DEL-012", fr: "FR-13", kind: "Positive", scenario: "Mark it failed: customer not home", expectedText: "Failed, with the reason saved", expected: { status: "failed", reason: "Customer not home" },
    run: async () => { await rider.patch("/api/deliveries", { id: s.failedDelivery, action: "failed", reason: "Customer not home" }); const d = await one("SELECT status, failure_reason FROM deliveries WHERE delivery_id = $1", [s.failedDelivery]); return { status: d.status, reason: d.failure_reason }; } },
  { id: "TC-DEL-013", fr: "FR-12", kind: "Negative", scenario: "Use cash on delivery for a dine-in order", expectedText: "400: Cash on delivery is only for delivery orders.", expected: { status: 400, error: "Cash on delivery is only for delivery orders." },
    run: async () => outcome(await cashier.post("/api/checkout", { items: [item(AMERICANO)], payment_method: "cod", service_type: "dine_in" })) },

  // ── Notifications (during the day) ──
  { id: "TC-NOT-001", fr: "FR-28", kind: "Positive", scenario: "Check the admin's notifications after the failed delivery", expectedText: "\"Order #N could not be delivered\" is listed", expected: true,
    run: async () => (await titles()).includes(`Order #${s.failedOrder.queueNumber} could not be delivered`) },
  { id: "TC-NOT-002", fr: "FR-29", kind: "Positive", scenario: "Sell an order and look at the Queue Screen", expectedText: "Its number is under Waiting", expected: true,
    run: async () => { const r = await cash([item(AMERICANO)], 100); s.screenOrder = r.json.data; return ((await new AppUser("queue").get("/api/queue")).json.data?.waiting ?? []).some((o: { queue_number: number }) => o.queue_number === r.json.data.queueNumber); } },
  { id: "TC-NOT-003", fr: "FR-29", kind: "Positive", scenario: "The barista marks the phone cart's order ready; look at the phone", expectedText: "Phone shows served (ready)", expected: "served",
    run: async () => { await barista.patch("/api/queue", { order_id: s.trackedOrder.orderId, action: "ready" }); return (await phone.get(`/api/orders/${s.trackToken}`)).json.data?.queue_status; } },
  { id: "TC-NOT-004", fr: "FR-29", kind: "Negative", scenario: "Look for the delivery orders on the Queue Screen", expectedText: "Delivery orders are not shown", expected: false,
    run: async () => { const q = (await new AppUser("queue").get("/api/queue")).json.data; return [...(q?.ready ?? []), ...(q?.waiting ?? [])].some((o: { queue_number: number }) => o.queue_number === s.cod.queueNumber || o.queue_number === s.failedOrder.queueNumber); } },

  // ── Inventory ──
  { id: "TC-INV-001", fr: "FR-15", kind: "Positive", scenario: "Add the inventory item Oat Milk (mL, ₱0.15/mL, 1,000 mL)", expectedText: "Created (201) and listed", expected: { status: 201, listed: true },
    run: async () => { const r = await admin.post("/api/inventory", { ingredient_category: "Dairy", item_name: "Oat Milk", unit_of_measure: "ml", unit_cost: 0.15, quantity: 1000 }); s.oatId = r.json.data?.inventory_id; return { status: r.status, listed: ((await admin.get("/api/inventory")).json.data as { item_name: string }[]).some((i) => i.item_name === "Oat Milk") }; } },
  { id: "TC-INV-002", fr: "FR-15", kind: "Negative", scenario: "Add an item with the unit \"cups\"", expectedText: "400: Category, item name, and a valid unit are required.", expected: { status: 400, error: "Category, item name, and a valid unit are required." },
    run: async () => outcome(await admin.post("/api/inventory", { ingredient_category: "Dairy", item_name: "Soy Milk", unit_of_measure: "cups", quantity: 10 })) },
  { id: "TC-INV-003", fr: "FR-15", kind: "Positive", scenario: "Restock Oat Milk by 500 mL", expectedText: "1,500 mL on hand", expected: 1500,
    run: async () => { await admin.patch("/api/inventory", { inventory_id: s.oatId, quantity_delta: 500 }); return stock("Oat Milk"); } },
  { id: "TC-INV-004", fr: "FR-15", kind: "Negative", scenario: "Restock Oat Milk by −5 mL", expectedText: "Refused with a message; stock unchanged", expected: { status: 400, refused: true, left: 1500 },
    run: async () => ({ ...refused(await admin.patch("/api/inventory", { inventory_id: s.oatId, quantity_delta: -5 })), left: await stock("Oat Milk") }) },
  { id: "TC-INV-005", fr: "FR-15", kind: "Positive", scenario: "Add the product Oat Latte (₱140.00, 18 g beans + 150 mL oat milk)", expectedText: "Shows on the Mobile Menu at ₱140.00", expected: 140,
    run: async () => {
      await admin.post("/api/products", { product_name: "Oat Latte", product_category: "Coffee", product_type: "recipe", station: "bar", price: 140, variants: [{ size: "16 oz", price: 140, temperature: "cold", ingredients: [{ inventory_id: 1, required_quantity: 18 }, { inventory_id: s.oatId, required_quantity: 150 }] }] });
      return ((await phone.get("/api/products")).json.data as { name: string; price: number }[]).find((p) => p.name === "Oat Latte")?.price;
    } },
  { id: "TC-INV-006", fr: "FR-15", kind: "Negative", scenario: "Add a product with no recipe", expectedText: "400: At least one variant with an ingredient is required.", expected: { status: 400, error: "At least one variant with an ingredient is required." },
    run: async () => outcome(await admin.post("/api/products", { product_name: "Mystery Drink", product_category: "Coffee", product_type: "recipe", station: "bar", price: 99, variants: [{ size: "12 oz", price: 99, temperature: "hot", ingredients: [] }] })) },
  { id: "TC-INV-007", fr: "FR-16", kind: "Positive", scenario: "Sell 2 Butter Croissants", expectedText: "Croissant stock −2", expected: -2,
    run: async () => { const before = await stock("Croissant"); await cash([item(CROISSANT, 2)], 150); return (await stock("Croissant")) - before; } },
  { id: "TC-INV-008", fr: "FR-16", kind: "Negative", scenario: "Sell more croissants than are left", expectedText: "Refused (400) with a message; stock unchanged", expected: { status: 400, refused: true, unchanged: true },
    run: async () => { const before = await stock("Croissant"); const r = await cash([item(CROISSANT, before + 1)], 10000); return { ...refused(r), unchanged: (await stock("Croissant")) === before }; } },
  { id: "TC-INV-009", fr: "FR-17", kind: "Positive", scenario: "Check alerts after the Spanish Latte sales (syrup at or below 100 mL)", expectedText: "\"Caramel Syrup is running low\" is listed", expected: true,
    run: async () => (await titles()).includes("Caramel Syrup is running low") },
  { id: "TC-INV-010", fr: "FR-17", kind: "Positive", scenario: "Sell the last croissants and check alerts", expectedText: "\"Croissant is out of stock\" is listed", expected: true,
    run: async () => { const left = await stock("Croissant"); await cash([item(CROISSANT, left)], left * 75); return (await titles()).includes("Croissant is out of stock"); } },
  { id: "TC-INV-011", fr: "FR-18", kind: "Positive", scenario: "The cashier reports 100 mL of Fresh Milk spilled", expectedText: "Report saved and shown to the admin as a waste report", expected: { saved: true, alerted: true },
    run: async () => { const r = await cashier.post("/api/write-off-requests", { action: "report", inventory_id: 2, quantity: 100, reason: "wasted" }); s.wasteRequest = r.json.data?.id ?? r.json.data?.requestId ?? r.json.data?.request_id; return { saved: r.status < 300, alerted: (await titles()).some((t) => t.startsWith("Waste report")) }; } },
  { id: "TC-INV-012", fr: "FR-18", kind: "Negative", scenario: "Report waste with reason \"other\" and no note", expectedText: "400: Say what happened.", expected: { status: 400, error: "Say what happened." },
    run: async () => outcome(await cashier.post("/api/write-off-requests", { action: "report", inventory_id: 2, quantity: 10, reason: "other" })) },
  { id: "TC-INV-013", fr: "FR-18", kind: "Negative", scenario: "The admin approves the report with a wrong password", expectedText: "403: That password is incorrect.", expected: { status: 403, error: "That password is incorrect." },
    run: async () => { s.wasteRequest = s.wasteRequest ?? (await one("SELECT request_id FROM write_off_requests ORDER BY request_id DESC LIMIT 1")).request_id; return outcome(await admin.post("/api/write-offs", { action: "approve", request_id: s.wasteRequest, password: "wrong-password" })); } },
  { id: "TC-INV-014", fr: "FR-18", kind: "Positive", scenario: "The admin approves the report", expectedText: "Fresh Milk −100 mL", expected: -100,
    run: async () => { const before = await stock("Fresh Milk"); await admin.post("/api/write-offs", { action: "approve", request_id: s.wasteRequest, password: PASSWORD }); return (await stock("Fresh Milk")) - before; } },
  { id: "TC-INV-015", fr: "FR-18", kind: "Negative", scenario: "Write off more Oat Milk than is on hand", expectedText: "Refused with a message; stock unchanged", expected: { status: 409, refused: true, left: 1500 },
    run: async () => ({ ...refused(await admin.post("/api/write-offs", { action: "write_off", inventory_id: s.oatId, quantity: 5000, reason: "expired", password: PASSWORD })), left: await stock("Oat Milk") }) },

  // ── Loyalty ──
  { id: "TC-LOY-001", fr: "FR-30", kind: "Positive", scenario: "The customer opens their account", expectedText: "Brew Stars campaign, 0 stars", expected: { campaign: "Brew Stars", balance: 0 },
    run: async () => { const l = (await member.get("/api/account")).json.data?.loyalty; return { campaign: l?.campaign?.name, balance: l?.balance }; } },
  { id: "TC-LOY-002", fr: "FR-30", kind: "Positive", scenario: "The cashier links the customer to a sale", expectedText: "1 star", expected: 1,
    run: async () => { await cash([item(AMERICANO)], 100, { customer_id: s.customerId }); return (await member.get("/api/account")).json.data?.loyalty?.balance; } },
  { id: "TC-LOY-003", fr: "FR-30", kind: "Negative", scenario: "Link the customer to 5 more sales the same day", expectedText: "Stops at 5 stars (daily limit)", expected: 5,
    run: async () => { for (let i = 0; i < 5; i++) await cash([item(AMERICANO)], 100, { customer_id: s.customerId }); return (await member.get("/api/account")).json.data?.loyalty?.balance; } },
  { id: "TC-LOY-004", fr: "FR-31", kind: "Negative", scenario: "Claim the Free Drink (10 stars) with 5 stars", expectedText: "409: You need 5 more stars for Free Drink.", expected: { status: 409, error: "You need 5 more stars for Free Drink." },
    run: async () => { s.rewardId = Number((await one("SELECT reward_id FROM loyalty_rewards WHERE name = 'Free Drink'")).reward_id); return outcome(await member.post("/api/claims", { rewardId: s.rewardId })); } },
  { id: "TC-LOY-005", fr: "FR-31", kind: "Negative", scenario: "The cashier adds a Free Drink line for an app customer without their claim", expectedText: "403: the customer must scan the Stars sign", expected: { status: 403, error: "This customer has the app. Ask them to scan the Stars sign at the counter and pick the reward on their phone." },
    run: async () => outcome(await cash([item(LATTE, 1, { reward_id: s.rewardId })], 0, { customer_id: s.customerId })) },
  { id: "TC-LOY-006", fr: "FR-31", kind: "Positive", scenario: "The admin adds 5 stars from the old paper card; the customer claims the Free Drink; the cashier accepts and checks it out", expectedText: "Spanish Latte free (₱0.00); 0 stars left", expected: { total: 0, balance: 0 },
    run: async () => {
      await admin.patch("/api/customers", { id: s.customerId, action: "adjust_stars", stars: 5, reason: "Stars from the paper card" });
      const claim = await member.post("/api/claims", { rewardId: s.rewardId });
      const claimId = claim.json.data?.id;
      await cashier.patch("/api/claims", { id: claimId, action: "accept" });
      const r = await cash([item(LATTE, 1, { reward_id: s.rewardId })], 0, { customer_id: s.customerId, claim_id: claimId });
      return { total: r.json.data?.total, balance: (await member.get("/api/account")).json.data?.loyalty?.balance };
    } },
  { id: "TC-LOY-007", fr: "FR-31", kind: "Negative", scenario: "Claim the Free Drink again with 0 stars", expectedText: "409: You need 10 more stars for Free Drink.", expected: { status: 409, error: "You need 10 more stars for Free Drink." },
    run: async () => outcome(await member.post("/api/claims", { rewardId: s.rewardId })) },

  // ── AI insights ──
  { id: "TC-AIA-001", fr: "FR-19", kind: "Negative", scenario: "Ask for insights for a period that ends before it starts", expectedText: "400: Choose a valid period.", expected: { status: 400, error: "Choose a valid period." },
    run: async () => outcome(await admin.post("/api/insights", { action: "generate", start: "2026-10-08", end: "2026-10-01" })) },
  { id: "TC-AIA-002", fr: "FR-19", kind: "Negative", scenario: "Ask for insights while they are switched off", expectedText: "409: AI insights are turned off…", expected: { status: 409, error: "AI insights are turned off. An admin can turn them on at the top of this page." },
    run: async () => { await admin.post("/api/insights", { action: "set_enabled", enabled: false }); const r = outcome(await admin.post("/api/insights", { action: "generate", start: today, end: today })); await admin.post("/api/insights", { action: "set_enabled", enabled: true }); return r; } },
  { id: "TC-AIA-003", fr: "FR-19", kind: "Positive", scenario: "Generate insights for today (real Claude API call)", expectedText: "201 with 3 to 5 cards", expected: { status: 201, cards: true },
    run: async () => { const r = await admin.post("/api/insights", { action: "generate", start: today, end: today }); const cards = r.json.data?.cards ?? []; return { status: r.status, cards: cards.length >= 3 && cards.length <= 5 }; } },
  { id: "TC-AIA-004", fr: "FR-19", kind: "Negative", scenario: "Ask again right away", expectedText: "429: Please wait 5 more minutes before asking again.", expected: { status: 429, error: "Please wait 5 more minutes before asking again." },
    run: async () => outcome(await admin.post("/api/insights", { action: "generate", start: today, end: today })) },
  { id: "TC-AIA-005", fr: "FR-19", kind: "Positive", scenario: "Open the Insights page", expectedText: "The saved insight is listed", expected: 1,
    run: async () => ((await admin.get("/api/insights")).json.data?.insights ?? []).length },
  { id: "TC-AIA-006", fr: "FR-19", kind: "Negative", scenario: "Ask for insights without signing in", expectedText: "401: Not authenticated.", expected: { status: 401, error: "Not authenticated." },
    run: async () => outcome(await new AppUser("admin").post("/api/insights", { action: "generate", start: today, end: today })) },

  // ── Finance and treasury ──
  { id: "TC-FIN-001", fr: "FR-20", kind: "Positive", scenario: "Open Finance for today", expectedText: "Net sales equal the total of today's completed orders", expected: true,
    run: async () => { const net = Number((await admin.get(`/api/finance?start=${today}&end=${today}`)).json.data?.current?.netSales); const sum = Number((await one("SELECT COALESCE(SUM(total_amount), 0) AS t FROM sales_orders WHERE status = 'completed'")).t); return Math.abs(net - sum) < 0.005; } },
  { id: "TC-FIN-002", fr: "FR-20", kind: "Negative", scenario: "Open Finance with the date 10/08/2026", expectedText: "400: Dates must use YYYY-MM-DD format.", expected: { status: 400, error: "Dates must use YYYY-MM-DD format." },
    run: async () => outcome(await admin.get("/api/finance?start=10/08/2026&end=10/08/2026")) },
  { id: "TC-FIN-003", fr: "FR-20", kind: "Negative", scenario: "Open Finance with the start after the end", expectedText: "400: The start date must not be after the end date.", expected: { status: 400, error: "The start date must not be after the end date." },
    run: async () => outcome(await admin.get("/api/finance?start=2026-10-09&end=2026-10-01")) },
  { id: "TC-FIN-004", fr: "FR-21", kind: "Positive", scenario: "Deposit ₱1,000.00 into the safe", expectedText: "Safe balance +₱1,000.00", expected: 1000,
    run: async () => { const bal = async () => Number((await one("SELECT balance FROM treasury_accounts WHERE kind = 'safe'")).balance); const before = await bal(); await admin.post("/api/treasury", { account: "safe", action: "deposit", amount: 1000, reason: "Owner deposit", password: PASSWORD }); return (await bal()) - before; } },
  { id: "TC-FIN-005", fr: "FR-21", kind: "Negative", scenario: "Withdraw more than the safe holds", expectedText: "409: The safe only has … It cannot go below ₱0.", expected: { status: 409, right: true },
    run: async () => { const r = await admin.post("/api/treasury", { account: "safe", action: "withdraw", amount: 9999999, reason: "Owner withdrawal", password: PASSWORD }); return { status: r.status, right: String(r.json?.error).startsWith("The safe only has") }; } },
  { id: "TC-FIN-006", fr: "FR-21", kind: "Negative", scenario: "Deposit with a wrong password", expectedText: "403: That password is incorrect.", expected: { status: 403, error: "That password is incorrect." },
    run: async () => outcome(await admin.post("/api/treasury", { account: "safe", action: "deposit", amount: 100, reason: "Owner deposit", password: "wrong-password" })) },
  { id: "TC-FIN-007", fr: "FR-21", kind: "Negative", scenario: "Deposit ₱0.00", expectedText: "400: Enter an amount more than ₱0.", expected: { status: 400, error: "Enter an amount more than ₱0." },
    run: async () => outcome(await admin.post("/api/treasury", { account: "safe", action: "deposit", amount: 0, reason: "Owner deposit", password: PASSWORD })) },
  { id: "TC-FIN-008", fr: "FR-22", kind: "Positive", scenario: "Record a ₱250.00 Supplies expense paid by the owner", expectedText: "Listed in today's expenses", expected: true,
    run: async () => { await admin.post("/api/expenses", { action: "add", amount: 250, category: "Supplies", description: "Paper cups", paid_from: "owner", spent_on: today, password: PASSWORD }); return JSON.stringify((await admin.get(`/api/expenses?start=${today}&end=${today}`)).json).includes("Paper cups"); } },
  { id: "TC-FIN-009", fr: "FR-22", kind: "Negative", scenario: "Record an expense of ₱0.00", expectedText: "400: Enter an amount more than ₱0.", expected: { status: 400, error: "Enter an amount more than ₱0." },
    run: async () => outcome(await admin.post("/api/expenses", { action: "add", amount: 0, category: "Supplies", description: "Nothing", paid_from: "owner", spent_on: today, password: PASSWORD })) },
  { id: "TC-FIN-010", fr: "FR-22", kind: "Negative", scenario: "Record an expense without a category", expectedText: "400: Choose a category.", expected: { status: 400, error: "Choose a category." },
    run: async () => outcome(await admin.post("/api/expenses", { action: "add", amount: 50, category: "", description: "Ice", paid_from: "owner", spent_on: today, password: PASSWORD })) },

  // ── Users ──
  { id: "TC-USR-001", fr: "FR-23", kind: "Positive", scenario: "Add the cashier Ben Santos", expectedText: "Created (201)", expected: 201,
    run: async () => { const r = await admin.post("/api/cashier-accounts", { fullName: "Ben Santos", email: "halosj07+ben@gmail.com", password: "Welcome#2026", role: "cashier", canVoidOrders: false }); s.benId = r.json.data?.id; return r.status; } },
  { id: "TC-USR-002", fr: "FR-23", kind: "Positive", scenario: "Ben signs in to the Staff Portal on his own phone", expectedText: "Password accepted; the emailed code is asked (new device)", expected: true,
    run: async () => Boolean((await new AppUser("cashier").post("/api/auth/login", { email: "halosj07+ben@gmail.com", password: "Welcome#2026" })).json.data?.twoFactor?.challenge) },
  { id: "TC-USR-003", fr: "FR-23", kind: "Negative", scenario: "Add another account with Ben's email", expectedText: "409: Another account already uses this email.", expected: { status: 409, error: "Another account already uses this email." },
    run: async () => outcome(await admin.post("/api/cashier-accounts", { fullName: "Ben Copy", email: "halosj07+ben@gmail.com", password: "Welcome#2026", role: "cashier" })) },
  { id: "TC-USR-004", fr: "FR-23", kind: "Negative", scenario: "Add an account with the role \"owner\"", expectedText: "400: Choose cashier, barista, kitchen staff or rider.", expected: { status: 400, error: "Choose cashier, barista, kitchen staff or rider." },
    run: async () => outcome(await admin.post("/api/cashier-accounts", { fullName: "Carla Reyes", email: "carla@test.brewhouze.local", password: "Welcome#2026", role: "owner" })) },
  { id: "TC-USR-005", fr: "FR-23", kind: "Negative", scenario: "Add an account with a 7-character password", expectedText: "400: Use at least 8 characters for the password.", expected: { status: 400, error: "Use at least 8 characters for the password." },
    run: async () => outcome(await admin.post("/api/cashier-accounts", { fullName: "Carla Reyes", email: "carla@test.brewhouze.local", password: "Short#1", role: "cashier" })) },
  { id: "TC-USR-006", fr: "FR-23", kind: "Positive", scenario: "Change Ben's name to Benjamin Santos", expectedText: "Saved", expected: "Benjamin Santos",
    run: async () => { await admin.patch("/api/cashier-accounts", { id: s.benId, action: "update_profile", fullName: "Benjamin Santos", email: "halosj07+ben@gmail.com" }); return (await one("SELECT full_name FROM admin_users WHERE admin_id = $1", [s.benId])).full_name; } },
  { id: "TC-USR-007", fr: "FR-23", kind: "Positive", scenario: "Make Ben a barista", expectedText: "Role barista, every cashier permission off", expected: { role: "barista", canVoidOrders: false, canOpenShift: false },
    run: async () => { const d = (await admin.patch("/api/cashier-accounts", { id: s.benId, action: "set_role", role: "barista" })).json.data; return { role: d?.role, canVoidOrders: d?.canVoidOrders, canOpenShift: d?.canOpenShift }; } },
  { id: "TC-USR-008", fr: "FR-23", kind: "Negative", scenario: "Deactivate Ben, then he signs in", expectedText: "401: Invalid cashier email or password.", expected: { status: 401, error: "Invalid cashier email or password." },
    run: async () => { await admin.patch("/api/cashier-accounts", { id: s.benId, action: "set_active", isActive: false }); return outcome(await new AppUser("cashier").post("/api/auth/login", { email: "halosj07+ben@gmail.com", password: "Welcome#2026" })); } },
  { id: "TC-USR-009", fr: "FR-24", kind: "Positive", scenario: "A customer signs up on the Mobile Menu", expectedText: "Created (201); the emailed code is asked", expected: { status: 201, code: true },
    run: async () => { const r = await new AppUser("mobile").post("/api/account/register", { username: "maria_test", fullName: "Maria Test", password: "Coffee#2026", email: "halosj07+maria@gmail.com", phone: "09181234567", consent: true }); return { status: r.status, code: Boolean(r.json.data?.twoFactor?.challenge) }; } },
  { id: "TC-USR-010", fr: "FR-24", kind: "Negative", scenario: "Sign up again with the same username", expectedText: "409: That username is taken. Try another one.", expected: { status: 409, error: "That username is taken. Try another one." },
    run: async () => outcome(await new AppUser("mobile").post("/api/account/register", { username: "maria_test", fullName: "Maria Two", password: "Coffee#2026", email: "halosj07+maria2@gmail.com", phone: "09181234568", consent: true })) },
  { id: "TC-USR-011", fr: "FR-24", kind: "Negative", scenario: "Sign up without agreeing to the privacy notice", expectedText: "400: Please agree to the privacy notice to make an account.", expected: { status: 400, error: "Please agree to the privacy notice to make an account." },
    run: async () => outcome(await new AppUser("mobile").post("/api/account/register", { username: "leo_test", fullName: "Leo Test", password: "Coffee#2026", email: "halosj07+leo@gmail.com", phone: "09191234567", consent: false })) },

  // ── Security ──
  { id: "TC-SEC-001", fr: "FR-25", kind: "Positive", scenario: `Sign in as ${OTP_EMAIL} on a new device`, expectedText: "Password accepted; a 6-digit code is emailed (address shown masked)", expected: { code: true, masked: true },
    run: async () => { s.otpDevice = new AppUser("cashier"); const t = (await s.otpDevice.post("/api/auth/login", { email: OTP_EMAIL, password: PASSWORD })).json.data?.twoFactor; s.challenge = t?.challenge; return { code: Boolean(t?.challenge), masked: String(t?.email).includes("•") }; } },
  { id: "TC-SEC-002", fr: "FR-25", kind: "Negative", scenario: "Type a wrong code", expectedText: "401: That code is not right. 4 tries left.", expected: { status: 401, error: "That code is not right. 4 tries left." },
    run: async () => outcome(await s.otpDevice.post("/api/auth/verify-code", { challenge: s.challenge, code: "000000" })) },
  { id: "TC-SEC-003", fr: "FR-26", kind: "Negative", scenario: "The barista tries to check out an order", expectedText: "403: Your account can't use this part of the staff app.", expected: { status: 403, error: "Your account can't use this part of the staff app." },
    run: async () => outcome(await barista.post("/api/checkout", { items: [item(AMERICANO)], payment_method: "cash", received_amount: 100, service_type: "dine_in" })) },
  { id: "TC-SEC-004", fr: "FR-26", kind: "Negative", scenario: "The rider opens the counter line", expectedText: "403: Your account can't use this part of the staff app.", expected: { status: 403, error: "Your account can't use this part of the staff app." },
    run: async () => outcome(await rider.get("/api/counter-carts")) },
  { id: "TC-SEC-005", fr: "FR-26", kind: "Negative", scenario: "Open the shift page without signing in", expectedText: "401: Not authenticated.", expected: { status: 401, error: "Not authenticated." },
    run: async () => outcome(await new AppUser("cashier").get("/api/shift")) },
  { id: "TC-SEC-006", fr: "FR-26", kind: "Negative", scenario: "The cashier signs in to the Admin Portal", expectedText: "Refused (403): the account has no admin access", expected: { status: 403, refused: true },
    run: async () => refused(await new AppUser("admin").post("/api/auth/login", { email: "cashier@test.brewhouze.local", password: PASSWORD })) },
  { id: "TC-SEC-007", fr: "FR-26", kind: "Negative", scenario: "Send a forged session cookie", expectedText: "401: Not authenticated.", expected: { status: 401, error: "Not authenticated." },
    run: async () => outcome(await new AppUser("cashier").request("GET", "/api/shift", undefined, { cookie: "brew_houze_cashier_session=eyJhZG1pbklkIjoxLCJyb2xlIjoiYWRtaW4ifQ.forged" })) },
  { id: "TC-SEC-008", fr: "FR-27", kind: "Positive", scenario: "The barista signs out, then opens the queue", expectedText: "401 after signing out", expected: 401,
    run: async () => { const b = await staff("cashier", "barista"); await b.post("/api/auth/logout"); return (await b.get("/api/queue")).status; } },

  // ── Closing ──
  { id: "TC-POS-025", fr: "FR-09", kind: "Negative", scenario: "Close the shift while a failed delivery is not yet voided", expectedText: "409: Finish the deliveries before closing…", expected: { status: 409, right: true },
    run: async () => { const shift = (await cashier.get("/api/shift")).json.data; s.shiftId = shift?.shiftId; const r = await cashier.post("/api/shift", { action: "close", shift_id: s.shiftId, counted_cash: 0, password: PASSWORD }); return { status: r.status, right: String(r.json?.error).startsWith("Finish the deliveries before closing") }; } },
  { id: "TC-POS-026", fr: "FR-09", kind: "Positive", scenario: "Void the failed delivery, then close the shift counting ₱30.00 less than expected", expectedText: "Shift closed ₱30.00 short; the admin is alerted", expected: { difference: -30, alerted: true },
    run: async () => {
      await cashier.post("/api/order-actions", { order_id: s.failedOrder.orderId, action: "void", password: PASSWORD, return_method: "none", made: false });
      const exp = await expectedCash();
      const r = await cashier.post("/api/shift", { action: "close", shift_id: s.shiftId, counted_cash: exp - 30, password: PASSWORD });
      return { difference: Number(r.json.data?.cashDifference), alerted: (await titles()).includes(`Shift #${s.shiftId} closed ₱30.00 short`) };
    } },
  { id: "TC-QRO-019", fr: "FR-03", kind: "Negative", scenario: "Pay a phone order after the store has closed", expectedText: "Refused with a message", expected: { status: 400, refused: true },
    run: async () => refused(await phone.post("/api/payments", { items: [item(AMERICANO)], service_type: "take_out" })) },
]);
