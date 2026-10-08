import { afterEach, beforeEach, vi } from "vitest";
import { unitCases } from "./harness";
import { LIVE_TOPIC, signalChange } from "@/lib/realtime";

// Objective 9 (Staff Portal part). Live updates: when an order is placed, made, ready or handed
// over, the server sends a "something changed" signal through Supabase Realtime, and the queue
// screen, the customer's phone and the staff screens reload their own data. The signal carries
// only the kind of change, never order or customer data. Supabase is replaced by a fake fetch.
let fetch: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetch = vi.fn(async () => new Response("{}", { status: 202 }));
  vi.stubGlobal("fetch", fetch);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

// Sends the signal and waits for it to go out.
async function signal(...scopes: Parameters<typeof signalChange>) {
  signalChange(...scopes);
  await vi.waitFor(() => { if (fetch.mock.calls.length === 0) throw new Error("not sent yet"); }, { timeout: 200 }).catch(() => undefined);
  const [url, init] = (fetch.mock.calls[0] ?? []) as [string, RequestInit] | [];
  return { url, body: init ? JSON.parse(String(init.body)) : null };
}

unitCases("cashier", "Objective 9 - Notifications", [
  { id: "UT-NOT-01", fn: "signalChange", kind: "Positive", title: "an order-ready change is broadcast to the live screens", input: "signalChange(\"queue\")",
    expected: { url: "https://project.supabase.test/realtime/v1/api/broadcast", body: { messages: [{ topic: LIVE_TOPIC, event: "changed", payload: { scope: "queue" } }] } }, run: () => signal("queue") },
  { id: "UT-NOT-02", fn: "signalChange", kind: "Positive", title: "a checkout signals the queue, the counter line and stock together, in one request", input: "signalChange(\"queue\", \"line\", \"stock\")",
    expected: { requests: 1, scopes: ["queue", "line", "stock"] }, run: async () => { const sent = await signal("queue", "line", "stock"); return { requests: fetch.mock.calls.length, scopes: sent.body.messages.map((message: { payload: { scope: string } }) => message.payload.scope) }; } },
  { id: "UT-NOT-03", fn: "signalChange", kind: "Positive", title: "the payload holds only the kind of change (no order or customer data)", input: "signalChange(\"queue\")",
    expected: [["scope"]], run: async () => (await signal("queue")).body.messages.map((message: { payload: object }) => Object.keys(message.payload)) },
  { id: "UT-NOT-04", fn: "signalChange", kind: "Boundary", title: "nothing is sent when there is nothing to signal", input: "signalChange() with no scopes",
    expected: 0, run: async () => { await signal(); return fetch.mock.calls.length; } },
  { id: "UT-NOT-05", fn: "signalChange", kind: "Negative", title: "nothing is sent without the Supabase settings", input: "Supabase URL not set",
    expected: 0, run: async () => { vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", ""); await signal("queue"); return fetch.mock.calls.length; } },
  { id: "UT-NOT-06", fn: "signalChange", kind: "Negative", title: "Supabase being down never breaks the order (the screens catch up on their next refresh)", input: "fetch fails (network error)",
    expected: "no error", run: async () => { fetch.mockRejectedValueOnce(new TypeError("fetch failed")); await signal("queue"); await new Promise((resolve) => setTimeout(resolve, 10)); return "no error"; } },
]);
