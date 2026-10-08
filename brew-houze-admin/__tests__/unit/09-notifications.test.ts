import { vi } from "vitest";
import { unitCases } from "./harness";
import { setDb } from "./fake-db";
import { GET as notifications } from "@/app/api/notifications/route";

vi.mock("@/lib/db", () => import("./fake-db").then((m) => m.poolModule));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => undefined }) }));
vi.mock("@/lib/sessions", async (original) => ({ ...(await original<object>()), getSession: async () => ({ adminId: 1, role: "admin" }) }));

// Objective 9 (Admin Portal part). The admin's bell: alerts worked out from the records, filtered
// to what is still active (the queries keep only current or recent problems), worded by the route.
const at = (time: string) => `2026-10-08T${time}:00.000+08:00`;
async function bell(rules: Parameters<typeof setDb>[0]) {
  setDb(rules);
  const response = await notifications();
  return ((await response.json()).data as { kind: string; tone: string; title: string }[]).map((item) => ({ kind: item.kind, tone: item.tone, title: item.title }));
}

unitCases("admin", "Objective 9 - Notifications", [
  { id: "UT-NOT-07", fn: "GET /api/notifications", kind: "Positive", title: "a shift closed short is a danger alert with the amount", input: "Shift #7 closed ₱30.00 short",
    expected: [{ kind: "cash", tone: "danger", title: "Shift #7 closed ₱30.00 short" }], run: () => bell([[/FROM shift_summaries/, [{ shift_id: 7, cash_difference: "-30.00", closed_by_name: "Ana", at: at("22:00") }]]]) },
  { id: "UT-NOT-08", fn: "GET /api/notifications", kind: "Positive", title: "a shift closed over is a warning", input: "Shift #8 closed ₱1,250.50 over",
    expected: [{ kind: "cash", tone: "warning", title: "Shift #8 closed ₱1,250.50 over" }], run: () => bell([[/FROM shift_summaries/, [{ shift_id: 8, cash_difference: "1250.50", closed_by_name: "Ana", at: at("22:00") }]]]) },
  { id: "UT-NOT-09", fn: "GET /api/notifications", kind: "Positive", title: "a failed delivery not yet voided is a danger alert", input: "Order #12 failed: Customer not home",
    expected: [{ kind: "delivery", tone: "danger", title: "Order #12 could not be delivered" }],
    run: () => bell([[/FROM deliveries d/, [{ delivery_id: 55, order_id: 900, queue_number: 12, problem: "failed", failure_reason: "Customer not home", zone_name: "Poblacion", rider: "Ben", at: at("15:00") }]]]) },
  { id: "UT-NOT-10", fn: "GET /api/notifications", kind: "Positive", title: "alerts are listed newest first", input: "Stock alert 9:00, shift alert 22:00, delivery alert 15:00",
    expected: ["cash", "delivery", "stock"],
    run: async () => (await bell([
      [/low_stock_threshold/, [{ inventory_id: 11, item_name: "Fresh Milk", quantity: "0", low_stock_threshold: "500", unit_of_measure: "ml", at: at("09:00") }]],
      [/FROM shift_summaries/, [{ shift_id: 7, cash_difference: "-30.00", closed_by_name: "Ana", at: at("22:00") }]],
      [/FROM deliveries d/, [{ delivery_id: 55, order_id: 900, queue_number: 12, problem: "failed", failure_reason: "x", zone_name: "Poblacion", rider: null, at: at("15:00") }]],
    ])).map((item) => item.kind) },
  { id: "UT-NOT-11", fn: "GET /api/notifications", kind: "Boundary", title: "nothing to report gives an empty bell", input: "No active problems",
    expected: [], run: () => bell([]) },
]);
