import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { loadTestEnv } from "../integration/support/env";
import { PASSWORD } from "../integration/support/db";
import { AppUser, staff } from "../integration/support/http";

// Performance of the actions that write data (they cannot be load-tested on the live deployment):
// the production builds against the test database on one PC, several requests at a time. The
// target is under 3 seconds per request. Results: __tests__/results/performance-local.json.
loadTestEnv();
const TARGET_MS = 2000; // NFR 2: two seconds
const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

async function measure(name: string, total: number, concurrent: number, send: (i: number) => Promise<{ status: number; ms: number }>) {
  const times: number[] = []; let errors = 0; let next = 0;
  const started = Date.now();
  await Promise.all(Array.from({ length: concurrent }, async () => {
    while (next < total) { const i = next++; const r = await send(i); times.push(r.ms); if (r.status >= 400) errors++; }
  }));
  const sorted = [...times].sort((a, b) => a - b);
  const p = (q: number) => sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)];
  return { name, requests: total, concurrent, seconds: Math.round((Date.now() - started) / 100) / 10, averageMs: Math.round(times.reduce((a, b) => a + b, 0) / times.length), p95Ms: p(0.95), maxMs: sorted.at(-1), errors, errorRatePercent: Math.round((errors / total) * 10000) / 100 };
}

it("performance of order submission, queue sync and AI insights", async () => {
  const [cashier, admin] = await Promise.all([staff("cashier", "cashier"), staff("admin", "admin")]);
  await cashier.post("/api/shift", { action: "open", starting_cash: 1000, password: PASSWORD });
  // Enough beans for 100 more orders (the seed has 1 kg: about 55 Americanos).
  await admin.patch("/api/inventory", { inventory_id: 1, quantity_delta: 5000 });
  const phone = new AppUser("mobile");
  const results = [
    await measure("Mobile Menu: load the menu (GET /api/products)", 200, 20, () => phone.get("/api/products")),
    // 30 carts: the counter accepts at most 30 unchecked carts at a time (an anti-spam limit).
    await measure("QR order: send the cart to the counter (POST /api/counter-carts)", 30, 10, () => phone.post("/api/counter-carts", { items: [{ product_variant_id: 2, quantity: 1 }], service_type: "dine_in" })),
    await measure("POS: complete a cash order (POST /api/checkout)", 100, 10, () => cashier.post("/api/checkout", { items: [{ product_variant_id: 2, quantity: 1 }], payment_method: "cash", received_amount: 100, service_type: "dine_in" })),
    await measure("Queue sync: staff queue (GET /api/queue)", 200, 20, () => cashier.get("/api/queue")),
    await measure("Queue Screen: queue (GET /api/queue)", 200, 20, () => new AppUser("queue").get("/api/queue")),
    await measure("AI insights: one request to Claude (POST /api/insights)", 1, 1, () => admin.post("/api/insights", { action: "generate", start: today, end: today })),
    // Objective 9: the café's news on the menu (three promotions and an event showing).
    await (async () => {
      for (const title of ["Buy 1 Take 1 Americano", "Happy Hour Frappes", "New: Caramel Matcha"]) await admin.post("/api/promotions", { kind: "promo", title, message: "This week only." });
      await admin.post("/api/promotions", { kind: "event", title: "Acoustic Night", message: "Live music from 7 PM.", eventStartsAt: new Date(Date.now() + 86_400_000).toISOString() });
      return measure("Mobile Menu: promotions and events (GET /api/promotions)", 200, 20, () => phone.get("/api/promotions"));
    })(),
  ];
  const dir = path.join(process.cwd(), "__tests__", "results");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "performance-local.json"), JSON.stringify({ ranAt: new Date().toISOString(), targetMs: TARGET_MS, environment: "Production builds (next start) and PostgreSQL 17 on one Windows PC", results }, null, 2));
  console.table(results);
  for (const r of results) expect(r.errors, r.name).toBe(0);
});
