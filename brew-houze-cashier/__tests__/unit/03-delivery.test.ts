import { vi } from "vitest";
import { unitCases } from "./harness";
import { setDb } from "./fake-db";
import { latte, order, orderDb } from "./order-fixture";
import { deliveryFeeFor, withinDeliveryHours, type DeliveryPlan } from "@/lib/delivery";
import { PATCH as deliveryAction } from "@/app/api/deliveries/route";

const h = vi.hoisted(() => ({ session: null as Record<string, unknown> | null }));
vi.mock("@/lib/db", () => import("./fake-db").then((m) => m.poolModule));
vi.mock("@/lib/realtime", () => ({ signalChange: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => undefined }) }));
vi.mock("@/lib/sessions", async (original) => ({ ...(await original<object>()), getSession: async () => h.session }));

// Objective 3. Delivery: hours, zone fees, cash on delivery (COD) and failed deliveries.
// Manila is UTC+8.
const manila = (hhmm: string) => new Date(`2026-10-08T${hhmm}:00+08:00`);
const rider = { adminId: 31, role: "rider" };
const cashier = { adminId: 2, role: "cashier" };

// One delivery (#55) for order #900 (queue #12) of customer 400, as the PATCH route reads it.
function deliveryDb(row: Record<string, unknown>, options: { shiftOpen?: boolean } = {}) {
  return setDb([
    [/FROM deliveries d JOIN sales_orders so ON so.order_id = d.order_id WHERE d.delivery_id = \$1 FOR UPDATE/, [{
      status: "out", payment: "cod", cod_amount: "350.00", cod_collected: null, cod_remitted_at: null, rider_admin_id: 31, customer_id: 400, order_status: "completed", queue_number: 12, ...row,
    }]],
    [/^SELECT shift_id FROM shifts WHERE closed_at IS NULL FOR SHARE/, options.shiftOpen === false ? [] : [{ shift_id: 7 }]],
  ]);
}
async function act(session: Record<string, unknown>, body: Record<string, unknown>) {
  h.session = session;
  const response = await deliveryAction(new Request("http://staff.test/api/deliveries", { method: "PATCH", body: JSON.stringify({ id: 55, ...body }) }));
  return { status: response.status, body: await response.json() };
}
const zone: DeliveryPlan = { customerId: 400, addressId: 1, recipientName: "Ana Cruz", phone: "09171234567", street: "12 Rizal St.", landmark: null, riderNotes: null,
  zoneId: 3, zoneName: "Poblacion", zoneFee: 50, zoneMinOrder: 200, freeAbove: 500, payment: "cod", codMaxAmount: 1500 } as DeliveryPlan;

unitCases("cashier", "Objective 3 - Delivery", [
  { id: "UT-DEL-01", fn: "withinDeliveryHours", kind: "Positive", title: "deliveries are taken within the delivery hours", input: "Hours 10:00–22:00, now 2:00 PM",
    expected: true, run: () => withinDeliveryHours({ start: "10:00", end: "22:00" }, manila("14:00")) },
  { id: "UT-DEL-02", fn: "withinDeliveryHours", kind: "Boundary", title: "the first minute of the delivery hours is open", input: "Hours 10:00–22:00, now 10:00 AM",
    expected: true, run: () => withinDeliveryHours({ start: "10:00", end: "22:00" }, manila("10:00")) },
  { id: "UT-DEL-03", fn: "withinDeliveryHours", kind: "Negative", title: "no deliveries after the delivery hours", input: "Hours 10:00–22:00, now 11:00 PM",
    expected: false, run: () => withinDeliveryHours({ start: "10:00", end: "22:00" }, manila("23:00")) },
  { id: "UT-DEL-04", fn: "withinDeliveryHours", kind: "Boundary", title: "hours that run past midnight", input: "Hours 20:00–02:00, now 1:00 AM",
    expected: true, run: () => withinDeliveryHours({ start: "20:00", end: "02:00" }, manila("01:00")) },
  { id: "UT-DEL-05", fn: "deliveryFeeFor", kind: "Positive", title: "the zone's fee is charged below the free-delivery amount", input: "Zone fee ₱50.00, free from ₱500.00, items ₱499.00",
    expected: 50, expectedText: "₱50.00", run: () => deliveryFeeFor({ zoneFee: 50, freeAbove: 500 }, 499) },
  { id: "UT-DEL-06", fn: "deliveryFeeFor", kind: "Boundary", title: "delivery is free from exactly the free-delivery amount", input: "Zone fee ₱50.00, free from ₱500.00, items ₱500.00",
    expected: 0, expectedText: "₱0.00 (free)", run: () => deliveryFeeFor({ zoneFee: 50, freeAbove: 500 }, 500) },
  { id: "UT-DEL-07", fn: "placeOrder", kind: "Positive", title: "the delivery fee is added to the order total", input: "2 Spanish Latte (₱240.00) to Poblacion (fee ₱50.00)",
    expected: { deliveryFee: 50, total: 290 }, run: async () => { const placed = await order(orderDb().db, { serviceType: "delivery", delivery: zone, paymentMethod: "cod", items: [latte({ quantity: 2 })] }); return { deliveryFee: placed.deliveryFee, total: placed.total }; } },
  { id: "UT-DEL-08", fn: "placeOrder", kind: "Negative", title: "an order below the zone's minimum is refused", input: "1 Spanish Latte (₱120.00), Poblacion minimum ₱200.00",
    expected: { error: "Delivery to Poblacion starts at ₱200.00 of items. Add a little more to your order." }, run: () => order(orderDb().db, { serviceType: "delivery", delivery: zone, paymentMethod: "cod" }) },
  { id: "UT-DEL-09", fn: "placeOrder", kind: "Negative", title: "cash on delivery is refused for an order that is not delivered", input: "Dine-in order paid \"cod\"",
    expected: { error: "Cash on delivery is only for delivery orders." }, run: () => order(orderDb().db, { paymentMethod: "cod" }) },
  // Cash on delivery
  { id: "UT-DEL-10", fn: "PATCH /api/deliveries (delivered)", kind: "Negative", title: "the rider must collect the full COD amount", input: "COD ₱350.00, rider collected ₱300.00",
    expected: { status: 400, body: { error: "Collect ₱350.00 for this order." } }, run: () => { deliveryDb({}); return act(rider, { action: "delivered", collected: 300 }); } },
  { id: "UT-DEL-11", fn: "PATCH /api/deliveries (delivered)", kind: "Positive", title: "delivered with the COD collected: the cash is recorded with the rider", input: "COD ₱350.00, rider collected ₱350.00",
    expected: { status: 200, collected: 350 }, run: async () => { const db = deliveryDb({}); const result = await act(rider, { action: "delivered", collected: 350 }); return { status: result.status, collected: db.ran(/^UPDATE deliveries SET status = 'delivered'/)[0]?.params[1] }; } },
  { id: "UT-DEL-12", fn: "PATCH /api/deliveries (remit)", kind: "Positive", title: "the cashier receives the rider's COD cash into the open shift's drawer", input: "Delivered, ₱350.00 collected, shift #7 open",
    expected: { status: 200, receivedBy: 2, shift: 7 }, run: async () => { const db = deliveryDb({ status: "delivered", cod_collected: "350.00" }); const result = await act(cashier, { action: "remit" }); const params = db.ran(/^UPDATE deliveries SET cod_remitted_at/)[0]?.params ?? []; return { status: result.status, receivedBy: params[1], shift: params[2] }; } },
  { id: "UT-DEL-13", fn: "PATCH /api/deliveries (remit)", kind: "Negative", title: "a rider cannot record their own hand-in", input: "Rider sends \"remit\"",
    expected: { status: 403, body: { error: "The cashier records the cash you hand in." } }, run: () => { deliveryDb({ status: "delivered", cod_collected: "350.00" }); return act(rider, { action: "remit" }); } },
  { id: "UT-DEL-14", fn: "PATCH /api/deliveries (remit)", kind: "Negative", title: "the same COD cash cannot be received twice", input: "Cash already received",
    expected: { status: 409, body: { error: "This cash was already received." } }, run: () => { deliveryDb({ status: "delivered", cod_collected: "350.00", cod_remitted_at: "2026-10-08T15:00:00Z" }); return act(cashier, { action: "remit" }); } },
  { id: "UT-DEL-15", fn: "PATCH /api/deliveries (remit)", kind: "Negative", title: "COD cash needs an open shift to go into", input: "No shift open",
    expected: { status: 409, body: { error: "Open a shift first: the cash goes into its drawer." } }, run: () => { deliveryDb({ status: "delivered", cod_collected: "350.00" }, { shiftOpen: false }); return act(cashier, { action: "remit" }); } },
  // Failed deliveries
  { id: "UT-DEL-16", fn: "PATCH /api/deliveries (failed)", kind: "Negative", title: "a failed delivery needs a reason", input: "Failed, reason \"   \"",
    expected: { status: 400, body: { error: "Say why it could not be delivered." } }, run: () => { deliveryDb({}); return act(rider, { action: "failed", reason: "   " }); } },
  { id: "UT-DEL-17", fn: "PATCH /api/deliveries (failed)", kind: "Positive", title: "a failed COD delivery keeps its reason and blocks COD for that customer", input: "Failed, reason \"Customer not home\"",
    expected: { status: 200, reason: "Customer not home", blocked: [400, "Cash on delivery order #12 was not delivered: Customer not home"] },
    run: async () => { const db = deliveryDb({}); const result = await act(rider, { action: "failed", reason: " Customer not home " }); return { status: result.status, reason: db.ran(/^UPDATE deliveries SET status = 'failed'/)[0]?.params[1], blocked: db.ran(/^UPDATE customers SET cod_blocked = TRUE/)[0]?.params }; } },
  { id: "UT-DEL-18", fn: "PATCH /api/deliveries (failed)", kind: "Negative", title: "a delivered order cannot be marked failed", input: "Delivery already delivered",
    expected: { status: 409, body: { error: "Only a packed or outgoing delivery can be marked failed." } }, run: () => { deliveryDb({ status: "delivered" }); return act(rider, { action: "failed", reason: "Wrong address" }); } },
  { id: "UT-DEL-19", fn: "PATCH /api/deliveries", kind: "Negative", title: "a rider cannot act on another rider's delivery", input: "Rider #32 on a delivery rider #31 took",
    expected: { status: 403, body: { error: "Another rider has this delivery." } }, run: () => { deliveryDb({}); return act({ adminId: 32, role: "rider" }, { action: "delivered", collected: 350 }); } },
]);
