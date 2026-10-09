import { createHmac } from "node:crypto";
import { beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import puppeteer from "puppeteer-core";
import { integrationCases } from "./support/harness";
import { loadTestEnv } from "./support/env";
import { OTP_EMAIL, PASSWORD, testPool } from "./support/db";
import { AppUser, customer, staff } from "./support/http";
import { escposReceipt, rawbtIntentUrl, type ReceiptData } from "@/lib/receipt";

// Level 2: the hand-offs between the modules of Brew Houze, on the running apps (production builds)
// with a real PostgreSQL test database, the PayMongo sandbox, Gmail SMTP, Supabase Realtime and the
// Claude API. No mocks.
const env = loadTestEnv();
const db = testPool(env);
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

const LATTE = 1, AMERICANO = 2, EXTRA_SHOT = 1;
const stock = async (name: string) => Number((await db.query("SELECT quantity FROM inventory WHERE item_name = $1", [name])).rows[0].quantity);
const one = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0];

// Live updates: listens on the Supabase Realtime channel the apps signal on.
function listen() {
  const received: string[] = [];
  const client = createClient(String(env.NEXT_PUBLIC_SUPABASE_URL), String(env.NEXT_PUBLIC_SUPABASE_ANON_KEY));
  const channel = client.channel("brew-houze-live").on("broadcast", { event: "changed" }, (message) => received.push(String(message.payload?.scope)));
  const ready = new Promise<void>((resolve, reject) => channel.subscribe((status) => (status === "SUBSCRIBED" ? resolve() : status === "CHANNEL_ERROR" || status === "TIMED_OUT" ? reject(new Error(status)) : undefined)));
  const waitFor = async (scope: string, seconds = 15) => {
    const until = Date.now() + seconds * 1000;
    while (Date.now() < until) { if (received.includes(scope)) return true; await new Promise((r) => setTimeout(r, 200)); }
    return false;
  };
  return { ready, received, waitFor, close: () => client.removeChannel(channel) };
}

let cashier: AppUser, barista: AppUser, rider: AppUser, admin: AppUser;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON read back from the apps
const state: Record<string, any> = {};

beforeAll(async () => {
  [cashier, barista, rider, admin] = await Promise.all([staff("cashier", "cashier"), staff("cashier", "barista"), staff("cashier", "rider"), staff("admin", "admin")]);
  // Before anything is sold: the low-stock alerts, and the shift the day's sales go into.
  state.alertsBefore = ((await admin.get("/api/notifications")).json.data as { title: string }[]).map((n) => n.title);
  const opened = await cashier.post("/api/shift", { action: "open", starting_cash: 1000, password: PASSWORD });
  if (opened.status !== 201) throw new Error(`Could not open the shift: ${opened.text}`);
});

integrationCases([
  {
    id: "IT-01", modules: "QR Ordering (Mobile Menu) → Staff Portal POS and Queue",
    scenario: "A customer sends a cart from the QR menu to the counter; the counter is signalled live, the cashier checks it out, and the order reaches the barista queue, the Queue Screen and the customer's phone",
    expectedText: "Realtime \"line\" and \"queue\" signals received; cart listed at the POS (2 × Spanish Latte + Extra Shot, ₱290.00); queue #1 waiting on the barista queue, the Queue Screen and the customer's phone",
    expected: { lineSignal: true, cartAtPos: { listed: true, lines: 1 }, checkoutTotal: 290, queueSignal: true, barista: [1], queueScreen: [1], phone: { queue_number: 1, queue_status: "waiting" } },
    run: async () => {
      const live = listen(); await live.ready;
      const phone = new AppUser("mobile");
      const sent = await phone.post("/api/counter-carts", { items: [{ product_variant_id: LATTE, quantity: 2, addition_ids: [EXTRA_SHOT] }], service_type: "dine_in" });
      const lineSignal = await live.waitFor("line");
      const carts = (await cashier.get("/api/counter-carts")).json.data as { id: number; code: string; items: unknown[] }[];
      const cart = carts.find((c) => c.code === sent.json.data?.code);
      const checkout = await cashier.post("/api/checkout", { items: [{ product_variant_id: LATTE, quantity: 2, addition_ids: [EXTRA_SHOT] }], payment_method: "cash", received_amount: 300, service_type: "dine_in", counter_cart_id: cart?.id });
      state.cartOrder = checkout.json.data; state.cartToken = sent.json.data?.token;
      const queueSignal = await live.waitFor("queue");
      const baristaQueue = (await barista.get("/api/queue")).json;
      const screen = (await new AppUser("queue").get("/api/queue")).json.data;
      const tracked = (await phone.get(`/api/orders/${state.cartToken}`)).json.data;
      await live.close();
      return {
        lineSignal, cartAtPos: { listed: Boolean(cart), lines: cart?.items.length ?? 0 }, checkoutTotal: checkout.json.data?.total, queueSignal,
        barista: (baristaQueue.data?.waiting ?? []).map((o: { queue_number: number }) => o.queue_number),
        queueScreen: (screen?.waiting ?? []).map((o: { queue_number: number }) => o.queue_number),
        phone: tracked && { queue_number: tracked.queue_number, queue_status: tracked.queue_status },
      };
    },
  },
  {
    id: "IT-02", modules: "Mobile Menu / POS → PayMongo Sandbox → Orders",
    scenario: "A mobile GCash payment creates a real PayMongo sandbox payment; after the test payment is authorized on PayMongo's page, the order is created and paid",
    expectedText: "PayMongo returns its GCash page; after \"Authorize Test Payment\" the checkout is completed and its order (₱100.00, PayMongo GCash) gets a queue number",
    expected: { paymongoPage: "secure-authentication.paymongo.com", status: "completed", order: { total: 100, provider: "paymongo_gcash", queued: true } },
    run: async () => {
      const phone = new AppUser("mobile");
      const started = await phone.post("/api/payments", { items: [{ product_variant_id: AMERICANO, quantity: 1 }], service_type: "take_out" });
      const redirect = String(started.json.data?.redirectUrl ?? "");
      state.paymentToken = started.json.data?.token;
      const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
      try {
        const page = await browser.newPage();
        await page.goto(redirect, { waitUntil: "networkidle2" });
        const [button] = await page.$$("xpath/.//button[contains(., 'Authorize Test Payment')]");
        await Promise.all([page.waitForNavigation({ waitUntil: "load", timeout: 30_000 }).catch(() => undefined), button.click()]);
      } finally { await browser.close(); }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON read back from the apps
      let view: Record<string, any> = {};
      const settled = () => ["completed", "failed", "expired", "cancelled"].includes(String(view.status));
      for (let i = 0; i < 30 && !settled(); i++) { view = (await phone.get(`/api/payments/${state.paymentToken}`)).json.data ?? {}; if (!settled()) await new Promise((r) => setTimeout(r, 2000)); }
      const order = await one("SELECT so.order_id, so.total_amount, so.payment_provider, so.queue_number FROM sales_orders so JOIN payment_checkouts pc ON pc.order_id = so.order_id WHERE pc.public_token::text = $1", [state.paymentToken]);
      state.paymongoOrder = order;
      return { paymongoPage: redirect ? new URL(redirect).host : null, status: view.status, order: order && { total: Number(order.total_amount), provider: order.payment_provider, queued: Number(order.queue_number) > 0 } };
    },
  },
  {
    id: "IT-03", modules: "PayMongo Webhook → Orders",
    scenario: "PayMongo's payment.paid event for the same payment arrives at the webhook: a forged signature is refused; a correctly signed event is accepted and does not create the order twice",
    expectedText: "Forged signature → 401; signed event → 200 received; still exactly one order for the payment",
    expected: { forged: 401, signed: 200, ordersForPayment: 1 },
    run: async () => {
      const intent = (await one("SELECT intent_id FROM payment_checkouts WHERE public_token::text = $1", [state.paymentToken])).intent_id;
      const body = JSON.stringify({ data: { attributes: { type: "payment.paid", data: { id: "pay_integration_test", attributes: { payment_intent_id: intent, fee: 250 } } } } });
      const t = Math.floor(Date.now() / 1000);
      const sign = (secret: string) => `t=${t},te=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")},li=`;
      const hook = new AppUser("mobile");
      const forged = await hook.request("POST", "/api/paymongo/webhook", body, { "paymongo-signature": sign("not-the-secret") });
      const signed = await hook.request("POST", "/api/paymongo/webhook", body, { "paymongo-signature": sign(String(env.PAYMONGO_WEBHOOK_SECRET)) });
      const count = Number((await one("SELECT COUNT(*)::int AS n FROM sales_orders so JOIN payment_checkouts pc ON pc.order_id = so.order_id WHERE pc.public_token::text = $1", [state.paymentToken])).n);
      return { forged: forged.status, signed: signed.status, ordersForPayment: count };
    },
  },
  {
    id: "IT-04", modules: "Staff Portal POS → RawBT Android print bridge",
    scenario: "A completed cash sale's receipt, read back from the database, is turned into ESC/POS commands and the rawbt: Android intent; the printed totals match the saved order",
    expectedText: "Slip lines: TOTAL P 145.00, Cash received 200.00, Change 55.00 (58 mm); intent URL carries the exact command bytes",
    expected: { total: "TOTAL                   P 145.00", received: "Cash received             200.00", change: "Change                     55.00", intentMatches: true },
    run: async () => {
      const sale = await cashier.post("/api/checkout", { items: [{ product_variant_id: LATTE, quantity: 1, addition_ids: [EXTRA_SHOT] }], payment_method: "cash", received_amount: 200, service_type: "take_out" });
      state.saleOrder = sale.json.data;
      const receipt = (await cashier.get(`/api/receipts/${sale.json.data.orderId}`)).json.data as ReceiptData;
      const bytes = escposReceipt(receipt, false, 58);
      let text = ""; for (let i = 0; i < bytes.length; i++) { const b = bytes[i]; if (b === 0x1B || b === 0x1D) { const c = bytes[i + 1]; i += c === 0x40 ? 1 : c === 0x56 ? 3 : 2; continue; } text += b === 0x0A ? "\n" : String.fromCharCode(b); }
      const lines = text.split("\n");
      const url = rawbtIntentUrl(bytes);
      const data = Buffer.from(url.slice("intent:base64,".length, url.indexOf("#Intent")), "base64");
      return { total: lines.find((l) => l.startsWith("TOTAL")), received: lines.find((l) => l.startsWith("Cash received")), change: lines.find((l) => l.startsWith("Change")), intentMatches: data.equals(Buffer.from(bytes)) && url.includes("scheme=rawbt") };
    },
  },
  {
    id: "IT-05", modules: "Staff Portal POS → Inventory",
    scenario: "The sale of 1 Spanish Latte with an Extra Shot takes its recipe off the stock in PostgreSQL and logs each change against the order",
    expectedText: "Beans −36 g (18 + 18 for the shot), milk −150 ml, syrup −15 ml; 3 stock history entries for the order",
    expected: { beans: -36, milk: -150, syrup: -15, logEntries: 3 },
    run: async () => {
      const log = (await db.query("SELECT item_name, quantity_delta FROM inventory_log WHERE order_id = $1 AND change_type = 'order_deduction'", [state.saleOrder.orderId])).rows;
      const delta = (name: string) => Number(log.find((row) => row.item_name === name)?.quantity_delta ?? 0);
      state.stockAfterSale = { beans: await stock("Espresso Beans"), milk: await stock("Fresh Milk"), syrup: await stock("Caramel Syrup") };
      return { beans: delta("Espresso Beans"), milk: delta("Fresh Milk"), syrup: delta("Caramel Syrup"), logEntries: log.length };
    },
  },
  {
    id: "IT-06", modules: "Staff Portal POS → Inventory (reverse flow)",
    scenario: "Voiding that sale before it was made (password confirmed) returns its ingredients to the stock and records who voided it",
    expectedText: "Order voided; beans +36, milk +150, syrup +15 back in stock; voided by the cashier, with stock history entries",
    expected: { status: "voided", restored: { beans: 36, milk: 150, syrup: 15 }, voidedBy: "Test Cashier", restoreEntries: 3 },
    run: async () => {
      const voided = await cashier.post("/api/order-actions", { order_id: state.saleOrder.orderId, action: "void", password: PASSWORD, return_method: "cash", made: false });
      if (voided.status !== 200) return { error: voided.text };
      const order = await one("SELECT so.status, au.full_name FROM sales_orders so LEFT JOIN admin_users au ON au.admin_id = so.reversed_by_admin_id WHERE so.order_id = $1", [state.saleOrder.orderId]);
      const entries = Number((await one("SELECT COUNT(*)::int AS n FROM inventory_log WHERE order_id = $1 AND change_type <> 'order_deduction'", [state.saleOrder.orderId])).n);
      return {
        status: order.status, voidedBy: order.full_name, restoreEntries: entries,
        restored: { beans: (await stock("Espresso Beans")) - state.stockAfterSale.beans, milk: (await stock("Fresh Milk")) - state.stockAfterSale.milk, syrup: (await stock("Caramel Syrup")) - state.stockAfterSale.syrup },
      };
    },
  },
  {
    id: "IT-07", modules: "Inventory → Admin Dashboard alerts",
    scenario: "Caramel Syrup started at 115 ml (alert at 100 ml); after the day's sales it is at or below its alert level, and the admin's notifications show it",
    expectedText: "No syrup alert before any sale; \"Caramel Syrup is running low\" after",
    expected: { before: false, syrupAtOrBelow100: true, after: true },
    run: async () => {
      const after = ((await admin.get("/api/notifications")).json.data as { title: string }[]).map((n) => n.title);
      return { before: state.alertsBefore.includes("Caramel Syrup is running low"), syrupAtOrBelow100: (await stock("Caramel Syrup")) <= 100, after: after.includes("Caramel Syrup is running low") };
    },
  },
  {
    id: "IT-08", modules: "Staff Portal POS / Rider COD → Shift drawer and Finance reports",
    scenario: "A cash sale and a rider's cash-on-delivery hand-in update the open shift's expected cash and the admin's finance totals at once (no stale cached totals)",
    expectedText: "Expected cash +₱100.00 after the cash sale and +₱150.00 after the COD hand-in; finance net sales +₱250.00 for the two orders",
    expected: { afterSale: 100, afterCodHandIn: 150, financeIncrease: 250 },
    run: async () => {
      const expected = async () => Number((await cashier.get("/api/shift")).json.data?.expectedCash);
      const netSales = async () => Number((await admin.get(`/api/finance?start=${today}&end=${today}`)).json.data?.current?.netSales);
      const [cash0, sales0] = [await expected(), await netSales()];
      await cashier.post("/api/checkout", { items: [{ product_variant_id: AMERICANO, quantity: 1 }], payment_method: "cash", received_amount: 100, service_type: "dine_in" });
      const cash1 = await expected();
      const cod = await cashier.post("/api/checkout", { items: [{ product_variant_id: AMERICANO, quantity: 1 }], payment_method: "cod", service_type: "delivery",
        delivery: { address: { recipient_name: "Ana Test", phone: "09171234567", zone_id: 1, street: "12 Rizal St." } } });
      if (cod.status !== 200) return { error: `COD checkout: ${cod.text}` };
      const orderId = cod.json.data.orderId;
      await barista.patch("/api/queue", { order_id: orderId, action: "ready" });
      const delivery = await one("SELECT delivery_id FROM deliveries WHERE order_id = $1", [orderId]);
      await rider.patch("/api/deliveries", { id: delivery.delivery_id, action: "pickup" });
      await rider.patch("/api/deliveries", { id: delivery.delivery_id, action: "delivered", collected: 150 });
      const beforeHandIn = await expected();
      await cashier.patch("/api/deliveries", { id: delivery.delivery_id, action: "remit" });
      const cash2 = await expected();
      const sales1 = await netSales();
      return { afterSale: cash1 - cash0, afterCodHandIn: cash2 - beforeHandIn, financeIncrease: Math.round((sales1 - sales0) * 100) / 100 };
    },
  },
  {
    id: "IT-09", modules: "Queue / Order status → Customer notification and Loyalty",
    scenario: "A signed-in customer's counter order earns 1 star in PostgreSQL; when the barista marks it ready, a live \"queue\" signal goes out and the customer's phone shows it ready; a 6th order the same day earns nothing (5-star daily limit)",
    expectedText: "Star balance 1 after the first order; queue signal received; phone shows served; balance stays 5 after 6 orders",
    expected: { starsAfterFirst: 1, readySignal: true, phoneStatus: "served", starsAfterSix: 5 },
    run: async () => {
      const customerId = Number((await one("SELECT customer_id FROM customers WHERE username = 'ana_test'")).customer_id);
      const balance = async () => Number((await one("SELECT COALESCE(SUM(stars), 0)::int AS n FROM loyalty_star_entries WHERE customer_id = $1", [customerId])).n);
      const phone = await customer();
      const sent = await phone.post("/api/counter-carts", { items: [{ product_variant_id: AMERICANO, quantity: 1 }], service_type: "dine_in" });
      const cart = ((await cashier.get("/api/counter-carts")).json.data as { id: number; code: string }[]).find((c) => c.code === sent.json.data?.code);
      const first = await cashier.post("/api/checkout", { items: [{ product_variant_id: AMERICANO, quantity: 1 }], payment_method: "cash", received_amount: 100, service_type: "dine_in", counter_cart_id: cart?.id, customer_id: customerId });
      const starsAfterFirst = await balance();
      const live = listen(); await live.ready;
      await barista.patch("/api/queue", { order_id: first.json.data.orderId, action: "ready" });
      const readySignal = await live.waitFor("queue");
      await live.close();
      const phoneStatus = (await phone.get(`/api/orders/${sent.json.data.token}`)).json.data?.queue_status;
      for (let i = 0; i < 5; i++) await cashier.post("/api/checkout", { items: [{ product_variant_id: AMERICANO, quantity: 1 }], payment_method: "cash", received_amount: 100, service_type: "dine_in", customer_id: customerId });
      return { starsAfterFirst, readySignal, phoneStatus, starsAfterSix: await balance() };
    },
  },
  {
    id: "IT-10", modules: "Sales and Inventory DB → Anthropic Claude API",
    scenario: "The admin asks for AI insights for today: the day's real figures from PostgreSQL go to the Claude API, and the structured cards that come back are saved",
    expectedText: "HTTP 201; 3 to 5 cards, each with a tone, title and message; the saved facts include today's net sales",
    expected: { status: 201, cards: true, savedFactsHaveSales: true },
    run: async () => {
      const result = await admin.post("/api/insights", { action: "generate", start: today, end: today });
      if (result.status !== 201) return { status: result.status, error: result.json?.error };
      const cards = result.json.data?.cards as { tone: string; title: string; message: string }[];
      const saved = await one("SELECT facts FROM ai_insights ORDER BY insight_id DESC LIMIT 1");
      return { status: result.status, cards: cards.length >= 3 && cards.length <= 5 && cards.every((c) => c.tone && c.title && c.message), savedFactsHaveSales: Number(saved.facts?.money?.this_period?.net_sales) > 0 };
    },
  },
  {
    id: "IT-11", modules: "Security / Sign-in → Gmail SMTP and audit records",
    scenario: `Signing in on a new device sends a real 6-digit code through the Gmail SMTP account to ${OTP_EMAIL}; a wrong code is refused and counted; a trusted sign-in and the void above are on record (who and when)`,
    expectedText: "Password step → code required (email masked) and the email accepted by Gmail; wrong code → 401 with 4 tries left; the sign-in session, attendance and the void's actor are recorded",
    expected: { codeRequired: true, emailMasked: true, challengeSaved: 1, wrongCode: { status: 401, error: "That code is not right. 4 tries left." }, sessionRecorded: true, attendanceRecorded: true, voidActorRecorded: true },
    run: async () => {
      const device = new AppUser("cashier");
      const login = await device.post("/api/auth/login", { email: OTP_EMAIL, password: PASSWORD });
      const challenge = login.json.data?.twoFactor;
      const saved = Number((await one("SELECT COUNT(*)::int AS n FROM login_challenges lc JOIN admin_users au ON au.admin_id = lc.account_id WHERE lc.account_kind = 'staff' AND au.email = $1", [OTP_EMAIL])).n);
      const wrong = await device.post("/api/auth/verify-code", { challenge: challenge?.challenge, code: "000000" });
      const cashierId = Number((await one("SELECT admin_id FROM admin_users WHERE email = 'cashier@test.brewhouze.local'")).admin_id);
      return {
        codeRequired: Boolean(challenge?.challenge), emailMasked: typeof challenge?.email === "string" && challenge.email.includes("•") && challenge.email.endsWith("@gmail.com"), challengeSaved: saved,
        wrongCode: { status: wrong.status, error: wrong.json?.error },
        sessionRecorded: Number((await one("SELECT COUNT(*)::int AS n FROM user_sessions WHERE admin_id = $1", [cashierId])).n) > 0,
        attendanceRecorded: Number((await one("SELECT COUNT(*)::int AS n FROM employee_time_logs WHERE admin_id = $1", [cashierId])).n) > 0,
        voidActorRecorded: Number((await one("SELECT COUNT(*)::int AS n FROM sales_orders WHERE order_id = $1 AND reversed_by_admin_id = $2 AND reversed_at IS NOT NULL", [state.saleOrder.orderId, cashierId])).n) === 1,
      };
    },
  },
]);
